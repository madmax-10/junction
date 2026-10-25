"""Real ADK tools and JWT-bound contexts; isolated ORM, no paid model/API calls."""

import json
from contextlib import ExitStack
from unittest.mock import patch
from uuid import uuid4

import httpx
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
from agent.agents import repair
from agent.auth import get_or_create_authenticated_session
from agent.config import AGENT_MODEL
from agent.tools.result import error_result, tool_result
from issues.models import RepairIssue
from posts.models import Post
from vehicles.models import UsedCar


class RepairAgentConfigurationTests(SimpleTestCase):
    def test_real_agent_and_supplied_model(self):
        agent = repair.build_repair_agent(AGENT_MODEL)
        self.assertIsInstance(agent, LlmAgent)
        self.assertEqual(agent.name, "repair")
        self.assertEqual(agent.model, AGENT_MODEL)
        self.assertTrue(agent.description)

    def test_exactly_six_tools_and_no_model_identity_parameters(self):
        expected = {
            "create_repair_issue": ({"used_car_id", "description"}, {"used_car_id", "description"}),
            "save_diagnosis": ({"repair_issue_id", "symptoms", "ai_analysis"}, {"repair_issue_id", "symptoms", "ai_analysis"}),
            "search_similar_repairs": ({"repair_issue_id", "limit"}, {"repair_issue_id"}),
            "estimate_repair_cost": ({"repair_issue_id"}, {"repair_issue_id"}),
            "find_nearby_mechanics": ({"repair_issue_id", "latitude", "longitude", "radius_meters", "limit"}, {"repair_issue_id", "latitude", "longitude"}),
            "record_resolution": ({"repair_issue_id", "resolution_details"}, {"repair_issue_id", "resolution_details"}),
        }
        tools = async_to_sync(repair.build_repair_agent(AGENT_MODEL).canonical_tools)()
        self.assertEqual(len(tools), 6)
        self.assertEqual({tool.name for tool in tools}, set(expected))
        for tool in tools:
            with self.subTest(tool=tool.name):
                self.assertIsInstance(tool, FunctionTool)
                self.assertIs(tool.func, getattr(repair, tool.name))
                declaration = tool._get_declaration()
                schema = declaration.parameters_json_schema
                if schema is None:
                    schema = declaration.parameters.model_dump(exclude_none=True)
                properties, required = expected[tool.name]
                self.assertEqual(set(schema["properties"]), properties)
                self.assertEqual(set(schema.get("required", [])), required)
                self.assertNotIn("user_id", json.dumps(schema))
                self.assertNotIn("tool_context", schema["properties"])

    def test_agenttool_wrapping_no_independent_transfers(self):
        agent = repair.build_repair_agent(AGENT_MODEL)
        self.assertIs(AgentTool(agent=agent).agent, agent)
        self.assertTrue(agent.disallow_transfer_to_parent)
        self.assertTrue(agent.disallow_transfer_to_peers)
        self.assertEqual(agent.sub_agents, [])

    def test_instructions_cover_safety_privacy_consent_and_evidence(self):
        instruction = repair.build_repair_agent(AGENT_MODEL).instruction
        for phrase in ("any make", "Coordinator", "owner explicitly requests", "consent", "preliminary AI analysis",
                       "uncertainty", "anecdotal", "insufficient_data", "authorized location coordinates",
                       "brake failure", "steering failure", "fuel leaks", "smoke", "fire", "severe overheating",
                       "sudden power loss", "Never publish private data", "Do not invoke Buyer", "configuration error"):
            self.assertIn(phrase, instruction)


class RepairAgentToolTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="repair-agent@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE-other@example.com", name="Other")
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.other_car = UsedCar.objects.create(owner=cls.other, make="Toyota", model="Corolla", year=2021, mileage=30000)
        cls.issue = RepairIssue.objects.create(user=cls.user, used_car=cls.car, description="Brakes grinding")
        cls.foreign = RepairIssue.objects.create(user=cls.other, used_car=cls.other_car, description="PRIVATE issue")

    def setUp(self):
        self.sessions = InMemorySessionService()
        self.context = self.trusted_context()
        for target in ("socket.socket.connect", "google.adk.models.google_llm.Gemini.generate_content_async"):
            blocker = patch(target, side_effect=AssertionError("No external/model calls"))
            blocker.start()
            self.addCleanup(blocker.stop)

    def trusted_context(self, body=None):
        request = APIRequestFactory().post("/api/chat/turns/", body or {}, format="json",
                                          HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.user)}")
        session = async_to_sync(get_or_create_authenticated_session)(request, session_service=self.sessions, app_name="repair_tests")
        return ToolContext(invocation_context=InvocationContext(
            invocation_id="repair-test", session_service=self.sessions, session=session,
        ))

    def cases(self):
        issue_id = str(self.issue.pk)
        return [
            (repair.create_repair_issue, {"used_car_id": str(self.car.pk), "description": "No start"}, (str(self.car.pk), "No start"), {}),
            (repair.save_diagnosis, {"repair_issue_id": issue_id, "symptoms": {"confirmed": ["Brakes grinding"]},
                                     "ai_analysis": {"possibilities": [{"cause": "Pads", "uncertainty": "Needs inspection"}]}},
             (issue_id, {"confirmed": ["Brakes grinding"]}, {"possibilities": [{"cause": "Pads", "uncertainty": "Needs inspection"}]}), {}),
            (repair.search_similar_repairs, {"repair_issue_id": issue_id}, (issue_id,), {"limit": 5}),
            (repair.estimate_repair_cost, {"repair_issue_id": issue_id}, (issue_id,), {}),
            (repair.find_nearby_mechanics, {"repair_issue_id": issue_id, "latitude": 30.2672, "longitude": -97.7431},
             (issue_id, 30.2672, -97.7431), {"radius_meters": 10000, "limit": 5}),
            (repair.record_resolution, {"repair_issue_id": issue_id, "resolution_details": {
                "status": "unresolved", "resolution_details": {"method": "mechanic", "work_performed": "Pads replaced; still grinding"}}},
             (issue_id, {"status": "unresolved", "resolution_details": {"method": "mechanic", "work_performed": "Pads replaced; still grinding"}}), {}),
        ]

    def run_tool(self, function, args, context=None):
        return async_to_sync(FunctionTool(function).run_async)(args=args, tool_context=self.context if context is None else context)

    def test_all_six_adapters_forward_exact_args_only_to_intended_service(self):
        for function, args, positional, keywords in self.cases():
            with self.subTest(tool=function.__name__), ExitStack() as stack:
                expected = tool_result("ok", data={"test": function.__name__})
                mocks = {fn.__name__: stack.enter_context(patch("agent.agents.repair." + fn.__name__ + "_service", return_value=expected))
                         for fn, *_ in self.cases()}
                result = self.run_tool(function, args)
                self.assertIs(result, expected)
                mocks[function.__name__].assert_called_once_with(*positional, **keywords, user=self.user)
                for name, mock in mocks.items():
                    if name != function.__name__:
                        mock.assert_not_called()

    def test_all_six_preserve_service_error_envelopes(self):
        for function, args, *_ in self.cases():
            expected = error_result("Service validation failed.")
            with self.subTest(tool=function.__name__), patch("agent.agents.repair." + function.__name__ + "_service", return_value=expected):
                self.assertIs(self.run_tool(function, args), expected)

    def test_all_six_missing_or_forged_context_fail_before_service(self):
        for function, args, *_ in self.cases():
            for context in (None, {"user_id": str(self.user.pk)}):
                with self.subTest(tool=function.__name__, context=context), patch("agent.agents.repair." + function.__name__ + "_service") as service:
                    result = async_to_sync(function)(**args, tool_context=context)
                    self.assertEqual(result["error"], "Trusted authentication context is required.")
                    service.assert_not_called()

    def test_all_six_unsigned_adk_contexts_fail(self):
        session = async_to_sync(self.sessions.create_session)(app_name="repair_tests", user_id=str(self.user.pk), state={"user_id": str(self.user.pk)})
        context = ToolContext(invocation_context=InvocationContext(invocation_id="unsigned", session_service=self.sessions, session=session))
        for function, args, *_ in self.cases():
            with self.subTest(tool=function.__name__), patch("agent.agents.repair." + function.__name__ + "_service") as service:
                self.assertEqual(self.run_tool(function, args, context)["status"], "error")
                service.assert_not_called()

    def test_all_six_mutable_state_cannot_override_signed_identity(self):
        self.context.state["user_id"] = str(self.other.pk)
        for function, args, *_ in self.cases():
            with self.subTest(tool=function.__name__), patch("agent.agents.repair." + function.__name__ + "_service") as service:
                self.assertEqual(self.run_tool(function, args)["status"], "error")
                service.assert_not_called()

    def test_forged_request_identity_does_not_override_jwt(self):
        context = self.trusted_context({"user_id": str(self.other.pk), "state": {"user_id": str(self.other.pk)}})
        for function, args, positional, keywords in self.cases():
            with patch("agent.agents.repair." + function.__name__ + "_service", return_value=tool_result("ok")) as service:
                self.run_tool(function, args, context)
                service.assert_called_once_with(*positional, **keywords, user=self.user)

    def test_expected_service_exceptions_are_generic_for_all_tools(self):
        for function, args, *_ in self.cases():
            for exception in (ValueError("PRIVATE"), DatabaseError("PRIVATE"), DjangoValidationError("PRIVATE"), ValidationError("PRIVATE")):
                with self.subTest(tool=function.__name__, error=type(exception).__name__), patch("agent.agents.repair." + function.__name__ + "_service", side_effect=exception):
                    result = self.run_tool(function, args)
                    self.assertEqual(result["status"], "error")
                    self.assertIsNone(result["data"])
                    self.assertNotIn("PRIVATE", json.dumps(result))

    def test_unexpected_programming_failure_is_not_false_success(self):
        with patch("agent.agents.repair.estimate_repair_cost_service", side_effect=RuntimeError("test programming failure")):
            with self.assertRaises(RuntimeError):
                self.run_tool(repair.estimate_repair_cost, {"repair_issue_id": str(self.issue.pk)})

    def test_all_six_foreign_references_do_not_bypass_ownership(self):
        before = list(RepairIssue.objects.values())
        for function, args, *_ in self.cases():
            args = dict(args)
            key = "used_car_id" if function is repair.create_repair_issue else "repair_issue_id"
            args[key] = str(self.other_car.pk if key == "used_car_id" else self.foreign.pk)
            result = self.run_tool(function, args)
            args[key] = str(uuid4())
            self.assertEqual(result, self.run_tool(function, args))
            self.assertEqual(result["status"], "error")
            self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(before, list(RepairIssue.objects.values()))

    def test_all_six_real_service_validation_remains_enforced(self):
        invalid = [
            (repair.create_repair_issue, {"used_car_id": str(self.car.pk), "description": " "}),
            (repair.save_diagnosis, {"repair_issue_id": str(self.issue.pk), "symptoms": {"unknown": []}, "ai_analysis": None}),
            (repair.search_similar_repairs, {"repair_issue_id": str(self.issue.pk), "limit": 0}),
            (repair.estimate_repair_cost, {"repair_issue_id": "bad"}),
            (repair.find_nearby_mechanics, {"repair_issue_id": str(self.issue.pk), "latitude": True, "longitude": -97}),
            (repair.record_resolution, {"repair_issue_id": str(self.issue.pk), "resolution_details": {}}),
        ]
        before = list(RepairIssue.objects.values())
        for function, args in invalid:
            self.assertEqual(self.run_tool(function, args)["status"], "error")
        self.assertEqual(before, list(RepairIssue.objects.values()))

    def test_real_issue_create_returns_persisted_identifier(self):
        result = self.run_tool(repair.create_repair_issue, {"used_car_id": str(self.car.pk), "description": "Owner reports no start"})
        saved = RepairIssue.objects.get(pk=result["data"]["id"])
        self.assertEqual(saved.user, self.user)
        self.assertEqual(saved.used_car, self.car)
        self.assertEqual(saved.description, "Owner reports no start")

    def test_real_diagnosis_keeps_uncertainty_and_status(self):
        function, args, *_ = self.cases()[1]
        self.assertEqual(self.run_tool(function, args)["status"], "ok")
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.ai_analysis, args["ai_analysis"])
        self.assertEqual(self.issue.symptoms, args["symptoms"])
        self.assertEqual(self.issue.status, "open")
        self.assertIsNone(self.issue.resolution_details)

    def test_empty_public_search_no_fabrication(self):
        result = self.run_tool(repair.search_similar_repairs, {"repair_issue_id": str(self.issue.pk)})
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["matches"], [])

    def test_real_public_search_preserves_attribution(self):
        post = Post.objects.create(issue_id=uuid4(), issue_type="repair", status="published", approved_at=timezone.now(),
                                   title="Brakes grinding", post_data={"owner_reported": True, "work_performed": "Owner reports pads replaced"})
        result = self.run_tool(repair.search_similar_repairs, {"repair_issue_id": str(self.issue.pk), "limit": 2})
        self.assertEqual(result["ids"]["post_ids"], [str(post.pk)])
        self.assertTrue(result["data"]["matches"][0]["reasons"])
        self.assertEqual(result["data"]["matches"][0]["provenance"], "community_owner_experience")

    def test_cost_insufficient_data_has_no_fallback_range(self):
        result = self.run_tool(repair.estimate_repair_cost, {"repair_issue_id": str(self.issue.pk)})
        self.assertEqual(result["status"], "insufficient_data")
        for field in ("low", "median", "high", "currency"):
            self.assertIsNone(result["data"][field])

    def test_missing_places_configuration_is_honest_error(self):
        function, args, *_ = self.cases()[4]
        with patch.dict("os.environ", {"GOOGLE_PLACES_API_KEY": ""}), patch("agent.services.repair_mechanic_service.httpx.post") as http:
            result = self.run_tool(function, args)
            http.assert_not_called()
        self.assertEqual(result["error"], "Google Places is not configured.")

    def test_real_places_service_receives_only_explicit_coordinates(self):
        function, args, *_ = self.cases()[4]
        args.update(radius_meters=2000, limit=2)
        with patch.dict("os.environ", {"GOOGLE_PLACES_API_KEY": "unit-test-placeholder"}), patch(
            "agent.services.repair_mechanic_service.httpx.post", return_value=httpx.Response(200, json={"places": []}),
        ) as http:
            result = self.run_tool(function, args)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["mechanics"], [])
        body = http.call_args.kwargs["json"]
        self.assertEqual(body["locationRestriction"]["circle"], {"center": {"latitude": 30.2672, "longitude": -97.7431}, "radius": 2000.0})
        self.assertNotIn(str(self.issue.pk), json.dumps(body))
        self.assertNotIn("Brakes", json.dumps(body))

    def test_real_resolution_unresolved_repeat_and_conflict_rules(self):
        function, args, *_ = self.cases()[5]
        self.assertEqual(self.run_tool(function, args)["data"]["status"], "unresolved")
        self.assertEqual(self.run_tool(function, args)["status"], "ok")
        args["resolution_details"]["status"] = "resolved"
        result = self.run_tool(function, args)
        self.assertTrue(result["data"]["owner_reported"])
        args["resolution_details"]["resolution_details"]["work_performed"] = "Different outcome"
        self.assertEqual(self.run_tool(function, args)["status"], "error")
        self.assertFalse(Post.objects.exists())

    def test_read_tools_agent_build_and_state_remain_unchanged(self):
        before = list(RepairIssue.objects.values())
        state_before = self.context.state.to_dict()
        with CaptureQueriesContext(connection) as queries:
            repair.build_repair_agent(AGENT_MODEL)
            self.run_tool(repair.search_similar_repairs, {"repair_issue_id": str(self.issue.pk)})
            self.run_tool(repair.estimate_repair_cost, {"repair_issue_id": str(self.issue.pk)})
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(before, list(RepairIssue.objects.values()))
        self.assertEqual(state_before, self.context.state.to_dict())

    def test_service_null_clear_contract_passes_without_coercion(self):
        args = {"repair_issue_id": str(self.issue.pk), "symptoms": None, "ai_analysis": None}
        self.assertEqual(self.run_tool(repair.save_diagnosis, args)["status"], "ok")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.symptoms)
        self.assertIsNone(self.issue.ai_analysis)

    def test_resolution_preserves_preliminary_context(self):
        self.issue.symptoms = {"confirmed": ["Brakes grinding"]}
        self.issue.ai_analysis = {"notes": "Uncertain"}
        self.issue.save(update_fields=["symptoms", "ai_analysis"])
        before = RepairIssue.objects.values().get(pk=self.issue.pk)
        function, args, *_ = self.cases()[5]
        self.run_tool(function, args)
        after = RepairIssue.objects.values().get(pk=self.issue.pk)
        for field in before.keys() - {"status", "resolution_details", "resolved_at", "updated_at"}:
            self.assertEqual(before[field], after[field])
