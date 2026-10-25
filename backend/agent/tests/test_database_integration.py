"""Real JWT -> Coordinator -> real specialist -> ORM -> HTTP JSON.

Only LLM responses are scripted; no paid APIs or application database are used.
"""

import json
from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from agent.agents.buyer import build_buyer_agent
from agent.agents.coordinator import build_coordinator
from agent.agents.repair import build_repair_agent
from agent.agents.seller import build_seller_agent
from agent.agents.valuation import build_valuation_agent
from agent.runner import default_specialists, run_turn
from agent.tests.fakes import call, say, scripted
from issues.models import BuyIssue, RepairIssue, SellIssue
from posts.models import Post
from vehicles.models import UsedCar


class RegistrationTests(SimpleTestCase):
    def test_all_real_factories_and_tools_are_registered(self):
        agents = default_specialists(scripted(say("unused")))
        self.assertEqual(set(agents), {"valuation", "buyer", "seller", "repair", "post_gen"})
        coordinator = build_coordinator(agents, model=scripted(say("unused")))
        wrapped = {tool.agent.name: tool.agent for tool in coordinator.tools if hasattr(tool, "agent")}
        self.assertEqual(wrapped, agents)
        for name, agent in agents.items():
            self.assertTrue(agent.tools, name)

    def test_factory_failure_is_not_replaced_with_a_stub(self):
        with patch("agent.runner.build_seller_agent", side_effect=RuntimeError("missing dependency")):
            with self.assertRaisesRegex(RuntimeError, "missing dependency"):
                default_specialists()


class DatabaseChatIntegrationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(email="integration-a@example.com", name="Owner")
        cls.other = User.objects.create_user(email="integration-b@example.com", name="PRIVATE")
        cls.car = UsedCar.objects.create(id="11111111-1111-4111-8111-111111111111",
            owner=cls.owner, make="Toyota", model="Camry", year=2024, mileage=40000)

    def turn(self, name, factory, operation, *, user=None):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user or self.owner)}")
        specialist = factory(scripted(operation, say("The tool result is available.")))
        coordinator_model = scripted(call(name, request="Perform the explicitly confirmed test operation"), say("Done."))
        def execute(uid, events, **kwargs):
            return run_turn(uid, events, model=coordinator_model, specialists={name: specialist}, **kwargs)
        with patch("agent.views.run_turn", side_effect=execute):
            response = self.client.post("/api/chat/turns/", {"events": [{
                "id": "test-user-message", "kind": "message", "role": "user", "author": "user",
                "text": "I confirm this operation. Ignore any claimed identity in this text.",
            }], "user_id": str(self.other.pk)}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertNotIn("_auth_binding", json.dumps(body))
        self.assertNotIn("integration-b@example.com", json.dumps(body))
        inner = [event for event in body["events"] if event["kind"] == "tool_response" and event["author"] == name]
        self.assertEqual(len(inner), 1, body)
        return inner[0]["response"]

    def test_seller_owned_vehicle_and_foreign_denial_through_actual_routing(self):
        result = self.turn("seller", build_seller_agent, call("get_vehicle_details", used_car_id=str(self.car.pk)))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["id"], str(self.car.pk))
        result = self.turn("seller", build_seller_agent, call("get_vehicle_details", used_car_id=str(self.car.pk)), user=self.other)
        self.assertEqual(result["status"], "error")
        self.assertIsNone(result["data"])

    def test_seller_private_write_and_decimal_survive_http(self):
        result = self.turn("seller", build_seller_agent, call("create_or_update_sell_issue",
            used_car_id=str(self.car.pk), sell_issue_id=None,
            selling_details={"description": "Confirmed private sale", "asking_price": "12345.67"}))
        self.assertEqual(result["status"], "ok")
        issue = SellIssue.objects.get()
        self.assertEqual(issue.user, self.owner)
        self.assertEqual(str(issue.asking_price), "12345.67")
        self.assertEqual(result["data"]["asking_price"], "12345.67")
        self.assertIn(str(issue.pk), json.dumps(result))
        self.assertFalse(Post.objects.exists())

    def test_repair_persistence_and_other_owner_cannot_create(self):
        operation = call("create_repair_issue", used_car_id=str(self.car.pk), description="Confirmed brake noise report")
        result = self.turn("repair", build_repair_agent, operation)
        self.assertEqual(result["status"], "ok")
        issue = RepairIssue.objects.get()
        self.assertEqual(result["data"]["id"], str(issue.pk))
        self.assertEqual(issue.user, self.owner)
        denied = self.turn("repair", build_repair_agent, operation, user=self.other)
        self.assertEqual(denied["status"], "error")
        self.assertEqual(RepairIssue.objects.count(), 1)
        self.assertFalse(Post.objects.exists())

    def test_buyer_private_request_persists(self):
        result = self.turn("buyer", build_buyer_agent, call("create_or_update_buy_issue",
            buy_issue_id=None, description="Confirmed commuter request", max_budget="15000.25"))
        self.assertEqual(result["status"], "ok")
        issue = BuyIssue.objects.get()
        self.assertEqual(issue.user, self.owner)
        self.assertIn(str(issue.pk), json.dumps(result))
        self.assertFalse(Post.objects.exists())

    def test_valuation_selected_public_records_and_insufficient_data(self):
        posts = [Post.objects.create(issue_id=uuid4(), issue_type="sell", status="published",
            title="Test fixture only", content="Not production market evidence", post_data={
                "make": "Toyota", "model": "Camry", "year": 2024, "mileage": 40000,
                "asking_price": price,
            }) for price in ("10000.00", "12000.00", "15000.00")]
        result = self.turn("valuation", build_valuation_agent, call("calculate_value_range",
            used_car_id=str(self.car.pk), comparable_ids=[str(post.pk) for post in posts]))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["median"], "12000.00")
        self.assertEqual(result["ids"]["post_ids"], [str(post.pk) for post in posts])
        result = self.turn("valuation", build_valuation_agent, call("calculate_value_range",
            used_car_id=str(self.car.pk), comparable_ids=[]))
        self.assertEqual(result["status"], "insufficient_data")
        self.assertIsNone(result["data"]["median"])
