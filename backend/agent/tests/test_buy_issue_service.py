"""Private Buy issue persistence using synthetic isolated Django fixtures."""

import json
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError
from django.test import TestCase

from accounts.models import User
from agent.services.buy_issue_service import create_or_update_buy_issue
from issues.models import BuyIssue
from issues.services import create_buy_issue, update_buy_issue
from posts.models import Post


class BuyIssueServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="buy-a@example.com", name="Buyer A")
        cls.other = User.objects.create_user(email="buy-b@example.com", name="Buyer B")

    def issue(self, **overrides):
        data = {
            "user": self.user, "description": "Original private request",
            "min_budget": Decimal("5000.00"), "max_budget": Decimal("15000.00"),
            "preferences": {"preferred_makes": ["Toyota"]},
        }
        data.update(overrides)
        return BuyIssue.objects.create(**data)

    def test_authenticated_creation_is_private_and_uses_shared_helper(self):
        with patch("agent.services.buy_issue_service.create_buy_issue", wraps=create_buy_issue) as helper:
            result = create_or_update_buy_issue(
                "  Looking for a Camry  ", min_budget=5000, max_budget="15000.50",
                preferences={"preferred_makes": [" Toyota "], "vehicle_type": "used"}, user=self.user,
            )
        self.assertEqual(result["status"], "ok")
        helper.assert_called_once()
        saved = BuyIssue.objects.get(pk=result["ids"]["issue"]["id"])
        self.assertEqual(saved.user, self.user)
        self.assertEqual(saved.description, "Looking for a Camry")
        self.assertEqual(saved.max_budget, Decimal("15000.50"))
        self.assertEqual(saved.preferences["preferred_makes"], ["Toyota"])
        self.assertEqual(saved.status, BuyIssue.Status.OPEN)
        self.assertFalse(Post.objects.exists())

    def test_successful_owned_update_uses_explicit_target_and_shared_helper(self):
        saved = self.issue()
        unrelated = self.issue(description="Unrelated request")
        with patch("agent.services.buy_issue_service.update_buy_issue", wraps=update_buy_issue) as helper:
            result = create_or_update_buy_issue(
                "Updated request", max_budget=Decimal("16000.25"),
                preferences={"preferred_models": ["Camry"]}, user=self.user, buy_issue_id=saved.id,
            )
        helper.assert_called_once()
        self.assertEqual(result["status"], "ok")
        saved.refresh_from_db()
        unrelated.refresh_from_db()
        self.assertEqual(saved.max_budget, Decimal("16000.25"))
        self.assertEqual(saved.min_budget, Decimal("5000.00"))
        self.assertEqual(saved.preferences, {"preferred_models": ["Camry"]})
        self.assertEqual(unrelated.description, "Unrelated request")
        self.assertEqual(BuyIssue.objects.count(), 2)

    def test_invalid_description_has_no_writes(self):
        for description in (None, "", " \t\n ", 123, True, [], {}, "bad\x00text"):
            with self.subTest(description=description):
                result = create_or_update_buy_issue(description, user=self.user)
                self.assertEqual(result["status"], "error")
        self.assertFalse(BuyIssue.objects.exists())

    def test_missing_description_is_a_structured_error(self):
        result = create_or_update_buy_issue(user=self.user)
        self.assertEqual(result["status"], "error")
        self.assertFalse(BuyIssue.objects.exists())

    def test_invalid_money_is_rejected_for_either_budget(self):
        bad_values = [
            True, False, -1, "-0.01", "bad", "", "   ", "NaN", "sNaN", "Infinity", "-Infinity",
            Decimal("NaN"), Decimal("Infinity"), Decimal("-1"), 1000.0, 1000.5,
            float("nan"), float("inf"), object(), [], {}, "1.001", "10000000000.00",
        ]
        for name in ("min_budget", "max_budget"):
            for value in bad_values:
                with self.subTest(name=name, value=repr(value)):
                    result = create_or_update_buy_issue("Need a car", user=self.user, **{name: value})
                    self.assertEqual(result["status"], "error")
        self.assertFalse(BuyIssue.objects.exists())

    def test_budget_range_and_partial_update_are_validated_against_saved_values(self):
        saved = self.issue()
        before = BuyIssue.objects.values().get(pk=saved.pk)
        created = create_or_update_buy_issue("Need a car", min_budget=100, max_budget=10, user=self.user)
        updated = create_or_update_buy_issue(
            "Updated", max_budget=4000, user=self.user, buy_issue_id=saved.id,
        )
        self.assertEqual(created["status"], "error")
        self.assertEqual(updated["status"], "error")
        self.assertEqual(BuyIssue.objects.values().get(pk=saved.pk), before)

    def test_zero_equal_and_maximum_supported_budgets(self):
        for value in (0, Decimal("10.25"), "9999999999.99"):
            with self.subTest(value=value):
                result = create_or_update_buy_issue(
                    "Need a car", min_budget=value, max_budget=value, user=self.user,
                )
                self.assertEqual(result["status"], "ok")
                saved = BuyIssue.objects.get(pk=result["data"]["id"])
                self.assertEqual(saved.min_budget, Decimal(str(value)))
                self.assertEqual(saved.min_budget, saved.max_budget)

    def test_all_supported_preferences_are_normalized(self):
        preferences = {
            "preferred_makes": ["Toyota"], "preferred_models": ["Camry"],
            "minimum_year": 2020, "maximum_mileage": 60000,
            "vehicle_type": "used", "fuel_type": " hybrid ", "location": " Austin, TX ",
        }
        original = json.loads(json.dumps(preferences))
        result = create_or_update_buy_issue("Need a car", preferences=preferences, user=self.user)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["preferences"]["location"], "Austin, TX")
        self.assertEqual(result["data"]["preferences"]["fuel_type"], "hybrid")
        self.assertEqual(preferences, original)

    def test_malformed_or_non_json_preferences_are_rejected_without_writes(self):
        bad_preferences = [
            [], "Toyota", 42, True, {"unknown": 1}, {"preferred_makes": "Toyota"},
            {"preferred_models": [None]}, {"preferred_makes": ("Toyota",)},
            {"minimum_year": 2020.5}, {"minimum_year": 1899},
            {"minimum_year": date.today().year + 2}, {"maximum_mileage": -1},
            {"maximum_mileage": True}, {"vehicle_type": "either"}, {"vehicle_type": []},
            {"location": object()}, {"location": "x" * 256},
            {"maximum_mileage": Decimal("100")}, {"location": {"nested": {1, 2}}},
            {"maximum_mileage": float("nan")}, {1: "bad"},
        ]
        for preferences in bad_preferences:
            with self.subTest(preferences=repr(preferences)):
                result = create_or_update_buy_issue("Need a car", preferences=preferences, user=self.user)
                self.assertEqual(result["status"], "error")
        self.assertFalse(BuyIssue.objects.exists())

    def test_missing_foreign_or_malformed_target_has_same_error_and_no_creation(self):
        foreign = self.issue(user=self.other)
        before = list(BuyIssue.objects.values())
        responses = [create_or_update_buy_issue("Update", user=self.user, buy_issue_id=target)
                     for target in (foreign.id, uuid4(), "bad", "", 123, True)]
        for result in responses:
            self.assertEqual(result, responses[0])
            self.assertEqual(result["error"], "Buy issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertEqual(list(BuyIssue.objects.values()), before)

    def test_unauthenticated_inactive_or_unsaved_users_cannot_write(self):
        inactive = User.objects.create_user(email="inactive-buyer@example.com", name="Inactive", is_active=False)
        for user in (None, AnonymousUser(), inactive, {"user_id": str(self.user.id)},
                     User(email="unsaved@example.com", name="Unsaved")):
            with self.subTest(user=user):
                result = create_or_update_buy_issue("Need a car", user=user)
                self.assertEqual(result["status"], "error")
        self.assertFalse(BuyIssue.objects.exists())

    def test_stale_active_user_is_rejected_after_database_deactivation(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        result = create_or_update_buy_issue("Need a car", user=self.user)
        self.assertEqual(result["error"], "Authentication is required.")
        self.assertFalse(BuyIssue.objects.exists())

    def test_ownership_spoofing_is_not_an_accepted_argument_or_preference(self):
        for field in ("user_id", "owner_id", "owner", "status"):
            with self.subTest(field=field):
                with self.assertRaises(TypeError):
                    create_or_update_buy_issue("Need a car", user=self.user, **{field: str(self.other.id)})
                result = create_or_update_buy_issue(
                    "Need a car", user=self.user, preferences={field: str(self.other.id)},
                )
                self.assertEqual(result["status"], "error")
        self.assertFalse(BuyIssue.objects.exists())

    def test_omitted_optionals_are_preserved_and_explicit_null_clears(self):
        saved = self.issue()
        result = create_or_update_buy_issue("Updated", user=self.user, buy_issue_id=saved.id)
        self.assertEqual(result["data"]["min_budget"], "5000.00")
        self.assertEqual(result["data"]["preferences"], {"preferred_makes": ["Toyota"]})
        result = create_or_update_buy_issue(
            "Cleared", min_budget=None, max_budget=None, preferences=None,
            user=self.user, buy_issue_id=saved.id,
        )
        self.assertEqual(result["status"], "ok")
        saved.refresh_from_db()
        self.assertIsNone(saved.min_budget)
        self.assertIsNone(saved.max_budget)
        self.assertIsNone(saved.preferences)

    def test_invalid_update_does_not_change_any_saved_fields_or_timestamps(self):
        saved = self.issue()
        before = BuyIssue.objects.values().get(pk=saved.pk)
        result = create_or_update_buy_issue(
            "Should not persist", max_budget="NaN", user=self.user, buy_issue_id=saved.id,
        )
        self.assertEqual(result["status"], "error")
        self.assertEqual(BuyIssue.objects.values().get(pk=saved.pk), before)

    def test_database_failure_rolls_back_shared_helper_write(self):
        saved = self.issue()
        before = BuyIssue.objects.values().get(pk=saved.pk)
        with patch("agent.services.buy_issue_service.update_buy_issue") as helper:
            helper.side_effect = [DatabaseError("PRIVATE SQL")]
            result = create_or_update_buy_issue("Update", user=self.user, buy_issue_id=saved.id)
        self.assertEqual(result["status"], "error")
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(BuyIssue.objects.values().get(pk=saved.pk), before)

    def test_serialization_failure_after_write_rolls_back_transaction(self):
        saved = self.issue()
        before = BuyIssue.objects.values().get(pk=saved.pk)
        with patch("agent.services.buy_issue_service.tool_result", side_effect=TypeError("PRIVATE detail")):
            result = create_or_update_buy_issue("Changed", user=self.user, buy_issue_id=saved.id)
        self.assertEqual(result["status"], "error")
        self.assertEqual(BuyIssue.objects.values().get(pk=saved.pk), before)

    def test_structured_output_is_json_safe_private_and_coordinator_compatible(self):
        result = create_or_update_buy_issue("Need a car", max_budget=Decimal("12345.67"), user=self.user)
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(result["ids"]["issue"], {"type": "buy", "id": result["data"]["id"]})
        self.assertEqual(result["data"]["max_budget"], "12345.67")
        self.assertEqual(result["provenance"], "own_buy_issues")
        self.assertNotIn("user", result["data"])
        self.assertNotIn("owner", result["data"])
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertFalse(Post.objects.exists())
