"""Real ADK and JWT bridge tests; synthetic fixtures, no model/network calls."""

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
from rest_framework.fields import empty
from rest_framework.test import APIRequestFactory
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User
from agent.agents.buyer import (
    build_buyer_agent, create_or_update_buy_issue, get_post_contact,
    search_and_rank_used, search_new_catalog,
)
from agent.auth import get_or_create_authenticated_session
from agent.config import AGENT_MODEL
from agent.tools.result import error_result, tool_result
from issues.models import BuyIssue, SellIssue
from posts.models import Post
from posts.services import approve_post, generate_post
from vehicles.models import NewCar, UsedCar


class BuyerAgentConfigurationTests(SimpleTestCase):
    def test_builder_returns_real_buyer_agent_with_supplied_model(self):
        agent = build_buyer_agent(AGENT_MODEL)
        self.assertIsInstance(agent, LlmAgent)
        self.assertEqual(agent.name, "buyer")
        self.assertEqual(agent.model, AGENT_MODEL)
        self.assertTrue(agent.description)

    def test_four_tools_are_registered_without_duplicates_or_model_identity_arguments(self):
        agent = build_buyer_agent(AGENT_MODEL)
        tools = async_to_sync(agent.canonical_tools)()
        expected = {
            "create_or_update_buy_issue": (create_or_update_buy_issue,
                {"description", "buy_issue_id", "min_budget", "max_budget", "preferences"}, {"description"}),
            "search_and_rank_used": (search_and_rank_used, {"buy_issue_id", "limit"}, {"buy_issue_id"}),
            "search_new_catalog": (search_new_catalog, {"buy_issue_id", "limit"}, {"buy_issue_id"}),
            "get_post_contact": (get_post_contact, {"post_id"}, {"post_id"}),
        }
        self.assertEqual(len(tools), 4)
        self.assertEqual({tool.name for tool in tools}, set(expected))
        for tool in tools:
            with self.subTest(tool=tool.name):
                self.assertIsInstance(tool, FunctionTool)
                function, properties, required = expected[tool.name]
                self.assertIs(tool.func, function)
                declaration = tool._get_declaration()
                self.assertEqual(declaration.name, tool.name)
                schema = declaration.parameters_json_schema
                if schema is None:
                    schema = declaration.parameters.model_dump(exclude_none=True)
                self.assertEqual(set(schema["properties"]), properties)
                self.assertEqual(set(schema.get("required", [])), required)
                self.assertNotIn("rest_framework", json.dumps(schema))

    def test_buyer_instructions_cover_current_evidence_and_scope(self):
        agent = build_buyer_agent(AGENT_MODEL)
        for phrase in ("Coordinator", "published Sell posts", "synthetic/demo provenance",
                       "no_results", "availability", "MSRP", "explicitly pass buy_issue_id null"):
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
        cls.admin = User.objects.create_user(email="catalog-admin@example.com", name="Admin", is_staff=True)
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

    def contact_post(self, contact=None, *, published=True):
        car = UsedCar.objects.create(
            owner=self.other, make="Toyota", model="Camry", year=2020,
            mileage=40000, condition="PRIVATE condition",
        )
        issue = SellIssue.objects.create(
            user=self.other, used_car=car, description="PRIVATE sale", asking_price=12000,
            contact_info={"email": "PRIVATE@example.com", "phone": "PRIVATE phone"},
        )
        draft = generate_post(
            self.other, Post.IssueType.SELL, issue.id,
            post_data={"contact": contact} if contact is not None else None,
        )
        return approve_post(self.other, draft.id) if published else draft

    def test_create_adapter_delegates_all_supplied_fields_with_trusted_user(self):
        expected = tool_result("ok", data={"id": "fixture"}, provenance="own_buy_issues")
        preferences = {"preferred_makes": ["Toyota"]}
        with patch("agent.agents.buyer.create_or_update_buy_issue_service", return_value=expected) as service:
            result = async_to_sync(FunctionTool(create_or_update_buy_issue).run_async)(
                args={"description": "Need a car", "buy_issue_id": None,
                      "min_budget": "5000.00", "max_budget": 15000, "preferences": preferences},
                tool_context=self.context,
            )
        service.assert_called_once_with(
            "Need a car", min_budget="5000.00", max_budget=15000,
            preferences=preferences, user=self.user, buy_issue_id=None,
        )
        self.assertIs(result, expected)

    def test_update_adapter_preserves_omitted_fields_as_service_sentinel(self):
        expected = tool_result("ok", provenance="own_buy_issues")
        with patch("agent.agents.buyer.create_or_update_buy_issue_service", return_value=expected) as service:
            result = async_to_sync(FunctionTool(create_or_update_buy_issue).run_async)(
                args={"description": "Updated request", "buy_issue_id": str(self.issue.id)},
                tool_context=self.context,
            )
        service.assert_called_once_with(
            "Updated request", min_budget=empty, max_budget=empty, preferences=empty,
            user=self.user, buy_issue_id=str(self.issue.id),
        )
        self.assertIs(result, expected)

    def test_real_create_writes_only_an_owned_private_buy_issue(self):
        before = BuyIssue.objects.count()
        with patch("socket.socket.connect", side_effect=AssertionError("No external calls")) as network:
            result = async_to_sync(create_or_update_buy_issue)(
                "Need a new Camry", self.context, buy_issue_id=None,
                max_budget="35000.25", preferences={"vehicle_type": "new"},
            )
            network.assert_not_called()
        self.assertEqual(result["status"], "ok")
        saved = BuyIssue.objects.get(pk=result["ids"]["issue"]["id"])
        self.assertEqual(saved.user, self.user)
        self.assertEqual(saved.max_budget, Decimal("35000.25"))
        self.assertEqual(BuyIssue.objects.count(), before + 1)
        self.assertFalse(Post.objects.exists())
        self.assertFalse(SellIssue.objects.exists())

    def test_real_update_retains_omissions_and_explicit_null_clears(self):
        before = BuyIssue.objects.count()
        result = async_to_sync(create_or_update_buy_issue)(
            "Updated", self.context, buy_issue_id=str(self.issue.id), min_budget=1000,
        )
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["max_budget"], "15000.00")
        self.assertEqual(result["data"]["preferences"]["vehicle_type"], "used")
        result = async_to_sync(FunctionTool(create_or_update_buy_issue).run_async)(
            args={"description": "Cleared", "buy_issue_id": str(self.issue.id),
                  "max_budget": None, "preferences": None}, tool_context=self.context,
        )
        self.assertEqual(result["status"], "ok")
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.max_budget)
        self.assertIsNone(self.issue.preferences)
        self.assertEqual(BuyIssue.objects.count(), before)
        self.assertFalse(Post.objects.exists())

    def test_omitted_update_reference_requests_clarification_without_service_call(self):
        before = list(BuyIssue.objects.values())
        with patch("agent.agents.buyer.create_or_update_buy_issue_service") as service:
            result = async_to_sync(FunctionTool(create_or_update_buy_issue).run_async)(
                args={"description": "Update my request"}, tool_context=self.context,
            )
            service.assert_not_called()
        self.assertEqual(result["status"], "error")
        self.assertIn("existing Buy issue ID", result["error"])
        self.assertEqual(list(BuyIssue.objects.values()), before)

    def test_invalid_budgets_preserve_service_error_and_existing_issue(self):
        before = BuyIssue.objects.values().get(pk=self.issue.pk)
        for budgets in ({"max_budget": "NaN"}, {"max_budget": True},
                        {"max_budget": 1.5}, {"min_budget": 20000, "max_budget": 10000}):
            with self.subTest(budgets=budgets):
                result = async_to_sync(create_or_update_buy_issue)(
                    "Invalid change", self.context, buy_issue_id=str(self.issue.id), **budgets,
                )
                self.assertEqual(result["error"], "Invalid Buy issue input.")
                self.assertEqual(BuyIssue.objects.values().get(pk=self.issue.pk), before)

    def test_foreign_issue_updates_are_denied_without_disclosure(self):
        foreign = BuyIssue.objects.create(user=self.other, description="PRIVATE request")
        before = list(BuyIssue.objects.values())
        responses = [async_to_sync(create_or_update_buy_issue)(
            "Overwrite", self.context, buy_issue_id=str(target),
        ) for target in (foreign.id, uuid4())]
        self.assertEqual(responses[0], responses[1])
        self.assertEqual(responses[0]["error"], "Buy issue not found.")
        self.assertNotIn("PRIVATE", json.dumps(responses))
        self.assertEqual(list(BuyIssue.objects.values()), before)

    def test_missing_and_forged_identity_block_new_private_adapters(self):
        forged = self.trusted_context()
        forged.state["user_id"] = str(self.other.id)
        for context in (None, {"user_id": str(self.user.id)}, forged):
            for adapter, kwargs in (
                (create_or_update_buy_issue, {"description": "New", "buy_issue_id": None}),
                (search_new_catalog, {"buy_issue_id": str(self.issue.id)}),
            ):
                with self.subTest(adapter=adapter.__name__, context=type(context).__name__):
                    with patch("agent.agents.buyer.create_or_update_buy_issue_service") as create_service:
                        with patch("agent.agents.buyer.search_new_catalog_service") as catalog_service:
                            with self.assertNumQueries(0):
                                result = async_to_sync(adapter)(tool_context=context, **kwargs)
                            create_service.assert_not_called()
                            catalog_service.assert_not_called()
                    self.assertEqual(result["status"], "error")

    def test_catalog_adapter_delegates_limit_and_trusted_identity(self):
        expected = tool_result("no_results", data={"matches": [], "result_count": 0}, provenance="new_cars_catalog")
        with patch("agent.agents.buyer.search_new_catalog_service", return_value=expected) as service:
            result = async_to_sync(FunctionTool(search_new_catalog).run_async)(
                args={"buy_issue_id": str(self.issue.id), "limit": 2}, tool_context=self.context,
            )
        service.assert_called_once_with(str(self.issue.id), limit=2, user=self.user)
        self.assertIs(result, expected)

    def test_real_catalog_preserves_msrp_and_catalog_provenance(self):
        BuyIssue.objects.filter(pk=self.issue.pk).update(max_budget=40000, preferences={"vehicle_type": "new"})
        car = NewCar.objects.create(owner=self.admin, make="Toyota", model="Camry", year=2024,
                                    trim="SE", msrp=Decimal("30000.25"))
        result = async_to_sync(search_new_catalog)(str(self.issue.id), self.context)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["ids"]["catalog_ids"], [str(car.id)])
        self.assertEqual(result["data"]["matches"][0]["msrp"], "30000.25")
        self.assertEqual(result["data"]["matches"][0]["price_basis"], "catalog_msrp")
        self.assertEqual(result["provenance"], "new_cars_catalog")
        self.assertTrue(any("not a confirmed" in text for text in result["data"]["limitations"]))

    def test_real_catalog_no_results_and_default_limit_are_preserved(self):
        BuyIssue.objects.filter(pk=self.issue.pk).update(preferences={"vehicle_type": "new"})
        result = async_to_sync(search_new_catalog)(str(self.issue.id), self.context)
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["matches"], [])
        self.assertEqual(result["provenance"], "new_cars_catalog")
        with patch("agent.agents.buyer.search_new_catalog_service", return_value=result) as service:
            delegated = async_to_sync(FunctionTool(search_new_catalog).run_async)(
                args={"buy_issue_id": str(self.issue.id)}, tool_context=self.context,
            )
        self.assertIs(delegated, result)
        service.assert_called_once_with(str(self.issue.id), limit=5, user=self.user)

    def test_public_contact_delegates_without_changing_public_access_contract(self):
        expected = tool_result("ok", data={"contact": {"phone": "512-555-0100"}}, provenance="published_sell_posts")
        with patch("agent.agents.buyer.get_post_contact_service", return_value=expected) as service:
            with patch("agent.agents.buyer.get_authenticated_user") as auth:
                result = async_to_sync(FunctionTool(get_post_contact).run_async)(
                    args={"post_id": "fixture-id"}, tool_context=self.context,
                )
                auth.assert_not_called()
        service.assert_called_once_with("fixture-id")
        self.assertIs(result, expected)

    def test_real_public_contact_is_owner_approved_and_allowlisted(self):
        post = self.contact_post({"email": "public-seller@example.com"})
        result = async_to_sync(get_post_contact)(str(post.id))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["contact"], {"email": "public-seller@example.com"})
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(result["ids"], {"post_id": str(post.id)})

    def test_draft_and_missing_contacts_are_not_leaked_or_inferred(self):
        draft = self.contact_post({"email": "public@example.com"}, published=False)
        no_contact = self.contact_post()
        results = [async_to_sync(get_post_contact)(str(target)) for target in (draft.id, no_contact.id, uuid4())]
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[1], results[2])
        self.assertEqual(results[0]["status"], "no_results")
        self.assertIsNone(results[0]["data"])
        self.assertNotIn("PRIVATE", json.dumps(results))

    def test_expected_exceptions_in_new_adapters_are_generic(self):
        cases = (
            (create_or_update_buy_issue, "create_or_update_buy_issue_service",
             {"description": "New", "buy_issue_id": None, "tool_context": self.context}),
            (search_new_catalog, "search_new_catalog_service",
             {"buy_issue_id": str(self.issue.id), "tool_context": self.context}),
            (get_post_contact, "get_post_contact_service", {"post_id": str(uuid4())}),
        )
        for adapter, service, kwargs in cases:
            for exception in (DatabaseError("PRIVATE SQL"), ValueError("PRIVATE args"),
                              DjangoValidationError("PRIVATE record"), ValidationError("PRIVATE details")):
                with self.subTest(adapter=adapter.__name__, error=type(exception).__name__):
                    with patch(f"agent.agents.buyer.{service}", side_effect=exception):
                        result = async_to_sync(adapter)(**kwargs)
                    self.assertEqual(result["status"], "error")
                    self.assertNotIn("PRIVATE", json.dumps(result))
                    self.assertIsNone(result["data"])

    def test_new_read_only_tools_make_no_writes_or_model_network_calls(self):
        BuyIssue.objects.filter(pk=self.issue.pk).update(preferences={}, max_budget=40000)
        NewCar.objects.create(owner=self.admin, make="Toyota", model="Camry", year=2024, msrp=30000)
        post = self.contact_post({"phone": "512-555-0100"})
        before = (list(BuyIssue.objects.values()), list(Post.objects.values()), list(NewCar.objects.values()))
        with patch("google.adk.models.google_llm.Gemini.generate_content_async") as model:
            with patch("socket.socket.connect", side_effect=AssertionError("No network calls")) as network:
                with CaptureQueriesContext(connection) as queries:
                    catalog = async_to_sync(search_new_catalog)(str(self.issue.id), self.context)
                    contact = async_to_sync(get_post_contact)(str(post.id))
                network.assert_not_called()
            model.assert_not_called()
        self.assertEqual(catalog["status"], "ok")
        self.assertEqual(contact["status"], "ok")
        self.assertTrue(all(query["sql"].lstrip().upper().startswith("SELECT") for query in queries))
        self.assertEqual((list(BuyIssue.objects.values()), list(Post.objects.values()), list(NewCar.objects.values())), before)
