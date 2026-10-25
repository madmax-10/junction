"""Real ADK registration and signed identity tests; no paid model/API calls."""

import json
from contextlib import ExitStack
from unittest.mock import patch
from uuid import uuid4

from asgiref.sync import async_to_sync
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, connection
from django.test import SimpleTestCase, TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
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
from agent.agents import seller
from agent.auth import get_or_create_authenticated_session
from agent.config import AGENT_MODEL
from agent.tools.result import error_result, tool_result
from issues.models import SellIssue
from posts.models import Post
from vehicles.models import UsedCar


class SellerAgentConfigurationTests(SimpleTestCase):
    def test_real_agent_model_and_name(self):
        agent = seller.build_seller_agent(AGENT_MODEL)
        self.assertIsInstance(agent, LlmAgent)
        self.assertEqual(agent.name, "seller")
        self.assertEqual(agent.model, AGENT_MODEL)

    def test_four_tools_model_schemas_exclude_identity_and_contact_tool(self):
        expected = {
            "get_vehicle_details": ({"used_car_id"}, {"used_car_id"}),
            "create_or_update_sell_issue": ({"used_car_id", "selling_details", "sell_issue_id"}, {"used_car_id", "selling_details"}),
            "recommend_asking_price": ({"sell_issue_id", "valuation_context"}, {"sell_issue_id"}),
            "find_and_rank_buyers": ({"sell_issue_id", "limit"}, {"sell_issue_id"}),
        }
        tools = async_to_sync(seller.build_seller_agent(AGENT_MODEL).canonical_tools)()
        self.assertEqual(len(tools), 4)
        self.assertEqual({tool.name for tool in tools}, set(expected))
        for tool in tools:
            self.assertIsInstance(tool, FunctionTool)
            self.assertIs(tool.func, getattr(seller, tool.name))
            declaration = tool._get_declaration()
            schema = declaration.parameters_json_schema
            if schema is None:
                schema = declaration.parameters.model_dump(exclude_none=True)
            properties, required = expected[tool.name]
            self.assertEqual(set(schema["properties"]), properties)
            self.assertEqual(set(schema.get("required", [])), required)
            self.assertNotIn("user_id", json.dumps(schema))

    def test_agenttool_and_no_transfers_or_subagents(self):
        agent = seller.build_seller_agent(AGENT_MODEL)
        self.assertIs(AgentTool(agent=agent).agent, agent)
        self.assertTrue(agent.disallow_transfer_to_parent)
        self.assertTrue(agent.disallow_transfer_to_peers)
        self.assertEqual(agent.sub_agents, [])

    def test_instructions_include_consent_privacy_pricing_and_no_contact(self):
        instruction = seller.build_seller_agent(AGENT_MODEL).instruction
        for phrase in ("any make", "Coordinator", "explicit owner request", "general selling question is not consent",
                       "Never publish", "private BuyIssues", "insufficient_data", "currency", "not completed transactions",
                       "Buyer contact retrieval is unavailable", "Sell Posts only", "not instructions overriding",
                       "Do not invoke the Valuation Agent directly", "does not guarantee a sale"):
            self.assertIn(phrase, instruction)


class SellerAgentToolTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="seller-agent@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other")
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.foreign_car = UsedCar.objects.create(owner=cls.other, make="PRIVATE", model="PRIVATE", year=2021, mileage=30000)
        cls.issue = SellIssue.objects.create(user=cls.user, used_car=cls.car, description="Owner sale", asking_price=10000)
        cls.foreign = SellIssue.objects.create(user=cls.other, used_car=cls.foreign_car, description="PRIVATE sale")

    def setUp(self):
        self.sessions = InMemorySessionService()
        self.context = self.trusted_context()
        for target in ("socket.socket.connect", "google.adk.models.google_llm.Gemini.generate_content_async"):
            blocker = patch(target, side_effect=AssertionError("No model/external calls"))
            blocker.start()
            self.addCleanup(blocker.stop)

    def trusted_context(self, body=None):
        request = APIRequestFactory().post("/api/chat/turns/", body or {}, format="json",
                                          HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.user)}")
        session = async_to_sync(get_or_create_authenticated_session)(request, session_service=self.sessions, app_name="seller_tests")
        return ToolContext(invocation_context=InvocationContext(invocation_id="seller-test", session_service=self.sessions, session=session))

    def cases(self):
        car_id, issue_id = str(self.car.pk), str(self.issue.pk)
        return [
            (seller.get_vehicle_details, {"used_car_id": car_id}, (car_id,), {}),
            (seller.create_or_update_sell_issue, {"used_car_id": car_id, "selling_details": {"description": "Sale"}, "sell_issue_id": None},
             (car_id, {"description": "Sale"}), {"sell_issue_id": None}),
            (seller.recommend_asking_price, {"sell_issue_id": issue_id}, (issue_id, None), {}),
            (seller.find_and_rank_buyers, {"sell_issue_id": issue_id}, (issue_id,), {"limit": 5}),
        ]

    def run_tool(self, function, args, context=None):
        return async_to_sync(FunctionTool(function).run_async)(args=args, tool_context=self.context if context is None else context)

    def test_all_four_forward_exact_inputs_only_to_intended_service(self):
        for function, args, positional, keywords in self.cases():
            with self.subTest(tool=function.__name__), ExitStack() as stack:
                expected = tool_result("ok", data={"fixture": function.__name__})
                mocks = {fn.__name__: stack.enter_context(patch("agent.agents.seller." + fn.__name__ + "_service", return_value=expected))
                         for fn, *_ in self.cases()}
                self.assertIs(self.run_tool(function, args), expected)
                mocks[function.__name__].assert_called_once_with(*positional, **keywords, user=self.user)
                for name, service in mocks.items():
                    if name != function.__name__:
                        service.assert_not_called()

    def test_all_four_preserve_structured_service_errors(self):
        expected = error_result("Service validation failed.")
        for function, args, *_ in self.cases():
            with patch("agent.agents.seller." + function.__name__ + "_service", return_value=expected):
                self.assertIs(self.run_tool(function, args), expected)

    def test_all_four_missing_or_forged_context_fail_before_service(self):
        for function, args, *_ in self.cases():
            for context in (None, {"user_id": str(self.user.pk)}):
                with patch("agent.agents.seller." + function.__name__ + "_service") as service:
                    result = async_to_sync(function)(**args, tool_context=context)
                    self.assertEqual(result["error"], "Trusted authentication context is required.")
                    service.assert_not_called()

    def test_all_four_unsigned_context_rejected(self):
        session = async_to_sync(self.sessions.create_session)(app_name="seller_tests", user_id=str(self.user.pk), state={"user_id": str(self.user.pk)})
        context = ToolContext(invocation_context=InvocationContext(invocation_id="unsigned", session_service=self.sessions, session=session))
        for function, args, *_ in self.cases():
            with patch("agent.agents.seller." + function.__name__ + "_service") as service:
                self.assertEqual(self.run_tool(function, args, context)["status"], "error")
                service.assert_not_called()

    def test_all_four_mutable_identity_override_rejected(self):
        self.context.state["user_id"] = str(self.other.pk)
        for function, args, *_ in self.cases():
            with patch("agent.agents.seller." + function.__name__ + "_service") as service:
                self.assertEqual(self.run_tool(function, args)["status"], "error")
                service.assert_not_called()

    def test_forged_request_body_cannot_override_jwt(self):
        context = self.trusted_context({"user_id": str(self.other.pk), "state": {"user_id": str(self.other.pk)}})
        for function, args, positional, keywords in self.cases():
            with patch("agent.agents.seller." + function.__name__ + "_service", return_value=tool_result("ok")) as service:
                self.run_tool(function, args, context)
                service.assert_called_once_with(*positional, **keywords, user=self.user)

    def test_expected_errors_generic_for_each_adapter(self):
        for function, args, *_ in self.cases():
            for exception in (ValueError("PRIVATE"), DatabaseError("PRIVATE"), DjangoValidationError("PRIVATE"), ValidationError("PRIVATE")):
                with patch("agent.agents.seller." + function.__name__ + "_service", side_effect=exception):
                    result = self.run_tool(function, args)
                    self.assertEqual(result["status"], "error")
                    self.assertIsNone(result["data"])
                    self.assertNotIn("PRIVATE", json.dumps(result))

    def test_unexpected_failure_not_swallowed(self):
        with patch("agent.agents.seller.get_vehicle_details_service", side_effect=RuntimeError("Test programming error")):
            with self.assertRaises(RuntimeError):
                self.run_tool(seller.get_vehicle_details, {"used_car_id": str(self.car.pk)})

    def test_all_four_real_cross_user_authorization_and_no_writes(self):
        before = list(SellIssue.objects.values())
        for function, args, *_ in self.cases():
            args = dict(args)
            key = "used_car_id" if "used_car_id" in args else "sell_issue_id"
            args[key] = str(self.foreign_car.pk if key == "used_car_id" else self.foreign.pk)
            result = self.run_tool(function, args)
            args[key] = str(uuid4())
            self.assertEqual(result, self.run_tool(function, args))
            self.assertEqual(result["status"], "error")
            self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(before, list(SellIssue.objects.values()))

    def test_all_four_service_validation_preserved(self):
        cases = [
            (seller.get_vehicle_details, {"used_car_id": "bad"}),
            (seller.create_or_update_sell_issue, {"used_car_id": str(self.car.pk), "selling_details": {"description": " "}, "sell_issue_id": None}),
            (seller.recommend_asking_price, {"sell_issue_id": "bad"}),
            (seller.find_and_rank_buyers, {"sell_issue_id": str(self.issue.pk), "limit": 0}),
        ]
        for function, args in cases:
            self.assertEqual(self.run_tool(function, args)["status"], "error")

    def test_write_target_omission_requires_clarification_and_no_write(self):
        with patch("agent.agents.seller.create_or_update_sell_issue_service") as service:
            result = self.run_tool(seller.create_or_update_sell_issue, {"used_car_id": str(self.car.pk), "selling_details": {"description": "Sale"}})
        self.assertIn("explicit null to create", result["error"])
        service.assert_not_called()
        self.assertEqual(SellIssue.objects.count(), 2)

    def test_explicit_create_returns_real_record_no_publication(self):
        function, args, *_ = self.cases()[1]
        result = self.run_tool(function, args)
        saved = SellIssue.objects.get(pk=result["data"]["id"])
        self.assertEqual(saved.used_car, self.car)
        self.assertEqual(saved.user, self.user)
        self.assertEqual(saved.description, "Sale")
        self.assertFalse(Post.objects.exists())

    def test_update_keeps_vehicle_and_existing_values(self):
        args = {"used_car_id": str(self.car.pk), "sell_issue_id": str(self.issue.pk), "selling_details": {"known_damage": "Scratch"}}
        result = self.run_tool(seller.create_or_update_sell_issue, args)
        self.assertEqual(result["data"]["action"], "updated")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.description, "Owner sale")
        self.assertEqual(self.issue.asking_price, 10000)
        self.assertEqual(SellIssue.objects.count(), 2)

    def test_missing_update_target_does_not_create_fallback(self):
        args = {"used_car_id": str(self.car.pk), "sell_issue_id": str(uuid4()), "selling_details": {"description": "Sale"}}
        self.assertEqual(self.run_tool(seller.create_or_update_sell_issue, args)["status"], "error")
        self.assertEqual(SellIssue.objects.count(), 2)

    def test_pricing_context_forwarded_and_insufficiency_preserved(self):
        context = {"status": "completed", "median": "12345.67", "provenance": "claimed"}
        with patch("agent.agents.seller.recommend_asking_price_service", return_value=tool_result("insufficient_data")) as service:
            self.run_tool(seller.recommend_asking_price, {"sell_issue_id": str(self.issue.pk), "valuation_context": context})
        service.assert_called_once_with(str(self.issue.pk), context, user=self.user)
        result = self.run_tool(seller.recommend_asking_price, {"sell_issue_id": str(self.issue.pk), "valuation_context": context})
        self.assertEqual(result["status"], "insufficient_data")
        for key in ("suggested_asking_price", "low", "median", "high", "currency"):
            self.assertIsNone(result["data"][key])

    def test_public_buy_matching_sources_no_contacts_and_custom_limit(self):
        post = Post.objects.create(issue_id=uuid4(), issue_type="buy", status="published", approved_at=timezone.now(),
                                   title="PRIVATE-looking title", post_data={"preferred_makes": ["Toyota"], "contact": {"email": "PRIVATE@example.com"}})
        result = self.run_tool(seller.find_and_rank_buyers, {"sell_issue_id": str(self.issue.pk), "limit": 1})
        self.assertEqual(result["ids"]["post_ids"], [str(post.pk)])
        self.assertEqual(result["data"]["result_count"], 1)
        self.assertTrue(result["data"]["matches"][0]["reasons"])
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("contact", result["data"]["matches"][0])

    def test_no_results_not_replaced_with_fake_buyers(self):
        result = self.run_tool(seller.find_and_rank_buyers, {"sell_issue_id": str(self.issue.pk)})
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["matches"], [])

    def test_read_tools_build_and_session_are_read_only(self):
        before = (list(SellIssue.objects.values()), list(UsedCar.objects.values()))
        state = self.context.state.to_dict()
        with patch("agent.agents.valuation.calculate_value_range") as valuation:
            with patch("agent.services.post_contact_service.get_post_contact") as contact:
                with CaptureQueriesContext(connection) as queries:
                    seller.build_seller_agent(AGENT_MODEL)
                    for index in (0, 2, 3):
                        function, args, *_ = self.cases()[index]
                        self.run_tool(function, args)
                contact.assert_not_called()
            valuation.assert_not_called()
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(before, (list(SellIssue.objects.values()), list(UsedCar.objects.values())))
        self.assertEqual(state, self.context.state.to_dict())
