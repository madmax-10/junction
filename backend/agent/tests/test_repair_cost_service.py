"""Current contract limitations tested with real isolated users, issues and Posts."""

import json
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import User
from agent.services.repair_cost_service import estimate_repair_cost
from issues.models import RepairIssue
from posts.models import Post
from posts.validation import normalize_post_data
from rest_framework.exceptions import ValidationError
from vehicles.models import UsedCar


class RepairCostServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="cost@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.issue = RepairIssue.objects.create(
            user=cls.user, used_car=cls.car, description="Brakes grinding",
            symptoms={"confirmed": ["Brakes grinding"]},
            ai_analysis={"possibilities": [{"cause": "Worn pads", "uncertainty": "Unverified"}]},
        )
        cls.foreign = RepairIssue.objects.create(user=cls.other, used_car=cls.car, description="PRIVATE report")

    def estimate(self, **kwargs):
        return estimate_repair_cost(self.issue.id, **{"user": self.user, **kwargs})

    def post(self, cost="123.45", **kwargs):
        return Post.objects.create(**{
            "issue_id": uuid4(), "issue_type": "repair", "title": "Brakes grinding",
            "content": "Owner expense", "status": "published", "approved_at": timezone.now(),
            "post_data": {"owner_reported": True, "make": "Toyota", "model": "Camry",
                          "method": "mechanic", "work_performed": "Pads replaced", "cost": cost},
            **kwargs,
        })

    def assert_insufficient(self, result):
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["data"]["status"], "insufficient_data")
        for field in ("currency", "low", "median", "high", "evidence_type"):
            self.assertIsNone(result["data"][field])
        self.assertEqual(result["data"]["evidence_count"], 0)
        self.assertEqual(result["data"]["source_post_ids"], [])
        self.assertEqual(result["ids"]["post_ids"], [])

    def test_authenticated_safe_result_uses_shared_contract(self):
        result = self.estimate()
        self.assert_insufficient(result)
        self.assertEqual(result["ids"]["issue"], {"type": "repair", "id": str(self.issue.pk)})
        self.assertEqual(result["data"]["id"], str(self.issue.pk))
        self.assertEqual(result["provenance"], "own_repair_issues")
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertIsNone(result["error"])

    def test_private_missing_malformed_ids_share_generic_error(self):
        results = [estimate_repair_cost(key, user=self.user)
                   for key in (self.foreign.pk, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Repair issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(results))

    def test_authentication_required(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, User(email="unsaved@example.com")):
            self.assertEqual(self.estimate(user=user)["error"], "Authentication is required.")
        self.assertEqual(estimate_repair_cost(self.issue.pk)["status"], "error")

    def test_inactive_stale_identity(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.estimate()["error"], "Authentication is required.")

    def test_vehicle_owner_and_staff_checks(self):
        self.assertEqual(self.estimate(user=self.other)["error"], "Repair issue not found.")
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(self.estimate()["error"], "Repair issue not found.")

    def test_uuid_string_supported(self):
        self.assert_insufficient(estimate_repair_cost(str(self.issue.pk), user=self.user))

    def test_published_costs_cannot_supply_missing_contract(self):
        for cost in ("100.01", "200.03", "300.05"):
            self.post(cost)
        self.assert_insufficient(self.estimate())

    def test_no_unpublished_or_nonrepair_prices_used(self):
        for status in ("draft", "approved", "archived"):
            self.post(status=status)
        for issue_type in ("buy", "sell"):
            self.post(issue_type=issue_type)
        self.post(approved_at=None)
        self.assert_insufficient(self.estimate())

    def test_missing_malformed_zero_negative_nonfinite_and_float_costs(self):
        for cost in (None, "", "bad", "NaN", "Infinity", "-1", "0", True, {}, [], 123.45):
            self.post(cost)
        self.post(post_data={"owner_reported": True})
        self.assert_insufficient(self.estimate())

    def test_currency_and_complete_scope_are_not_supported_public_keys(self):
        for key, value in (("currency", "USD"), ("currency", "EUR"), ("cost_scope", "complete")):
            with self.assertRaises(ValidationError):
                normalize_post_data("repair", self.issue.pk, {"owner_reported": True, "cost": 100, key: value}, publishing=True)

    def test_injected_currency_or_scope_cannot_enable_estimate(self):
        for currency in ("USD", "EUR", "JPY"):
            self.post(post_data={"owner_reported": True, "cost": "100.01", "currency": currency, "cost_scope": "complete"})
        self.assert_insufficient(self.estimate())

    def test_single_duplicate_and_decimal_prices_never_form_range(self):
        self.post("123.4567890123456789")
        self.assert_insufficient(self.estimate())
        self.post("123.4567890123456789")
        self.assert_insufficient(self.estimate())

    def test_different_procedures_and_partial_costs_not_combined(self):
        for work in ("Labor only for pads", "Parts only for pads", "Alternator replacement"):
            self.post(post_data={"owner_reported": True, "cost": "100.01", "work_performed": work})
        self.assert_insufficient(self.estimate())

    def test_missing_symptoms_and_ai_hypothesis_not_confirmed_procedure(self):
        RepairIssue.objects.filter(pk=self.issue.pk).update(symptoms=None)
        result = self.estimate()
        self.assert_insufficient(result)
        self.assertIn("do not establish a confirmed", " ".join(result["data"]["limitations"]))

    def test_documented_resolution_still_cannot_supply_public_pricing_contract(self):
        RepairIssue.objects.filter(pk=self.issue.pk).update(
            status="resolved", resolution_details={"method": "mechanic", "work_performed": "Pads replaced", "cost": 200},
            resolved_at=timezone.now(),
        )
        self.post(200)
        self.assert_insufficient(self.estimate())

    def test_read_only_private_state_and_no_network(self):
        self.post()
        before = (list(RepairIssue.objects.values()), list(UsedCar.objects.values()), list(Post.objects.values()))
        with patch("socket.socket.connect", side_effect=AssertionError("No external calls")) as network:
            with CaptureQueriesContext(connection) as queries:
                self.assert_insufficient(self.estimate())
            network.assert_not_called()
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(len(queries), 2)
        self.assertEqual(before, (list(RepairIssue.objects.values()), list(UsedCar.objects.values()), list(Post.objects.values())))

    def test_private_fields_excluded_and_safety_caution_present(self):
        self.post(content="PRIVATE contact", post_data={"owner_reported": True, "cost": 100, "contact": "PRIVATE"})
        result = self.estimate()
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn(str(self.car.pk), json.dumps(result))
        self.assertIn("driving safety", " ".join(result["data"]["limitations"]))
        self.assertIn("smoke/fire", " ".join(result["data"]["limitations"]))

    def test_deterministic_results(self):
        self.assertEqual(self.estimate(), self.estimate())

    def test_invalid_saved_analysis_is_safe_error(self):
        RepairIssue.objects.filter(pk=self.issue.pk).update(ai_analysis={"possibilities": [{}]})
        self.assertEqual(self.estimate()["error"], "Invalid saved repair diagnosis data.")

    def test_database_failure_is_generic(self):
        with patch.object(RepairIssue.objects, "filter", side_effect=DatabaseError("PRIVATE SQL")):
            result = self.estimate()
        self.assertEqual(result["error"], "Repair cost evidence is unavailable.")
        self.assertNotIn("PRIVATE", json.dumps(result))
