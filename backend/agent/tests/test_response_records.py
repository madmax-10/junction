"""HTTP database-shaped JSON projections and cross-user access checks."""

from unittest.mock import patch
from uuid import uuid4

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from agent.tools.result import tool_result
from issues.models import RepairIssue, SellIssue
from posts.models import Post
from vehicles.models import UsedCar


class ResponseRecordTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(email="record-owner@example.com", name="Owner")
        cls.other = User.objects.create_user(email="record-other@example.com", name="Other")
        cls.car = UsedCar.objects.create(owner=cls.owner, make="Toyota", model="Camry", year=2024, mileage=123)
        cls.sale = SellIssue.objects.create(user=cls.owner, used_car=cls.car,
            description="Private sale", asking_price="12345.67", contact_info={"email": "SECRET"})
        cls.repair = RepairIssue.objects.create(user=cls.owner, used_car=cls.car, description="Brake noise")

    def request_records(self, result, user=None):
        self.client.force_authenticate(user or self.owner)
        event = {"id": "result", "kind": "tool_response", "author": "seller",
                 "name": "get_vehicle_details", "call_id": "call", "response": result}
        with patch("agent.views.run_turn", return_value=[event]):
            response = self.client.post("/api/chat/turns/", {"events": [{
                "id": "user", "kind": "message", "role": "user", "author": "user", "text": "Hello",
            }]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["events"], [event])
        return response.json()["records"]

    def test_owned_rows_use_real_model_fields_not_tool_data(self):
        records = self.request_records(tool_result("ok", data={"make": "FABRICATED"}, ids={
            "used_car_id": str(self.car.pk), "issue": {"type": "sell", "id": str(self.sale.pk)},
        }))
        self.assertEqual(records["used_cars"][0]["make"], "Toyota")
        sale = records["sell_issues"][0]
        self.assertEqual(sale["id"], str(self.sale.pk))
        self.assertEqual(sale["used_car_id"], str(self.car.pk))
        self.assertEqual(sale["asking_price"], "12345.67")
        self.assertIsInstance(sale["created_at"], str)
        self.assertNotIn("contact_info", sale)
        self.assertNotIn("user", sale)
        self.assertEqual(records["buy_issues"], [])

    def test_foreign_records_are_not_exposed_even_if_tool_claims_success(self):
        records = self.request_records(tool_result("ok", ids={
            "used_car_id": str(self.car.pk), "issue": {"type": "repair", "id": str(self.repair.pk)},
        }), user=self.other)
        self.assertTrue(all(not rows for rows in records.values()))

    def test_error_results_do_not_fetch_records(self):
        records = self.request_records(tool_result("error", error="Unavailable", ids={"used_car_id": str(self.car.pk)}))
        self.assertTrue(all(not rows for rows in records.values()))

    def test_insufficient_data_preserves_vehicle_but_ignores_bad_ids(self):
        records = self.request_records(tool_result("insufficient_data", ids={
            "used_car_id": str(self.car.pk), "post_ids": ["bad-id", str(uuid4())],
        }))
        self.assertEqual(records["used_cars"][0]["id"], str(self.car.pk))
        self.assertEqual(records["posts"], [])

    def test_only_owned_or_approved_published_posts_are_returned(self):
        own = Post.objects.create(issue_id=self.sale.pk, issue_type="sell", title="Own draft")
        foreign = Post.objects.create(issue_id=uuid4(), issue_type="buy", title="SECRET draft")
        public = Post.objects.create(issue_id=uuid4(), issue_type="sell", status="published",
            approved_at=timezone.now(), title="Approved public listing", post_data={"contact": {"email": "SECRET"}})
        unapproved = Post.objects.create(issue_id=uuid4(), issue_type="sell", status="published", title="Unapproved")
        records = self.request_records(tool_result("ok", ids={
            "post_ids": [str(p.pk) for p in (own, foreign, public, unapproved)],
        }))
        self.assertEqual({p["id"] for p in records["posts"]}, {str(own.pk), str(public.pk)})
        for post in records["posts"]:
            self.assertNotIn("post_data", post)
            self.assertNotIn("content", post)
