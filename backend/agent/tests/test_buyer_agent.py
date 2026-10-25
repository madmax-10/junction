"""Real ADK and JWT bridge tests; synthetic fixtures, no model/network calls."""

import json
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
from agent.agents.buyer import build_buyer_agent, search_and_rank_used
from agent.auth import get_or_create_authenticated_session
from agent.config import AGENT_MODEL
from agent.tools.result import error_result, tool_result
from issues.models import BuyIssue
from posts.models import Post


class BuyerAgentConfigurationTests(SimpleTestCase):
    def test_builder_returns_real_buyer_agent_with_supplied_model(self):
        agent = build_buyer_agent(AGENT_MODEL)
        self.assertIsInstance(agent, LlmAgent)
        self.assertEqual(agent.name, "buyer")
        self.assertEqual(agent.model, AGENT_MODEL)
        self.assertTrue(agent.description)

    def test_only_used_search_is_registered_with_no_model_identity_argument(self):
        agent = build_buyer_agent(AGENT_MODEL)
        tools = async_to_sync(agent.canonical_tools)()
        self.assertEqual(len(tools), 1)
        self.assertIsInstance(tools[0], FunctionTool)
        self.assertIs(tools[0].func, search_and_rank_used)
        declaration = tools[0]._get_declaration()
        self.assertEqual(declaration.name, "search_and_rank_used")
        schema = declaration.parameters_json_schema
        if schema is None:
            schema = declaration.parameters.model_dump(exclude_none=True)
        self.assertEqual(set(schema["properties"]), {"buy_issue_id", "limit"})
        self.assertEqual(set(schema["required"]), {"buy_issue_id"})

    def test_buyer_instructions_cover_current_evidence_and_scope(self):
        agent = build_buyer_agent(AGENT_MODEL)
        for phrase in ("Coordinator", "published Sell posts", "synthetic/demo provenance",
                       "no_results", "availability", "Those tools are not connected"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, agent.instruction)

    def test_agenttool_compatibility_without_automatic_transfers(self):
        agent = build_buyer_agent(AGENT_MODEL)
        self.assertIs(AgentTool(agent=agent).agent, agent)
        self.assertTrue(agent.disallow_transfer_to_parent)
        self.assertTrue(agent.disallow_transfer_to_peers)


class BuyerAgentToolTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="buyer-agent-a@example.com", name="Buyer A")
        cls.other = User.objects.create_user(email="PRIVATE-buyer@example.com", name="Other")
        cls.issue = BuyIssue.objects.create(
            user=cls.user, description="Need a Camry", max_budget=15000,
            preferences={"preferred_makes": ["Toyota"], "vehicle_type": "used"},
        )

    def setUp(self):
        self.sessions = InMemorySessionService()
        self.context = self.trusted_context()

    def trusted_context(self, *, body=None):
        request = APIRequestFactory().post(
            "/api/chat/turns/", body or {}, format="json",
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.user)}",
        )
        session = async_to_sync(get_or_create_authenticated_session)(
            request, session_service=self.sessions, app_name="buyer_tests",
        )
        return ToolContext(invocation_context=InvocationContext(
            invocation_id="buyer-test", session_service=self.sessions, session=session,
        ))

    def post(self, **changes):
        data = {"make": "Toyota", "model": "Camry", "year": 2020,
                "mileage": 40000, "asking_price": "12000.00"}
        data.update(changes)
        return Post.objects.create(
            issue_id=uuid4(), issue_type=Post.IssueType.SELL, status=Post.Status.PUBLISHED,
            title="Synthetic fixture", content="PRIVATE-looking text not returned", post_data=data,
        )

    def test_real_adk_tool_delegates_with_authenticated_user_and_explicit_limit(self):
        expected = tool_result("ok", data={"matches": [], "result_count": 0}, provenance="published_sell_posts")
        with patch("agent.agents.buyer.search_and_rank_used_service", return_value=expected) as service:
            result = async_to_sync(FunctionTool(search_and_rank_used).run_async)(
                args={"buy_issue_id": str(self.issue.id), "limit": 3}, tool_context=self.context,
            )
        service.assert_called_once_with(str(self.issue.id), limit=3, user=self.user)
        self.assertIs(result, expected)

    def test_real_adk_tool_preserves_default_limit_five(self):
        with patch("agent.agents.buyer.search_and_rank_used_service", return_value=tool_result("no_results")) as service:
            async_to_sync(FunctionTool(search_and_rank_used).run_async)(
                args={"buy_issue_id": str(self.issue.id)}, tool_context=self.context,
            )
        service.assert_called_once_with(str(self.issue.id), limit=5, user=self.user)

    def test_successful_real_search_is_structured_and_json_safe(self):
        post = self.post()
        result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["ids"]["post_ids"], [str(post.id)])
        self.assertEqual(result["data"]["matches"][0]["asking_price"], "12000.00")
        self.assertEqual(result["provenance"], "published_sell_posts")
        self.assertTrue(result["data"]["matches"][0]["reasons"])
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_no_results_is_not_replaced_with_fallback_listings(self):
        result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["matches"], [])
        self.assertEqual(result["data"]["result_count"], 0)
        self.assertEqual(result["ids"]["post_ids"], [])

    def test_existing_service_error_envelope_is_returned_unchanged(self):
        expected = error_result("Invalid saved Buy issue criteria.")
        with patch("agent.agents.buyer.search_and_rank_used_service", return_value=expected):
            result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
        self.assertIs(result, expected)

    def test_missing_or_non_adk_identity_cannot_reach_service(self):
        for context in (None, {"user_id": str(self.user.id)}):
            with self.subTest(context=context):
                with patch("agent.agents.buyer.search_and_rank_used_service") as service:
                    with self.assertNumQueries(0):
                        result = async_to_sync(search_and_rank_used)(str(self.issue.id), context)
                    service.assert_not_called()
                self.assertEqual(result["status"], "error")
                self.assertIsNone(result["data"])

    def test_unsigned_session_claiming_a_user_is_rejected(self):
        session = async_to_sync(self.sessions.create_session)(
            app_name="buyer_tests", user_id=str(self.user.id), state={"user_id": str(self.user.id)},
        )
        context = ToolContext(invocation_context=InvocationContext(
            invocation_id="unsigned", session_service=self.sessions, session=session,
        ))
        with patch("agent.agents.buyer.search_and_rank_used_service") as service:
            with self.assertNumQueries(0):
                result = async_to_sync(search_and_rank_used)(str(self.issue.id), context)
            service.assert_not_called()
        self.assertEqual(result["status"], "error")

    def test_forged_state_identity_is_rejected_before_database_access(self):
        self.context.state["user_id"] = str(self.other.id)
        with patch("agent.agents.buyer.search_and_rank_used_service") as service:
            with self.assertNumQueries(0):
                result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
            service.assert_not_called()
        self.assertEqual(result["status"], "error")

    def test_forged_chat_identity_cannot_change_jwt_identity(self):
        context = self.trusted_context(body={
            "user_id": str(self.other.id), "state": {"user_id": str(self.other.id)},
        })
        with patch("agent.agents.buyer.search_and_rank_used_service", return_value=tool_result("no_results")) as service:
            async_to_sync(search_and_rank_used)(str(self.issue.id), context)
        service.assert_called_once_with(str(self.issue.id), limit=5, user=self.user)

    def test_foreign_and_missing_buy_issue_are_indistinguishable(self):
        foreign = BuyIssue.objects.create(user=self.other, description="PRIVATE needs", preferences={})
        results = [async_to_sync(search_and_rank_used)(str(issue_id), self.context)
                   for issue_id in (foreign.id, uuid4())]
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[0]["error"], "Buy issue not found.")
        self.assertNotIn("PRIVATE", json.dumps(results))
        self.assertEqual(results[0]["ids"], {})

    def test_synthetic_provenance_is_preserved(self):
        self.post(is_synthetic=True)
        result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
        match = result["data"]["matches"][0]
        self.assertEqual(match["provenance"], "synthetic_demo")
        self.assertEqual(match["synthetic_flags"], {"is_synthetic": True})
        self.assertTrue(any("synthetic/demo" in reason for reason in match["reasons"]))

    def test_unpublished_listings_and_private_contact_are_not_exposed(self):
        draft = self.post()
        Post.objects.filter(pk=draft.id).update(status=Post.Status.DRAFT)
        post = self.post(contact={"email": "PRIVATE@example.com"}, owner_id=str(self.other.id))
        result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
        self.assertEqual(result["ids"]["post_ids"], [str(post.id)])
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("owner_id", json.dumps(result))

    def test_expected_service_exceptions_are_safe_generic_errors(self):
        for exception in (DatabaseError("PRIVATE SQL"), ValueError("PRIVATE arguments"),
                          DjangoValidationError("PRIVATE record"), ValidationError("PRIVATE details")):
            with self.subTest(exception=type(exception).__name__):
                with patch("agent.agents.buyer.search_and_rank_used_service", side_effect=exception):
                    result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
                self.assertEqual(result["status"], "error")
                self.assertIsNone(result["data"])
                self.assertNotIn("PRIVATE", json.dumps(result))

    def test_real_limit_validation_remains_in_service(self):
        result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context, limit=0)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"], "limit must be an integer between 1 and 50.")

    def test_no_writes_model_calls_or_external_network_during_construction_and_search(self):
        self.post()
        before = (list(BuyIssue.objects.values()), list(Post.objects.values()))
        with patch("google.adk.models.google_llm.Gemini.generate_content_async") as model_call:
            with patch("socket.socket.connect", side_effect=AssertionError("No network calls")) as network:
                with CaptureQueriesContext(connection) as queries:
                    build_buyer_agent(AGENT_MODEL)
                    result = async_to_sync(search_and_rank_used)(str(self.issue.id), self.context)
                network.assert_not_called()
            model_call.assert_not_called()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(all(query["sql"].lstrip().upper().startswith("SELECT") for query in queries))
        self.assertEqual((list(BuyIssue.objects.values()), list(Post.objects.values())), before)
