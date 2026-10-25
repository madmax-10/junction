"""Synthetic isolated repair reports; no model calls or public publication."""

import json
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.repair_issue_service import create_repair_issue
from issues.models import BuyIssue, RepairIssue, SellIssue
from issues.services import create_repair_issue as create_repair_issue_record
from posts.models import Post
from vehicles.models import UsedCar


class RepairIssueServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="repair-owner@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE-other@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(
            owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000,
        )
        cls.foreign_car = UsedCar.objects.create(
            owner=cls.other, make="Honda", model="PRIVATE model", year=2021, mileage=10000,
        )

    def test_authenticated_creation_reuses_shared_helper_with_owned_car(self):
        with patch("agent.services.repair_issue_service.create_repair_issue_record", wraps=create_repair_issue_record) as helper:
            result = create_repair_issue(self.car.id, "Engine will not start", user=self.user)
        self.assertEqual(result["status"], "ok")
        helper.assert_called_once()
        args = helper.call_args.args
        self.assertEqual(args[0], self.user)
        self.assertEqual(args[1]["used_car"], self.car)
        self.assertEqual(args[1]["description"], "Engine will not start")
        saved = RepairIssue.objects.get(pk=result["data"]["id"])
        self.assertEqual(saved.user, self.user)
        self.assertEqual(saved.used_car, self.car)

    def test_actual_description_and_initial_model_defaults_are_saved(self):
        result = create_repair_issue(self.car.id, "  Cranks but will not start.\nBattery light on.  ", user=self.user)
        saved = RepairIssue.objects.get(pk=result["data"]["id"])
        self.assertEqual(saved.description, "Cranks but will not start.\nBattery light on.")
        self.assertEqual(saved.status, RepairIssue.Status.OPEN)
        self.assertEqual(result["data"]["status"], saved.status)
        for field in ("symptoms", "ai_analysis", "resolution_details", "resolved_at"):
            self.assertIsNone(getattr(saved, field))

    def test_missing_or_anonymous_identity_cannot_write(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.id)},
                     User(email="unsaved@example.com", name="Unsaved")):
            with self.subTest(user=user):
                result = create_repair_issue(self.car.id, "No start", user=user)
                self.assertEqual(result["error"], "Authentication is required.")
        self.assertFalse(RepairIssue.objects.exists())

    def test_disabled_account_is_rejected_even_if_supplied_object_is_stale(self):
        User.objects.filter(pk=self.user.id).update(is_active=False)
        result = create_repair_issue(self.car.id, "No start", user=self.user)
        self.assertEqual(result["status"], "error")
        self.assertFalse(RepairIssue.objects.exists())

    def test_foreign_missing_and_malformed_vehicle_have_identical_safe_errors(self):
        results = [create_repair_issue(identifier, "No start", user=self.user)
                   for identifier in (self.foreign_car.id, uuid4(), None, "bad", "", True, 1, 1.5, [])]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Vehicle not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(results))
        self.assertFalse(RepairIssue.objects.exists())

    def test_staff_cannot_create_issue_for_another_owners_vehicle(self):
        result = create_repair_issue(self.car.id, "Not my car", user=self.other)
        self.assertEqual(result["error"], "Vehicle not found.")
        self.assertFalse(RepairIssue.objects.exists())

    def test_uuid_string_vehicle_reference_is_supported(self):
        result = create_repair_issue(str(self.car.id), "No start", user=self.user)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["ids"]["used_car_id"], str(self.car.id))

    def test_missing_description_is_rejected_without_creation(self):
        result = create_repair_issue(self.car.id, user=self.user)
        self.assertEqual(result["status"], "error")
        self.assertFalse(RepairIssue.objects.exists())

    def test_blank_nonstring_and_invalid_text_descriptions_are_rejected(self):
        for description in (None, "", " \t\n ", 0, True, [], {}, object(), "invalid\x00text"):
            with self.subTest(description=repr(description)):
                result = create_repair_issue(self.car.id, description, user=self.user)
                self.assertEqual(result["status"], "error")
        self.assertFalse(RepairIssue.objects.exists())

    def test_no_invented_length_limit_or_silent_truncation(self):
        description = "Owner-reported detail. " * 2000
        result = create_repair_issue(self.car.id, description, user=self.user)
        self.assertEqual(result["status"], "ok")
        saved = RepairIssue.objects.get(pk=result["data"]["id"])
        self.assertEqual(saved.description, description.strip())

    def test_safety_critical_reports_are_preserved_without_diagnosis_or_guidance(self):
        for description in ("Brakes failed", "Steering locked", "Engine overheating", "Fuel leaking"):
            with self.subTest(description=description):
                result = create_repair_issue(self.car.id, description, user=self.user)
                saved = RepairIssue.objects.get(pk=result["data"]["id"])
                self.assertEqual(saved.description, description)
                self.assertIsNone(saved.symptoms)
                self.assertIsNone(saved.ai_analysis)
                self.assertIsNone(saved.resolution_details)
                self.assertEqual(saved.status, RepairIssue.Status.OPEN)

    def test_two_reports_create_independent_issues_without_resuming(self):
        first = create_repair_issue(self.car.id, "No start", user=self.user)
        second = create_repair_issue(self.car.id, "No start", user=self.user)
        self.assertNotEqual(first["data"]["id"], second["data"]["id"])
        self.assertEqual(RepairIssue.objects.count(), 2)

    def test_ownership_or_diagnosis_fields_cannot_be_supplied(self):
        for field in ("user_id", "owner_id", "owner", "status", "symptoms", "ai_analysis"):
            with self.subTest(field=field), self.assertRaises(TypeError):
                create_repair_issue(self.car.id, "No start", user=self.user, **{field: "forged"})
        self.assertFalse(RepairIssue.objects.exists())

    def test_invalid_operations_leave_all_existing_state_unchanged(self):
        created = create_repair_issue(self.car.id, "Existing report", user=self.user)
        before = (list(RepairIssue.objects.values()), list(UsedCar.objects.values()))
        for identifier, description in ((self.car.id, " "), (self.foreign_car.id, "No start"),
                                        (uuid4(), "No start")):
            result = create_repair_issue(identifier, description, user=self.user)
            self.assertEqual(result["status"], "error")
        self.assertEqual((list(RepairIssue.objects.values()), list(UsedCar.objects.values())), before)
        self.assertTrue(RepairIssue.objects.filter(pk=created["data"]["id"]).exists())

    def test_success_and_failure_follow_shared_json_contract(self):
        result = create_repair_issue(self.car.id, "No start", user=self.user)
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(result["ids"]["issue"], {"type": "repair", "id": result["data"]["id"]})
        self.assertEqual(result["data"]["used_car_id"], str(self.car.id))
        self.assertEqual(result["provenance"], "own_repair_issues")
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("user_id", result["data"])

    def test_only_repair_row_is_written_without_publication_or_external_calls(self):
        before = list(UsedCar.objects.values())
        with patch("socket.socket.connect", side_effect=AssertionError("No external calls")) as network:
            with CaptureQueriesContext(connection) as queries:
                result = create_repair_issue(self.car.id, "No start", user=self.user)
            network.assert_not_called()
        self.assertEqual(result["status"], "ok")
        writes = [query["sql"] for query in queries if query["sql"].lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
        self.assertEqual(len(writes), 1)
        self.assertIn('"repair_issues"', writes[0])
        self.assertFalse(any('"posts"' in query["sql"] or '"sell_issues"' in query["sql"] for query in queries))
        self.assertFalse(Post.objects.exists())
        self.assertFalse(BuyIssue.objects.exists())
        self.assertFalse(SellIssue.objects.exists())
        self.assertEqual(list(UsedCar.objects.values()), before)

    def test_database_failure_is_safe_and_leaves_no_partial_issue(self):
        with patch("agent.services.repair_issue_service.create_repair_issue_record", side_effect=DatabaseError("PRIVATE SQL")):
            result = create_repair_issue(self.car.id, "No start", user=self.user)
        self.assertEqual(result["status"], "error")
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertFalse(RepairIssue.objects.exists())

    def test_failure_after_creation_rolls_back_the_record(self):
        with patch("agent.services.repair_issue_service.tool_result", side_effect=TypeError("PRIVATE serialization")):
            result = create_repair_issue(self.car.id, "No start", user=self.user)
        self.assertEqual(result["status"], "error")
        self.assertFalse(RepairIssue.objects.exists())
