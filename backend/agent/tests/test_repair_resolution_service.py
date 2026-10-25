"""Real ORM outcomes and ownership; no external or publication workflow."""

import json
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.repair_resolution_service import record_resolution
from issues.models import RepairIssue
from issues.services import record_resolution as persist_resolution
from posts.models import Post
from vehicles.models import UsedCar


class RepairResolutionServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="resolution@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.issue = RepairIssue.objects.create(user=cls.user, used_car=cls.car, description="Original no start",
                                             symptoms={"confirmed": ["No start"]}, ai_analysis={"notes": "Unverified battery hypothesis"})
        cls.foreign = RepairIssue.objects.create(user=cls.other, used_car=cls.car, description="PRIVATE")

    def payload(self, status="resolved", **details):
        return {"status": status, "resolution_details": {
            "method": "mechanic", "work_performed": "Battery replaced; owner reports car starts normally", **details,
        }}

    def save(self, data=None, **kwargs):
        return record_resolution(self.issue.pk, self.payload() if data is None else data, **{"user": self.user, **kwargs})

    def test_success_reuses_existing_persistence(self):
        with patch("agent.services.repair_resolution_service.persist_resolution", wraps=persist_resolution) as persist:
            result = self.save()
        persist.assert_called_once()
        self.assertEqual(result["status"], "ok")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.status, "resolved")
        self.assertIsNotNone(self.issue.resolved_at)
        self.assertEqual(self.issue.resolution_details, self.payload()["resolution_details"])

    def test_private_missing_malformed_refs_generic(self):
        results = [record_resolution(key, self.payload(), user=self.user)
                   for key in (self.foreign.pk, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Repair issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(results))

    def test_missing_auth_and_no_unauthorized_writes(self):
        before = list(RepairIssue.objects.values())
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, User(email="unsaved@example.com")):
            with CaptureQueriesContext(connection) as queries:
                self.assertEqual(self.save(user=user)["error"], "Authentication is required.")
            self.assertFalse(any(q["sql"].lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE")) for q in queries))
        self.assertEqual(record_resolution(self.issue.pk, self.payload())["status"], "error")
        self.assertEqual(before, list(RepairIssue.objects.values()))

    def test_stale_inactive_user(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.save()["error"], "Authentication is required.")

    def test_staff_cannot_override(self):
        self.assertEqual(self.save(user=self.other)["error"], "Repair issue not found.")

    def test_vehicle_ownership_rechecked(self):
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(self.save()["error"], "Repair issue not found.")

    def test_uuid_string(self):
        self.assertEqual(record_resolution(str(self.issue.pk), self.payload(), user=self.user)["status"], "ok")

    def test_missing_or_unsupported_data(self):
        for data in (None, {}, [], "fixed", True, 1, {"method": "mechanic"},
                     {"status": "resolved"}, {"resolution_details": {}},
                     {**self.payload(), "user_id": str(self.other.pk)}):
            self.assertEqual(record_resolution(self.issue.pk, data, user=self.user)["status"], "error")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.resolution_details)

    def test_required_meaningful_description(self):
        for details in ({"method": "mechanic"}, {"method": "mechanic", "work_performed": "  "},
                        {"method": "self"}, {"method": "self", "instructions": ""}):
            self.assertEqual(self.save({"status": "resolved", "resolution_details": details})["status"], "error")

    def test_invalid_field_types_unknown_keys_and_statuses(self):
        for details in ({"method": "other"}, {"method": []}, {"work_performed": 1},
                        {"mechanic_name": []}, {"owner_reported": True},
                        {"cost": True}, {"cost": "-1"}, {"cost": "Infinity"}, {"cost": "NaN"}):
            self.assertEqual(self.save(self.payload(**details))["status"], "error")
        nested_status = self.payload()
        nested_status["resolution_details"]["status"] = "resolved"
        self.assertEqual(self.save(nested_status)["status"], "error")
        for status in ("open", "fixed", None, True, [], {}):
            self.assertEqual(self.save(self.payload(status))["status"], "error")

    def test_excessive_text_limits(self):
        for details in ({"work_performed": "x" * 1001}, {"mechanic_name": "x" * 101}, {"location": "x" * 256}):
            self.assertEqual(self.save(self.payload(**details))["status"], "error")
        data = {"status": "unsure", "resolution_details": {"method": "self", "instructions": "x" * 2001}}
        self.assertEqual(self.save(data)["status"], "error")

    def test_raw_non_json_values_rejected(self):
        for cost in (object(), {1, 2}, float("nan"), float("inf")):
            self.assertEqual(self.save(self.payload(cost=cost))["status"], "error")
        data = self.payload()
        data["resolution_details"]["cost"] = data
        self.assertEqual(self.save(data)["status"], "error")

    def test_unresolved_attempt_stays_unresolved(self):
        result = self.save(self.payload("unresolved", work_performed="Battery replaced; still does not start"))
        self.assertEqual(result["data"]["status"], "unresolved")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.resolved_at)

    def test_unsure_and_self_repair_contract(self):
        data = {"status": "unsure", "resolution_details": {"method": "self", "instructions": "Cleaned terminals; outcome not yet known", "parts_used": ["Terminal brush"]}}
        result = self.save(data)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["status"], "unsure")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.resolved_at)

    def test_explicit_unresolved_to_resolved_transition(self):
        self.save(self.payload("unresolved"))
        self.assertEqual(self.save()["status"], "ok")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.status, "resolved")
        self.assertIsNotNone(self.issue.resolved_at)

    def test_original_fields_unchanged(self):
        before = RepairIssue.objects.values().get(pk=self.issue.pk)
        car_before = list(UsedCar.objects.values())
        self.save()
        after = RepairIssue.objects.values().get(pk=self.issue.pk)
        for field in before.keys() - {"status", "resolution_details", "resolved_at", "updated_at"}:
            self.assertEqual(before[field], after[field], field)
        self.assertEqual(car_before, list(UsedCar.objects.values()))

    def test_identical_submissions_are_no_write_idempotent(self):
        for status in ("unresolved", "unsure", "resolved"):
            self.save(self.payload(status))
            before = RepairIssue.objects.values().get(pk=self.issue.pk)
            with CaptureQueriesContext(connection) as queries:
                result = self.save(self.payload(status))
            self.assertEqual(result["status"], "ok")
            self.assertFalse(any(q["sql"].lstrip().upper().startswith("UPDATE") for q in queries))
            self.assertEqual(before, RepairIssue.objects.values().get(pk=self.issue.pk))

    def test_normalized_duplicate_does_not_reset_timestamps(self):
        self.save(self.payload(work_performed="  Owner says battery fixed start  "))
        before = RepairIssue.objects.values().get(pk=self.issue.pk)
        self.assertEqual(self.save(self.payload(work_performed="Owner says battery fixed start"))["status"], "ok")
        self.assertEqual(before, RepairIssue.objects.values().get(pk=self.issue.pk))

    def test_conflicting_resolved_updates_and_downgrades_rejected(self):
        self.save()
        before = RepairIssue.objects.values().get(pk=self.issue.pk)
        for data in (self.payload(work_performed="Different outcome"), self.payload("unresolved"), self.payload(cost=200)):
            self.assertEqual(self.save(data)["error"], "An existing resolved outcome cannot be overwritten.")
        self.assertEqual(before, RepairIssue.objects.values().get(pk=self.issue.pk))

    def test_invalid_update_preserves_existing_resolution(self):
        self.save(self.payload("unresolved", mechanic_name="Owner named mechanic"))
        before = RepairIssue.objects.values().get(pk=self.issue.pk)
        self.assertEqual(self.save({})["status"], "error")
        self.assertEqual(before, RepairIssue.objects.values().get(pk=self.issue.pk))

    def test_existing_resolved_data_cannot_be_cleared(self):
        self.save()
        self.assertEqual(record_resolution(self.issue.pk, None, user=self.user)["status"], "error")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.resolution_details, self.payload()["resolution_details"])

    def test_cost_result_contract_and_normalization(self):
        result = self.save(self.payload(cost="180.25", mechanic_name="  Garage  "))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["resolution_details"]["cost"], "180.25")
        self.assertEqual(result["data"]["resolution_details"]["mechanic_name"], "Garage")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.resolution_details["cost"], 180.25)

    def test_no_new_issue_no_post_no_network_only_permitted_write(self):
        foreign_before = RepairIssue.objects.values().get(pk=self.foreign.pk)
        with patch("socket.socket.connect", side_effect=AssertionError("No external calls")) as network:
            with CaptureQueriesContext(connection) as queries:
                self.save()
            network.assert_not_called()
        writes = [q["sql"] for q in queries if q["sql"].lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE"))]
        self.assertEqual(len(writes), 1)
        self.assertIn('UPDATE "repair_issues" SET "status"', writes[0])
        self.assertNotIn('"symptoms" =', writes[0])
        self.assertEqual(RepairIssue.objects.count(), 2)
        self.assertFalse(Post.objects.exists())
        self.assertEqual(foreign_before, RepairIssue.objects.values().get(pk=self.foreign.pk))

    def test_shared_result_is_private_owner_reported(self):
        result = self.save()
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertTrue(result["data"]["stored"])
        self.assertTrue(result["data"]["owner_reported"])
        self.assertEqual(result["ids"]["issue"], {"type": "repair", "id": str(self.issue.pk)})
        self.assertEqual(result["provenance"], "own_repair_issues")
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn(str(self.car.pk), json.dumps(result))
        self.assertNotIn("ai_analysis", result["data"])
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_database_failure_rolls_back(self):
        before = RepairIssue.objects.values().get(pk=self.issue.pk)
        with patch("agent.services.repair_resolution_service.persist_resolution", side_effect=DatabaseError("PRIVATE SQL")):
            result = self.save()
        self.assertEqual(result["error"], "Unable to record repair resolution.")
        self.assertEqual(before, RepairIssue.objects.values().get(pk=self.issue.pk))

    def test_post_write_response_failure_rolls_back(self):
        before = RepairIssue.objects.values().get(pk=self.issue.pk)
        with patch("agent.services.repair_resolution_service.tool_result", side_effect=TypeError("PRIVATE result failure")):
            result = self.save()
        self.assertEqual(result["status"], "error")
        self.assertEqual(before, RepairIssue.objects.values().get(pk=self.issue.pk))
