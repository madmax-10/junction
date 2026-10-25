"""Read-only public Repair snapshot search using synthetic isolated fixtures."""

import json
from unittest.mock import patch
from uuid import UUID, uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import User
from agent.services.repair_search_service import search_similar_repairs
from issues.models import RepairIssue
from posts.models import Post
from vehicles.models import UsedCar


class RepairSearchServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="search@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.issue = RepairIssue.objects.create(
            user=cls.user, used_car=cls.car, description="Brakes grinding",
            symptoms={"confirmed": ["Brakes grinding"]},
            ai_analysis={"possibilities": [{"cause": "Alternator", "uncertainty": "Unverified possibility"}]},
        )
        cls.foreign = RepairIssue.objects.create(user=cls.other, used_car=cls.car, description="PRIVATE report")

    def post(self, **kwargs):
        data = {"owner_reported": True, "make": "Toyota", "model": "Camry",
                "symptoms": {"confirmed": ["Brakes grinding"]},
                "method": "mechanic", "work_performed": "Owner reports pads replaced"}
        return Post.objects.create(**{
            "issue_id": uuid4(), "issue_type": "repair", "title": "Brakes grinding",
            "content": "Public owner account", "post_data": data,
            "status": "published", "approved_at": timezone.now(), **kwargs,
        })

    def search(self, **kwargs):
        return search_similar_repairs(self.issue.id, **{"user": self.user, **kwargs})

    def test_authenticated_success_returns_public_experience(self):
        post = self.post()
        result = self.search()
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["result_count"], 1)
        match = result["data"]["matches"][0]
        self.assertEqual(match["post_id"], str(post.id))
        self.assertEqual(match["repair"]["work_performed"], "Owner reports pads replaced")
        self.assertEqual(match["provenance"], "community_owner_experience")
        self.assertEqual(match["keyword_score"], 17)

    def test_nonpublic_and_nonrepair_excluded(self):
        for status in ("draft", "approved", "archived", "rejected", "unpublished"):
            self.post(status=status)
        for issue_type in ("buy", "sell"):
            self.post(issue_type=issue_type)
        self.post(approved_at=None)
        self.post(post_data={"owner_reported": False})
        self.post(post_data={"owner_reported": 1})
        self.assertEqual(self.search()["status"], "no_results")

    def test_foreign_missing_malformed_share_private_error(self):
        results = [search_similar_repairs(key, user=self.user)
                   for key in (self.foreign.id, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Repair issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(results))

    def test_authentication_required(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, User(email="unsaved@example.com")):
            self.assertEqual(self.search(user=user)["error"], "Authentication is required.")
        self.assertEqual(search_similar_repairs(self.issue.id)["status"], "error")

    def test_inactive_stale_identity_rejected(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.search()["error"], "Authentication is required.")

    def test_vehicle_ownership_required(self):
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(self.search()["error"], "Repair issue not found.")

    def test_staff_cannot_access_other_issue(self):
        self.assertEqual(self.search(user=self.other)["error"], "Repair issue not found.")

    def test_uuid_string_supported(self):
        self.post()
        self.assertEqual(search_similar_repairs(str(self.issue.id), user=self.user)["status"], "ok")

    def test_limits_strictly_validated(self):
        for limit in (0, -1, 11, True, False, 1.0, "5", None, [], {}):
            self.assertEqual(self.search(limit=limit)["error"], "limit must be an integer between 1 and 10.")
        for limit in (1, 5, 10):
            self.assertEqual(self.search(limit=limit)["status"], "no_results")

    def test_symptoms_rank_before_weaker_vehicle_match(self):
        strong = self.post(title="Grinding brakes", post_data={"owner_reported": True, "symptoms": {"confirmed": ["Brakes grinding"]}})
        weak = self.post(title="Brakes", post_data={"owner_reported": True, "make": "Toyota", "model": "Camry"})
        matches = self.search()["data"]["matches"]
        # Two symptom overlaps (12) outrank one plus vehicle bonuses (11).
        self.assertEqual([m["post_id"] for m in matches], [str(strong.id), str(weak.id)])
        stronger = self.post(title="Brakes grinding", post_data={"owner_reported": True, "make": "Toyota", "model": "Camry"})
        self.assertEqual(self.search()["data"]["matches"][0]["post_id"], str(stronger.id))

    def test_deterministic_uuid_tiebreak_and_limits(self):
        for number in range(12, 0, -1):
            self.post(id=UUID(int=number))
        first = self.search(limit=3)
        self.assertEqual(first, self.search(limit=3))
        self.assertEqual(first["ids"]["post_ids"], [str(UUID(int=n)) for n in (1, 2, 3)])
        self.assertEqual(first["data"]["result_count"], 3)

    def test_empty_and_unrelated_results_no_fabrication(self):
        self.assertEqual(self.search()["data"]["matches"], [])
        self.post(title="Window switch", post_data={"owner_reported": True, "make": "Toyota", "model": "Camry"})
        result = self.search()
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["result_count"], 0)
        self.assertEqual(result["ids"]["post_ids"], [])

    def test_private_fields_and_source_issue_never_exposed(self):
        self.post(content="PRIVATE content not used", post_data={
            "owner_reported": True, "symptoms": {"confirmed": ["Brakes grinding"]},
            "contact": "PRIVATE contact", "ai_analysis": "PRIVATE diagnosis",
            "user_id": str(self.other.pk), "mechanic_name": "PRIVATE mechanic",
        })
        text = json.dumps(self.search())
        self.assertNotIn("PRIVATE", text)
        self.assertNotIn(str(self.other.pk), text)
        self.assertNotIn("issue_id", text)

    def test_optional_public_details_can_be_missing(self):
        self.post(title="Brakes grinding", post_data={"owner_reported": True})
        match = self.search()["data"]["matches"][0]
        self.assertEqual(match["repair"], {})
        self.assertEqual(match["vehicle"], {})
        self.assertEqual(match["symptoms"], {})

    def test_analysis_only_overlap_does_not_match(self):
        self.post(title="Alternator replacement", post_data={"owner_reported": True})
        self.assertEqual(self.search()["status"], "no_results")

    def test_safety_text_and_cautions_retained(self):
        self.post(title="Brakes grinding and fuel leak", post_data={"owner_reported": True})
        result = self.search()
        self.assertIn("fuel leak", result["data"]["matches"][0]["problem_summary"])
        self.assertIn("not verified mechanical diagnoses", " ".join(result["data"]["limitations"]))
        self.assertIn("safe to drive", " ".join(result["data"]["limitations"]))

    def test_no_writes_no_network_and_private_issue_unchanged(self):
        self.post()
        before = (list(RepairIssue.objects.values()), list(UsedCar.objects.values()), list(Post.objects.values()))
        with patch("socket.socket.connect", side_effect=AssertionError("No network")) as network:
            with CaptureQueriesContext(connection) as queries:
                self.assertEqual(self.search()["status"], "ok")
            network.assert_not_called()
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertLessEqual(len(queries), 3)
        self.assertEqual(before, (list(RepairIssue.objects.values()), list(UsedCar.objects.values()), list(Post.objects.values())))

    def test_private_issues_never_used_as_experiences(self):
        RepairIssue.objects.create(user=self.other, used_car=self.car, description="Brakes grinding")
        self.assertEqual(self.search()["status"], "no_results")

    def test_malformed_public_schema_skipped(self):
        for data in ([], {"owner_reported": True, "symptoms": []},
                     {"owner_reported": True, "method": "unknown"},
                     {"owner_reported": True, "make": 123}):
            self.post(post_data=data)
        self.assertEqual(self.search()["status"], "no_results")

    def test_invalid_saved_diagnosis_returns_safe_error(self):
        RepairIssue.objects.filter(pk=self.issue.pk).update(ai_analysis={"possibilities": [{"cause": "Confirmed"}]})
        self.assertEqual(self.search()["error"], "Invalid saved repair diagnosis data.")

    def test_public_outcome_keywords_explain_matching(self):
        self.post(title="Owner experience", post_data={"owner_reported": True, "work_performed": "Brakes serviced"})
        match = self.search()["data"]["matches"][0]
        self.assertEqual(match["keyword_score"], 1)
        self.assertEqual(match["reasons"], ["Keywords in owner-reported work: brakes"])

    def test_bounded_candidates(self):
        Post.objects.bulk_create([
            Post(issue_id=uuid4(), issue_type="repair", title="Unrelated window", status="published",
                 approved_at=timezone.now(), post_data={"owner_reported": True}) for _ in range(501)
        ])
        with CaptureQueriesContext(connection) as queries:
            self.search()
        self.assertIn("LIMIT 500", queries[-1]["sql"])

    def test_database_errors_safe(self):
        with patch.object(Post.objects, "filter", side_effect=DatabaseError("PRIVATE SQL")):
            result = self.search()
        self.assertEqual(result["error"], "Repair community search is unavailable.")
        self.assertIsNone(result["data"])
        self.assertNotIn("PRIVATE", json.dumps(result))
