"""Safe insufficient-evidence behavior with actual private ownership and Agent 2 shapes."""

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.seller_price_service import recommend_asking_price
from agent.services.valuation_service import estimate
from agent.tools.result import tool_result
from issues.models import SellIssue
from posts.models import Post
from vehicles.models import UsedCar


class SellerPriceServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="seller-price@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.foreign_car = UsedCar.objects.create(owner=cls.other, make="PRIVATE", model="PRIVATE", year=2021, mileage=30000)
        cls.issue = SellIssue.objects.create(user=cls.user, used_car=cls.car, description="PRIVATE sale", asking_price=10000,
                                            contact_info={"email": "PRIVATE-contact@example.com"})
        cls.foreign = SellIssue.objects.create(user=cls.other, used_car=cls.foreign_car, description="PRIVATE sale")

    def advice(self, context=None, **kwargs):
        return recommend_asking_price(self.issue.pk, context, **{"user": self.user, **kwargs})

    def context(self):
        # Actual pure Agent 2 output, with explicitly synthetic source IDs. A
        # correct shape still cannot authenticate its origin at this boundary.
        data = estimate([{"post_id": str(uuid4()), "asking_price": Decimal(price)}
                         for price in ("10000.01", "12000.03", "14000.05")])
        return tool_result("ok", data=data, ids={"used_car_id": str(self.car.pk), "post_ids": data["comparable_post_ids"]},
                           provenance="published_sell_posts")

    def assert_insufficient(self, result):
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["data"]["status"], "insufficient_data")
        for key in ("suggested_asking_price", "low", "median", "high", "currency"):
            self.assertIsNone(result["data"][key])
        self.assertEqual(result["data"]["sample_size"], 0)
        self.assertEqual(result["data"]["comparable_post_ids"], [])
        self.assertEqual(result["ids"]["post_ids"], [])

    def test_authenticated_owner_gets_structured_safe_advice(self):
        result = self.advice()
        self.assert_insufficient(result)
        self.assertEqual(result["ids"]["issue"], {"type": "sell", "id": str(self.issue.pk)})
        self.assertEqual(result["ids"]["used_car_id"], str(self.car.pk))
        self.assertEqual(result["provenance"], "own_sell_issues")
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_authentication_and_untrusted_identity_rejected(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, SimpleNamespace(state={"user_id": str(self.user.pk)}), User(email="unsaved@example.com")):
            self.assertEqual(self.advice(user=user)["error"], "Authentication is required.")
        self.assertEqual(recommend_asking_price(self.issue.pk)["error"], "Authentication is required.")

    def test_stale_inactive_identity_rejected(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.advice()["error"], "Authentication is required.")

    def test_foreign_missing_invalid_identifiers_same_safe_error(self):
        results = [recommend_asking_price(key, user=self.user)
                   for key in (self.foreign.pk, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Sell issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})

    def test_vehicle_ownership_and_staff_no_override(self):
        self.assertEqual(self.advice(user=self.other)["error"], "Sell issue not found.")
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(self.advice()["error"], "Sell issue not found.")

    def test_uuid_string(self):
        self.assert_insufficient(recommend_asking_price(str(self.issue.pk), user=self.user))

    def test_genuine_plain_agent2_shape_is_not_authenticated_evidence(self):
        context = self.context()
        self.assertEqual(context["data"]["status"], "completed")
        self.assertEqual(context["data"]["median"], "12000.03")
        self.assert_insufficient(self.advice(context))

    def test_forged_provenance_matching_id_and_currency_do_not_enable_prices(self):
        context = self.context()
        context["data"]["currency"] = "USD"
        context["verified"] = True
        self.assert_insufficient(self.advice(context))

    def test_insufficient_or_absent_valuation_no_fallback(self):
        data = estimate([])
        self.assert_insufficient(self.advice(tool_result("insufficient_data", data=data)))
        self.assert_insufficient(self.advice())

    def test_malformed_negative_nonfinite_and_inconsistent_values_not_promoted(self):
        for value in (None, {}, [], "model-generated", True, object(),
                      {"low": "-1", "median": "NaN", "high": "Infinity"},
                      {"status": "completed", "low": "100", "median": "1", "high": "0", "sample_size": 100}):
            self.assert_insufficient(self.advice(value))

    def test_wrong_vehicle_and_currency_not_used(self):
        for currency in (None, "USD", "EUR", "unsupported"):
            context = self.context()
            context["ids"]["used_car_id"] = str(self.foreign_car.pk)
            context["data"]["currency"] = currency
            self.assert_insufficient(self.advice(context))

    def test_msrp_and_existing_price_never_substitute_for_evidence(self):
        self.assert_insufficient(self.advice({"status": "completed", "msrp_reference": {"msrp": "30000.00"}}))
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.asking_price, Decimal("10000.00"))

    def test_no_unsupported_adjustments_or_completed_sale_claim(self):
        result = self.advice(self.context())
        self.assert_insufficient(result)
        text = " ".join(result["data"]["limitations"])
        self.assertIn("not verified completed-sale prices", text)
        self.assertIn("No condition, mileage", text)

    def test_read_only_no_comparable_search_no_agent_or_network(self):
        before = (list(SellIssue.objects.values()), list(UsedCar.objects.values()))
        with patch("socket.socket.connect", side_effect=AssertionError("No network")) as network:
            with patch("agent.services.value_range_service.calculate_value_range") as valuation:
                with patch("agent.services.post_search_service.search_comparable_posts") as search:
                    with patch("agent.agents.valuation.calculate_value_range") as agent:
                        with CaptureQueriesContext(connection) as queries:
                            self.assert_insufficient(self.advice())
                        agent.assert_not_called()
                    search.assert_not_called()
                valuation.assert_not_called()
            network.assert_not_called()
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(len(queries), 2)
        self.assertFalse(any('"posts"' in q["sql"] for q in queries))
        self.assertEqual(before, (list(SellIssue.objects.values()), list(UsedCar.objects.values())))
        self.assertFalse(Post.objects.exists())

    def test_private_context_and_forged_sources_not_echoed(self):
        result = self.advice({"contact_info": "PRIVATE contact", "post_ids": [str(self.foreign.pk)], "limitations": ["PRIVATE"]})
        text = json.dumps(result)
        self.assertNotIn("PRIVATE", text)
        self.assertNotIn(str(self.other.pk), text)
        self.assertNotIn(str(self.foreign.pk), text)

    def test_deterministic_result_and_context_unchanged(self):
        context = self.context()
        before = json.dumps(context, sort_keys=True)
        self.assertEqual(self.advice(context), self.advice(context))
        self.assertEqual(before, json.dumps(context, sort_keys=True))

    def test_database_failure_safe(self):
        with patch.object(SellIssue.objects, "filter", side_effect=DatabaseError("PRIVATE SQL")):
            result = self.advice()
        self.assertEqual(result["error"], "Seller pricing advice is unavailable.")
        self.assertIsNone(result["data"])
        self.assertNotIn("PRIVATE", json.dumps(result))
