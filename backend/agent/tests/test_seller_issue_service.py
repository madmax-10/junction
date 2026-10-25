"""Isolated private Seller persistence tests with real models and authorization."""

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import User
from agent.services.seller_issue_service import create_or_update_sell_issue
from issues.models import BuyIssue, RepairIssue, SellIssue
from issues.services import create_sell_issue, update_sell_issue
from posts.models import Post
from vehicles.models import UsedCar


class SellerIssueServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="sell-issue@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.second_car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Corolla", year=2021, mileage=30000)
        cls.foreign_car = UsedCar.objects.create(owner=cls.other, make="PRIVATE make", model="PRIVATE model", year=2020, mileage=20000)
        cls.issue = SellIssue.objects.create(user=cls.user, used_car=cls.car, description="Original private sale",
                                            asking_price=10000, condition_details={"mechanical": "Runs"}, known_damage="Scratched",
                                            location="Austin", contact_info={"email": "PRIVATE-contact@example.com"})
        cls.foreign = SellIssue.objects.create(user=cls.other, used_car=cls.foreign_car, description="PRIVATE sale")

    def save(self, details=None, **kwargs):
        return create_or_update_sell_issue(self.car.pk, {"description": "Owner wants to sell"} if details is None else details,
                                           **{"user": self.user, **kwargs})

    def test_create_reuses_helper_and_owned_car(self):
        with patch("agent.services.seller_issue_service.create_sell_issue", wraps=create_sell_issue) as helper:
            result = self.save()
        helper.assert_called_once()
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["action"], "created")
        saved = SellIssue.objects.get(pk=result["data"]["id"])
        self.assertEqual(saved.user, self.user)
        self.assertEqual(saved.used_car, self.car)
        self.assertEqual(saved.status, SellIssue.Status.OPEN)
        self.assertIsNone(saved.asking_price)

    def test_update_reuses_helper_and_same_identifier(self):
        with patch("agent.services.seller_issue_service.update_sell_issue", wraps=update_sell_issue) as helper:
            result = self.save({"description": "Updated sale"}, sell_issue_id=self.issue.pk)
        helper.assert_called_once()
        self.assertEqual(result["data"]["action"], "updated")
        self.assertEqual(result["data"]["id"], str(self.issue.pk))
        self.assertEqual(SellIssue.objects.count(), 2)

    def test_missing_untrusted_and_unsaved_authentication(self):
        before = list(SellIssue.objects.values())
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, SimpleNamespace(state={"user_id": str(self.user.pk)}), User(email="unsaved@example.com")):
            self.assertEqual(self.save(user=user)["error"], "Authentication is required.")
        self.assertEqual(create_or_update_sell_issue(self.car.pk, {"description": "Sale"})["error"], "Authentication is required.")
        self.assertEqual(before, list(SellIssue.objects.values()))

    def test_stale_inactive_account(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.save()["error"], "Authentication is required.")

    def test_foreign_missing_malformed_vehicles_same_error(self):
        results = [create_or_update_sell_issue(key, {"description": "Sale"}, user=self.user)
                   for key in (self.foreign_car.pk, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Vehicle not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})

    def test_foreign_missing_malformed_issues_same_error_no_create(self):
        before = list(SellIssue.objects.values())
        results = [self.save(sell_issue_id=key) for key in (self.foreign.pk, uuid4(), "bad", "", True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Sell issue not found.")
        self.assertEqual(before, list(SellIssue.objects.values()))

    def test_issue_vehicle_mismatch_even_with_both_owned(self):
        result = create_or_update_sell_issue(self.second_car.pk, {"description": "Wrong car"}, self.issue.pk, user=self.user)
        self.assertEqual(result["error"], "Sell issue not found.")

    def test_staff_no_override_and_transferred_car_denied(self):
        self.assertEqual(self.save(user=self.other)["error"], "Vehicle not found.")
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(self.save(sell_issue_id=self.issue.pk)["error"], "Vehicle not found.")

    def test_uuid_strings(self):
        result = create_or_update_sell_issue(str(self.car.pk), {"location": "Dallas"}, str(self.issue.pk), user=self.user)
        self.assertEqual(result["status"], "ok")

    def test_all_supported_seller_fields_normalized_privately(self):
        result = self.save({"description": "  Toyota for sale  ", "asking_price": Decimal("12345.67"),
                            "condition_details": {"mechanical": "  Runs normally  "}, "known_damage": "  Dent  ",
                            "location": "  Austin  ", "contact_info": {"email": "seller@example.com"}})
        saved = SellIssue.objects.get(pk=result["data"]["id"])
        self.assertEqual(saved.description, "Toyota for sale")
        self.assertEqual(saved.asking_price, Decimal("12345.67"))
        self.assertEqual(saved.condition_details, {"mechanical": "Runs normally"})
        self.assertEqual(saved.known_damage, "Dent")
        self.assertEqual(saved.location, "Austin")
        self.assertEqual(saved.contact_info, {"email": "seller@example.com"})
        self.assertNotIn("contact_info", result["data"])
        self.assertNotIn("seller@example.com", json.dumps(result))

    def test_invalid_input_and_required_description(self):
        for details in (None, {}, [], "sale", True, {"asking_price": 100}, {"description": " "},
                        {"description": 1}, {"description": None}, {"description": "bad\x00text"}):
            self.assertEqual(create_or_update_sell_issue(self.car.pk, details, user=self.user)["status"], "error")

    def test_unknown_ownership_status_and_internal_fields_rejected(self):
        for key in ("user", "user_id", "owner_id", "used_car", "used_car_id", "status", "approved_at", "id", "preferences", "notes", "currency"):
            self.assertEqual(self.save({"description": "Sale", key: "forged"})["status"], "error")

    def test_strict_text_types_and_existing_length_constraints(self):
        for details in ({"known_damage": 1}, {"location": []}, {"location": "x" * 256},
                        {"condition_details": {"mechanical": "x" * 1001}}, {"contact_info": {"phone": "x" * 51}}):
            self.assertEqual(self.save({"description": "Sale", **details})["status"], "error")
        long_text = "Owner description. " * 1000
        self.assertEqual(self.save({"description": long_text, "known_damage": long_text})["status"], "ok")

    def test_invalid_monetary_values(self):
        for price in (True, False, 10.25, "bad", "", "NaN", "Infinity", "-1", "1.001", "10000000000", [], {}):
            with self.subTest(price=price):
                self.assertEqual(self.save({"description": "Sale", "asking_price": price})["status"], "error")
        for price in (0, "100.25", Decimal("100.25"), None):
            self.assertEqual(self.save({"description": "Sale", "asking_price": price})["status"], "ok")

    def test_json_validation(self):
        for field in ("condition_details", "contact_info"):
            for value in ([], "text", {"unknown": "value"}, {1: "value"}, {"phone": object()}, {"mechanical": float("nan")}):
                self.assertEqual(self.save({"description": "Sale", field: value})["status"], "error")

    def test_update_omitted_values_and_unrelated_fields_preserved(self):
        before = SellIssue.objects.values().get(pk=self.issue.pk)
        cars_before = list(UsedCar.objects.values())
        self.save({"description": "Updated"}, sell_issue_id=self.issue.pk)
        after = SellIssue.objects.values().get(pk=self.issue.pk)
        for field in before.keys() - {"description", "updated_at"}:
            self.assertEqual(before[field], after[field], field)
        self.assertEqual(cars_before, list(UsedCar.objects.values()))

    def test_optional_explicit_clearing(self):
        result = self.save({"asking_price": None, "condition_details": None, "contact_info": None,
                            "known_damage": "", "location": ""}, sell_issue_id=self.issue.pk)
        self.assertEqual(result["status"], "ok")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.asking_price)
        self.assertIsNone(self.issue.contact_info)
        self.assertEqual(self.issue.description, "Original private sale")

    def test_closed_status_preserved_and_public_snapshot_untouched(self):
        SellIssue.objects.filter(pk=self.issue.pk).update(status="closed")
        post = Post.objects.create(issue_id=self.issue.pk, issue_type="sell", status="published", approved_at=timezone.now(),
                                   title="Existing public snapshot", post_data={"make": "Toyota", "asking_price": 10000})
        before = Post.objects.values().get(pk=post.pk)
        result = self.save({"asking_price": "9000.00"}, sell_issue_id=self.issue.pk)
        self.assertEqual(result["data"]["status"], "closed")
        self.assertEqual(before, Post.objects.values().get(pk=post.pk))

    def test_repeated_updates_idempotent_without_duplicate_issues(self):
        result = self.save()
        key = result["data"]["id"]
        self.save({"description": "Owner wants to sell"}, sell_issue_id=key)
        before = SellIssue.objects.values().get(pk=key)
        with CaptureQueriesContext(connection) as queries:
            self.save({"description": "Owner wants to sell"}, sell_issue_id=key)
        self.assertFalse(any(q["sql"].lstrip().upper().startswith("UPDATE") for q in queries))
        self.assertEqual(before, SellIssue.objects.values().get(pk=key))
        self.assertEqual(SellIssue.objects.count(), 3)

    def test_explicit_new_creates_follow_buyer_convention(self):
        first, second = self.save(), self.save()
        self.assertNotEqual(first["data"]["id"], second["data"]["id"])

    def test_invalid_update_atomic(self):
        before = list(SellIssue.objects.values())
        result = self.save({"description": "Should not persist", "asking_price": "bad"}, sell_issue_id=self.issue.pk)
        self.assertEqual(result["status"], "error")
        self.assertEqual(before, list(SellIssue.objects.values()))

    def test_database_failures_safe_for_create_and_update(self):
        before = list(SellIssue.objects.values())
        for helper, issue_id in (("create_sell_issue", None), ("update_sell_issue", self.issue.pk)):
            with patch("agent.services.seller_issue_service." + helper, side_effect=DatabaseError("PRIVATE SQL")):
                result = self.save({"description": "Changed"}, sell_issue_id=issue_id)
            self.assertEqual(result["error"], "Unable to save Sell issue.")
            self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(before, list(SellIssue.objects.values()))

    def test_failure_after_write_rolls_back_both_operations(self):
        before = list(SellIssue.objects.values())
        for issue_id in (None, self.issue.pk):
            with patch("agent.services.seller_issue_service.tool_result", side_effect=TypeError("PRIVATE result failure")):
                self.assertEqual(self.save({"description": "Changed"}, sell_issue_id=issue_id)["status"], "error")
        self.assertEqual(before, list(SellIssue.objects.values()))

    def test_private_projection_shared_response_and_no_publication(self):
        result = self.save()
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(result["ids"]["issue"], {"type": "sell", "id": result["data"]["id"]})
        self.assertEqual(result["provenance"], "own_sell_issues")
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("user_id", result["data"])
        self.assertNotIn("contact_info", result["data"])
        self.assertFalse(Post.objects.exists())

    def test_only_sell_row_written_no_other_records_or_network(self):
        before = (list(User.objects.values()), list(UsedCar.objects.values()), SellIssue.objects.values().get(pk=self.foreign.pk))
        with patch("socket.socket.connect", side_effect=AssertionError("No external calls")) as network:
            with patch("agent.services.valuation_service.estimate") as valuation:
                with CaptureQueriesContext(connection) as queries:
                    self.save()
                valuation.assert_not_called()
            network.assert_not_called()
        writes = [q["sql"] for q in queries if q["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
        self.assertEqual(len(writes), 1)
        self.assertIn('"sell_issues"', writes[0])
        self.assertEqual(before, (list(User.objects.values()), list(UsedCar.objects.values()), SellIssue.objects.values().get(pk=self.foreign.pk)))
        self.assertFalse(BuyIssue.objects.exists())
        self.assertFalse(RepairIssue.objects.exists())
        self.assertFalse(Post.objects.exists())
