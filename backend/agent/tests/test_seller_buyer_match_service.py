"""Public Buy snapshot matching; real publication flow and no private buyer reads."""

import json
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID, uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import User
from agent.services.seller_buyer_match_service import find_and_rank_buyers
from issues.models import BuyIssue, SellIssue
from posts.models import Post
from posts.services import approve_post, generate_post
from vehicles.models import UsedCar


class SellerBuyerMatchServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="seller-match@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.issue = SellIssue.objects.create(user=cls.user, used_car=cls.car, description="PRIVATE sale", asking_price=10000,
                                            contact_info={"email": "PRIVATE-contact@example.com"})
        cls.foreign = SellIssue.objects.create(user=cls.other, used_car=cls.car, description="PRIVATE sale")

    def post(self, data=None, **changes):
        return Post.objects.create(**{
            "issue_id": uuid4(), "issue_type": "buy", "status": "published", "approved_at": timezone.now(),
            "title": "Public interest", "content": "Not returned", "post_data": {"preferred_makes": ["Toyota"], "preferred_models": ["Camry"]} if data is None else data,
            **changes,
        })

    def search(self, **kwargs):
        return find_and_rank_buyers(self.issue.pk, **{"user": self.user, **kwargs})

    def test_real_supported_buy_publication_workflow(self):
        issue = BuyIssue.objects.create(user=self.other, description="PRIVATE source description",
                                        preferences={"preferred_makes": ["Toyota"], "preferred_models": ["Camry"], "minimum_year": 2019})
        draft = generate_post(self.other, "buy", issue.pk)
        self.assertEqual(self.search()["status"], "no_results")
        published = approve_post(self.other, draft.pk)
        result = self.search()
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["ids"]["post_ids"], [str(published.pk)])
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(result["data"]["matches"][0]["provenance"], "published_buy_post_interest")

    def test_missing_and_untrusted_identity(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, SimpleNamespace(state={"user_id": str(self.user.pk)}), User(email="unsaved@example.com")):
            self.assertEqual(self.search(user=user)["error"], "Authentication is required.")
        self.assertEqual(find_and_rank_buyers(self.issue.pk)["error"], "Authentication is required.")

    def test_inactive_stale_user(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.search()["error"], "Authentication is required.")

    def test_foreign_missing_malformed_issue_identical_errors(self):
        results = [find_and_rank_buyers(key, user=self.user) for key in (self.foreign.pk, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Sell issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})

    def test_car_ownership_and_staff_no_override(self):
        self.assertEqual(self.search(user=self.other)["error"], "Sell issue not found.")
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(self.search()["error"], "Sell issue not found.")

    def test_uuid_string(self):
        self.assertEqual(find_and_rank_buyers(str(self.issue.pk), user=self.user)["status"], "no_results")

    def test_invalid_limits(self):
        for limit in (0, -1, 11, True, False, 1.0, "5", None, [], {}):
            self.assertEqual(self.search(limit=limit)["error"], "limit must be an integer between 1 and 10.")

    def test_only_published_approved_buy_records(self):
        for status in ("draft", "approved", "archived", "rejected", "withdrawn", "unpublished"):
            self.post(status=status)
        self.post(approved_at=None)
        self.post(issue_type="sell")
        self.post(issue_type="repair")
        good = self.post()
        self.assertEqual(self.search()["ids"]["post_ids"], [str(good.pk)])

    def test_private_buy_issues_are_never_matching_source(self):
        BuyIssue.objects.create(user=self.other, description="PRIVATE buyer", preferences={"preferred_makes": ["Toyota"]})
        with CaptureQueriesContext(connection) as queries:
            result = self.search()
        self.assertEqual(result["status"], "no_results")
        self.assertFalse(any('"buy_issues"' in q["sql"] for q in queries))
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_matching_preferences_case_insensitive_exact(self):
        good = self.post({"preferred_makes": [" toyota "], "preferred_models": ["camry", "Corolla"]})
        self.post({"preferred_makes": ["Honda"]})
        self.post({"preferred_models": ["Camry Hybrid"]})
        self.assertEqual(self.search()["ids"]["post_ids"], [str(good.pk)])

    def test_year_and_mileage_requirements(self):
        good = self.post({"minimum_year": 2020, "maximum_mileage": 40000})
        self.post({"minimum_year": 2021})
        self.post({"maximum_mileage": 39999})
        self.assertEqual(self.search()["ids"]["post_ids"], [str(good.pk)])

    def test_new_vehicle_interest_excluded_and_empty_criteria_skipped(self):
        self.post({"vehicle_type": "new"})
        self.post({})
        self.post({"min_budget": 10000})
        used = self.post({"vehicle_type": "used"})
        self.assertEqual(self.search()["ids"]["post_ids"], [str(used.pk)])

    def test_budget_and_unsupported_attributes_not_used_or_disclosed(self):
        self.post({"preferred_makes": ["Toyota"], "min_budget": 1, "max_budget": 2,
                   "fuel_type": "diesel", "location": "PRIVATE location", "contact": {"email": "PRIVATE@example.com"}})
        result = self.search()
        self.assertEqual(result["status"], "ok")
        requirements = result["data"]["matches"][0]["public_requirements"]
        self.assertEqual(requirements, {"preferred_makes": ["Toyota"]})
        self.assertIn("Budgets are not compared", " ".join(result["data"]["limitations"]))
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_optional_missing_fields_and_invalid_matching_data(self):
        for data in ({"preferred_makes": "Toyota"}, {"minimum_year": True}, {"maximum_mileage": -1}, {"vehicle_type": "invalid"}):
            self.post(data)
        good = self.post({"preferred_models": ["Camry"]})
        self.assertEqual(self.search()["ids"]["post_ids"], [str(good.pk)])

    def test_ranking_make_then_model_then_year_then_mileage(self):
        make = self.post({"preferred_makes": ["Toyota"]})
        model = self.post({"preferred_models": ["Camry"], "minimum_year": 2019})
        both = self.post({"preferred_makes": ["Toyota"], "preferred_models": ["Camry"]})
        full = self.post({"preferred_makes": ["Toyota"], "preferred_models": ["Camry"], "minimum_year": 2020, "maximum_mileage": 40000})
        self.assertEqual(self.search()["ids"]["post_ids"], [str(full.pk), str(both.pk), str(make.pk), str(model.pk)])

    def test_stable_tiebreak_and_limit(self):
        for number in range(12, 0, -1):
            self.post(id=UUID(int=number))
        first = self.search(limit=3)
        self.assertEqual(first, self.search(limit=3))
        self.assertEqual(first["ids"]["post_ids"], [str(UUID(int=n)) for n in (1, 2, 3)])
        self.assertEqual(first["data"]["result_count"], 3)
        self.assertEqual(self.search(limit=10)["data"]["result_count"], 10)

    def test_empty_supported_source_is_no_results_not_unavailable(self):
        result = self.search()
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["matches"], [])
        self.assertEqual(result["data"]["result_count"], 0)
        self.assertEqual(result["provenance"], "published_buy_posts")

    def test_safe_projection_no_contact_identity_or_source_issue(self):
        self.post({"preferred_makes": ["Toyota"], "contact": {"phone": "PRIVATE phone"}, "user_id": str(self.other.pk)},
                  title="PRIVATE title", content="PRIVATE text")
        result = self.search()
        text = json.dumps(result)
        self.assertNotIn("PRIVATE", text)
        self.assertNotIn(str(self.other.pk), text)
        self.assertEqual(set(result["data"]["matches"][0]), {"post_id", "public_requirements", "reasons", "provenance"})

    def test_read_only_no_contact_valuation_or_external_calls(self):
        self.post()
        before = (list(SellIssue.objects.values()), list(UsedCar.objects.values()), list(Post.objects.values()))
        with patch("socket.socket.connect", side_effect=AssertionError("No network")) as network:
            with patch("agent.services.post_contact_service.get_post_contact") as contact:
                with patch("agent.services.value_range_service.calculate_value_range") as valuation:
                    with CaptureQueriesContext(connection) as queries:
                        result = self.search()
                    valuation.assert_not_called()
                contact.assert_not_called()
            network.assert_not_called()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(len(queries), 3)
        self.assertIn("LIMIT 500", queries[-1]["sql"])
        self.assertNotIn("contact", queries[-1]["sql"])
        self.assertEqual(before, (list(SellIssue.objects.values()), list(UsedCar.objects.values()), list(Post.objects.values())))

    def test_shared_result_is_json_safe(self):
        self.post()
        result = self.search()
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertTrue(result["data"]["matches"][0]["reasons"])
        self.assertIn("not verified buyer identities", " ".join(result["data"]["limitations"]))

    def test_database_failure_distinct_from_empty(self):
        with patch.object(Post.objects, "filter", side_effect=DatabaseError("PRIVATE SQL")):
            result = self.search()
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"], "Public buyer-interest search is unavailable.")
        self.assertIsNone(result["data"])
        self.assertNotIn("PRIVATE", json.dumps(result))
