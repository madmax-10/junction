"""Real ADK agent/bridge tests with synthetic fixtures and no model calls."""

import json
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from asgiref.sync import async_to_sync
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, connection
from django.test import SimpleTestCase, TestCase
from django.test.utils import CaptureQueriesContext
from google.adk.agents import LlmAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools.function_tool import FunctionTool
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from agent.agents.valuation import build_valuation_agent, calculate_value_range
from agent.auth import get_or_create_authenticated_session
from agent.config import AGENT_MODEL
from agent.tools.result import tool_result
from posts.models import Post
from django.utils import timezone
from vehicles.models import UsedCar


class ValuationAgentConfigurationTests(SimpleTestCase):
    def test_builds_real_agent_with_supplied_model_and_stable_name(self):
        agent = build_valuation_agent(AGENT_MODEL)
        self.assertIsInstance(agent, LlmAgent)
        self.assertEqual(agent.name, "valuation")
        self.assertEqual(agent.model, AGENT_MODEL)
        self.assertTrue(agent.description)
        self.assertTrue(agent.disallow_transfer_to_parent)
        self.assertTrue(agent.disallow_transfer_to_peers)

    def test_only_valuation_tool_is_registered_and_identity_is_not_a_model_argument(self):
        agent = build_valuation_agent(AGENT_MODEL)
        tools = async_to_sync(agent.canonical_tools)()
        self.assertEqual(len(tools), 1)
        self.assertIsInstance(tools[0], FunctionTool)
        self.assertIs(tools[0].func, calculate_value_range)
        declaration = tools[0]._get_declaration()
        self.assertEqual(declaration.name, "calculate_value_range")
        schema = declaration.parameters_json_schema
        if schema is None:
            schema = declaration.parameters.model_dump(exclude_none=True)
        self.assertEqual(set(schema["properties"]), {"used_car_id", "comparable_ids"})
        self.assertEqual(set(schema["required"]), {"used_car_id", "comparable_ids"})

    def test_agenttool_can_wrap_the_agent_without_running_a_model(self):
        agent = build_valuation_agent(AGENT_MODEL)
        tool = AgentTool(agent=agent)
        self.assertIs(tool.agent, agent)


class ValuationAgentToolTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="valuation-a@example.com", name="Owner")
        cls.other = User.objects.create_user(email="valuation-b@example.com", name="Other")
        cls.car = UsedCar.objects.create(
            owner=cls.user, make="Toyota", model="Camry", year=2024, mileage=40000,
        )

    def weighting_fixture(self, subject, comparables):
        return {"weights": [{"post_id": row["post_id"], "weight": "1", "reason": "Matching make/model fixture"} for row in comparables]}

    def setUp(self):
        mock = patch("agent.services.ai_valuation_service.gemini_weights", side_effect=self.weighting_fixture)
        mock.start()
        self.addCleanup(mock.stop)
        self.sessions = InMemorySessionService()
        request = APIRequestFactory().post(
            "/api/chat/turns/", {}, format="json",
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.user)}",
        )
        session = async_to_sync(get_or_create_authenticated_session)(
            request, session_service=self.sessions, app_name="valuation_tests",
        )
        self.context = ToolContext(invocation_context=InvocationContext(
            invocation_id="valuation-test", session_service=self.sessions, session=session,
        ))

    def posts(self):
        return [Post.objects.create(
            approved_at=timezone.now(), issue_id=uuid4(), issue_type=Post.IssueType.SELL, status=Post.Status.PUBLISHED,
            title="Synthetic Toyota fixture", content="Synthetic test data only",
            post_data={"make": "Toyota", "model": "Camry", "year": 2024,
                       "mileage": 40000, "asking_price": price},
        ) for price in ("10000.00", "12000.00", "15000.00")]

    def test_real_adk_tool_delegates_with_the_user_from_the_real_bridge(self):
        expected = tool_result("ok", data={"price_basis": "asking"}, provenance="published_sell_posts")
        tool = FunctionTool(calculate_value_range)
        with patch("agent.agents.valuation.calculate_value_range_service", return_value=expected) as service:
            result = async_to_sync(tool.run_async)(
                args={"used_car_id": str(self.car.id), "comparable_ids": []},
                tool_context=self.context,
            )
        service.assert_called_once_with(str(self.car.id), [], user=self.user)
        self.assertIs(result, expected)

    def test_successful_valuation_is_structured_and_json_compatible(self):
        posts = self.posts()
        result = async_to_sync(calculate_value_range)(
            str(self.car.id), [str(post.id) for post in posts], self.context,
        )
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(result["status"], "ok")
        self.assertIsNone(result["data"]["median"])
        self.assertTrue(Decimal(result["data"]["estimated_value"]) > Decimal("12000"))
        self.assertEqual(result["data"]["price_basis"], "asking")
        self.assertEqual(result["provenance"], "published_sell_posts")
        self.assertTrue(result["data"]["limitations"])
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_insufficient_data_and_limitations_are_preserved(self):
        result = async_to_sync(calculate_value_range)(str(self.car.id), [], self.context)
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["data"]["sample_size"], 0)
        self.assertIsNone(result["data"]["median"])
        self.assertTrue(result["data"]["limitations"])
        self.assertEqual(result["provenance"], "published_sell_posts")

    def test_missing_or_non_adk_context_cannot_reach_service(self):
        for context in (None, {"user_id": str(self.user.id)}):
            with self.subTest(context=context):
                with patch("agent.agents.valuation.calculate_value_range_service") as service:
                    with self.assertNumQueries(0):
                        result = async_to_sync(calculate_value_range)(str(self.car.id), [], context)
                    service.assert_not_called()
                self.assertEqual(result["status"], "error")
                self.assertIsNone(result["data"])

    def test_raw_unsigned_session_cannot_reach_service(self):
        session = async_to_sync(self.sessions.create_session)(
            app_name="valuation_tests", user_id=str(self.user.id),
            state={"user_id": str(self.user.id)},
        )
        context = ToolContext(invocation_context=InvocationContext(
            invocation_id="untrusted", session_service=self.sessions, session=session,
        ))
        with patch("agent.agents.valuation.calculate_value_range_service") as service:
            with self.assertNumQueries(0):
                result = async_to_sync(calculate_value_range)(str(self.car.id), [], context)
            service.assert_not_called()
        self.assertEqual(result["status"], "error")

    def test_tampered_identity_cannot_reach_service(self):
        self.context.state["user_id"] = str(self.other.id)
        with patch("agent.agents.valuation.calculate_value_range_service") as service:
            with self.assertNumQueries(0):
                result = async_to_sync(calculate_value_range)(str(self.car.id), [], self.context)
            service.assert_not_called()
        self.assertEqual(result["status"], "error")

    def test_other_users_vehicle_and_missing_vehicle_are_indistinguishable(self):
        foreign = UsedCar.objects.create(
            owner=self.other, make="Honda", model="PRIVATE model", year=2024, mileage=1,
        )
        results = [async_to_sync(calculate_value_range)(str(car_id), [], self.context)
                   for car_id in (foreign.id, uuid4())]
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[0]["error"], "Vehicle not found.")
        self.assertNotIn("PRIVATE", json.dumps(results))
        self.assertEqual(results[0]["ids"], {})

    def test_expected_service_failures_return_generic_errors(self):
        for exception in (DatabaseError("SECRET SQL"), ValueError("SECRET argument"),
                          DjangoValidationError("SECRET record"), ValidationError("SECRET detail")):
            with self.subTest(exception=type(exception).__name__):
                with patch("agent.agents.valuation.calculate_value_range_service", side_effect=exception):
                    result = async_to_sync(calculate_value_range)(str(self.car.id), [], self.context)
                self.assertEqual(result["status"], "error")
                self.assertNotIn("SECRET", json.dumps(result))
                self.assertIsNone(result["data"])

    def test_disabled_user_is_rejected_before_service(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        with patch("agent.agents.valuation.calculate_value_range_service") as service:
            result = async_to_sync(calculate_value_range)(str(self.car.id), [], self.context)
            service.assert_not_called()
        self.assertEqual(result["status"], "error")

    def test_build_and_calculation_do_not_call_a_model_or_write_records(self):
        posts = self.posts()
        with patch("google.adk.models.google_llm.Gemini.generate_content_async") as model_call:
            with CaptureQueriesContext(connection) as queries:
                build_valuation_agent(AGENT_MODEL)
                result = async_to_sync(calculate_value_range)(
                    str(self.car.id), [str(post.id) for post in posts], self.context,
                )
            model_call.assert_not_called()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
