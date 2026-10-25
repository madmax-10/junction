"""Real isolated ORM ownership, schema and persistence tests; no paid APIs."""

import json
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import User
from agent.services.repair_diagnosis_service import save_diagnosis
from issues.models import BuyIssue, RepairIssue, SellIssue
from posts.models import Post
from vehicles.models import UsedCar


class RepairDiagnosisServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="diagnosis@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.foreign_car = UsedCar.objects.create(owner=cls.other, make="Honda", model="PRIVATE", year=2021, mileage=10000)
        cls.issue = RepairIssue.objects.create(user=cls.user, used_car=cls.car, description="Original report")
        cls.foreign = RepairIssue.objects.create(user=cls.other, used_car=cls.foreign_car, description="PRIVATE report")

    def save(self, symptoms=None, analysis=None, **kwargs):
        return save_diagnosis(
            self.issue.id, symptoms, analysis, user=kwargs.get("user", self.user),
        )

    def test_valid_symptoms_and_association(self):
        symptoms = {"confirmed": ["Severe brake grinding"], "inferred": ["Vibration"]}
        result = self.save(symptoms)
        self.assertEqual(result["status"], "ok")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.symptoms, symptoms)
        self.assertEqual(self.issue.used_car_id, self.car.id)
        self.assertEqual(self.issue.user_id, self.user.id)

    def test_valid_analysis_retains_uncertainty(self):
        analysis = {"possibilities": [{"cause": "Worn pads", "uncertainty": "Inspection needed"}], "notes": "Preliminary"}
        self.assertEqual(self.save(analysis=analysis)["status"], "ok")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.ai_analysis, analysis)
        self.assertEqual(self.issue.status, "open")
        self.assertIsNone(self.issue.resolution_details)

    def test_missing_authentication_has_no_writes(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.id)}, User(email="unsaved@example.com")):
            with self.subTest(user=repr(user)), CaptureQueriesContext(connection) as queries:
                self.assertEqual(self.save(user=user)["error"], "Authentication is required.")
            self.assertFalse(any(q["sql"].lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE")) for q in queries))
        self.assertEqual(save_diagnosis(self.issue.id, None, None)["status"], "error")

    def test_inactive_stale_identity(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.save()["error"], "Authentication is required.")

    def test_deleted_identity(self):
        user = User.objects.create_user(email="deleted@example.com", name="Deleted")
        User.objects.filter(pk=user.pk).delete()
        self.assertEqual(self.save(user=user)["error"], "Authentication is required.")

    def test_private_missing_malformed_references_share_error(self):
        results = [save_diagnosis(key, None, None, user=self.user)
                   for key in (self.foreign.id, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Repair issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(results))

    def test_staff_has_no_ownership_override(self):
        self.assertEqual(self.save(user=self.other)["error"], "Repair issue not found.")

    def test_inconsistent_vehicle_ownership_rejected(self):
        RepairIssue.objects.filter(pk=self.issue.pk).update(used_car=self.foreign_car)
        self.assertEqual(self.save()["error"], "Repair issue not found.")

    def test_inconsistent_issue_ownership_rejected(self):
        RepairIssue.objects.filter(pk=self.issue.pk).update(user=self.other)
        self.assertEqual(self.save()["error"], "Repair issue not found.")

    def test_uuid_string(self):
        self.assertEqual(save_diagnosis(str(self.issue.id), None, None, user=self.user)["status"], "ok")

    def test_invalid_symptoms_types_and_structure(self):
        for value in ([], "noise", True, 1, {"unknown": []}, {"confirmed": "noise"},
                      {"confirmed": [""]}, {"inferred": [1]}, {"confirmed": ["a" * 301]},
                      {"confirmed": ["noise"] * 21}):
            with self.subTest(value=value):
                self.assertEqual(self.save(value)["error"], "Invalid repair diagnosis data.")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.symptoms)

    def test_invalid_analysis_types_and_structure(self):
        for value in ([], "diagnosis", True, {"confirmed": True}, {"notes": 1},
                      {"possibilities": "cause"}, {"possibilities": ["cause"]},
                      {"possibilities": [{"cause": "Pads"}]},
                      {"possibilities": [{"cause": "Pads", "uncertainty": ""}]},
                      {"possibilities": [{"cause": "Pads", "uncertainty": "Maybe", "safe": True}]},
                      {"notes": "n" * 2001}, {"possibilities": [{}] * 21}):
            with self.subTest(value=value):
                self.assertEqual(self.save(analysis=value)["error"], "Invalid repair diagnosis data.")

    def test_non_json_values_rejected(self):
        for value in ({"confirmed": {"noise"}}, {"confirmed": [object()]}, {"confirmed": float("nan")}):
            self.assertEqual(self.save(value)["status"], "error")
        self.assertEqual(self.save(analysis={"notes": object()})["status"], "error")
        circular = {}
        circular["notes"] = circular
        self.assertEqual(self.save(analysis=circular)["status"], "error")

    def test_invalid_either_input_never_partially_saves(self):
        before = list(RepairIssue.objects.values())
        self.assertEqual(self.save({"confirmed": ["noise"]}, {"possibilities": [{}]})["status"], "error")
        self.assertEqual(self.save([], {"notes": "Preliminary"})["status"], "error")
        self.assertEqual(list(RepairIssue.objects.values()), before)

    def test_all_unrelated_fields_and_resolution_preserved_for_each_status(self):
        for status in RepairIssue.Status.values:
            RepairIssue.objects.filter(pk=self.issue.pk).update(
                status=status, resolution_details={"method": "self", "instructions": "Actual outcome"}, resolved_at=timezone.now(),
            )
            before = RepairIssue.objects.values().get(pk=self.issue.pk)
            self.assertEqual(self.save({"confirmed": ["noise"]}, {"notes": "Unverified"})["status"], "ok")
            after = RepairIssue.objects.values().get(pk=self.issue.pk)
            for field in before.keys() - {"symptoms", "ai_analysis"}:
                self.assertEqual(after[field], before[field], field)

    def test_existing_analysis_can_be_replaced(self):
        self.save({"confirmed": ["noise"]}, {"notes": "First hypothesis"})
        self.save({"confirmed": ["smoke"]}, {"notes": "Revised hypothesis"})
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.symptoms, {"confirmed": ["smoke"]})
        self.assertEqual(self.issue.ai_analysis, {"notes": "Revised hypothesis"})

    def test_nullable_and_empty_contract(self):
        self.assertEqual(self.save({}, {})["status"], "ok")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.symptoms)
        self.assertIsNone(self.issue.ai_analysis)

    def test_shared_normalization_and_constraint_boundaries(self):
        result = self.save({"confirmed": ["  noise  "]}, {"notes": "  preliminary  "})
        self.assertEqual(result["status"], "ok")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.symptoms, {"confirmed": ["noise"]})
        self.assertEqual(self.issue.ai_analysis, {"notes": "preliminary"})
        self.assertEqual(self.save({"confirmed": ["n" * 300] * 20}, {"notes": "n" * 2000})["status"], "ok")

    def test_safety_reports_retained_without_reassurance(self):
        symptoms = {"confirmed": ["Brake failure", "Steering locked", "Fuel leak", "Smoke or fire", "Severe overheating", "Sudden power loss"]}
        notes = "Urgent warning reported; cause unverified"
        self.save(symptoms, {"notes": notes})
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.symptoms, symptoms)
        self.assertEqual(self.issue.ai_analysis, {"notes": notes})
        self.assertEqual(self.issue.status, "open")

    def test_success_and_error_envelopes(self):
        result = self.save()
        self.assertEqual(result, {"status": "ok", "data": {"id": str(self.issue.id), "status": "open"},
                                 "ids": {"issue": {"type": "repair", "id": str(self.issue.id)}},
                                 "provenance": "own_repair_issues", "error": None})
        self.assertEqual(json.loads(json.dumps(result)), result)
        error = self.save([])
        self.assertEqual(set(error), set(result))
        self.assertIsNone(error["data"])
        self.assertEqual(error["ids"], {})

    def test_only_two_fields_written_no_publication_or_external_calls(self):
        before = (list(UsedCar.objects.values()), list(User.objects.values()), list(RepairIssue.objects.exclude(pk=self.issue.pk).values()))
        with patch("socket.socket.connect", side_effect=AssertionError("External call")) as network:
            with CaptureQueriesContext(connection) as queries:
                self.assertEqual(self.save({"confirmed": ["noise"]})["status"], "ok")
            network.assert_not_called()
        writes = [q["sql"] for q in queries if q["sql"].lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE"))]
        self.assertEqual(len(writes), 1)
        self.assertIn('UPDATE "repair_issues" SET "symptoms"', writes[0])
        self.assertNotIn('"status" =', writes[0])
        self.assertNotIn('"description" =', writes[0])
        self.assertEqual(RepairIssue.objects.count(), 2)
        self.assertFalse(Post.objects.exists())
        self.assertFalse(BuyIssue.objects.exists())
        self.assertFalse(SellIssue.objects.exists())
        self.assertEqual((list(UsedCar.objects.values()), list(User.objects.values()), list(RepairIssue.objects.exclude(pk=self.issue.pk).values())), before)

    def test_database_failure_safe(self):
        with patch.object(RepairIssue, "save", side_effect=DatabaseError("PRIVATE SQL")):
            result = self.save({"confirmed": ["noise"]})
        self.assertEqual(result["error"], "Unable to save repair diagnosis.")
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.symptoms)

    def test_post_write_result_failure_rolls_back(self):
        with patch("agent.services.repair_diagnosis_service.tool_result", side_effect=TypeError("PRIVATE")):
            self.assertEqual(self.save({"confirmed": ["noise"]})["status"], "error")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.symptoms)

    def test_ownership_override_keywords_rejected(self):
        with self.assertRaises(TypeError):
            save_diagnosis(self.issue.id, None, None, user=self.user, user_id=self.other.pk)
