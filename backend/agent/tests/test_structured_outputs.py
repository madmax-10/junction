"""Structured replies are validated shapes, never database-success evidence."""

from django.test import SimpleTestCase
from google.adk.models.base_llm import LlmCapabilities
from pydantic import ValidationError

from agent.agents.coordinator import build_coordinator
from agent.responses import database_operations
from agent.runner import _as_envelope, default_specialists, run_turn
from agent.schemas import CoordinatorReply, REPLY_SCHEMAS
from agent.tests.fakes import ScriptedModel, say, scripted
from agent.tools.result import tool_result


class StructuredOutputTests(SimpleTestCase):
    def test_every_real_agent_uses_its_pydantic_schema(self):
        agents = default_specialists(scripted(say("unused")))
        agents["coordinator"] = build_coordinator(agents, model=scripted(say("unused")))
        for name, agent in agents.items():
            self.assertIs(agent.output_schema, REPLY_SCHEMAS[name])

    def test_schema_rejects_identity_spoof_and_database_success_claims(self):
        for payload in (
            {"agent": "seller", "status": "answer", "message": "Done"},
            {"agent": "coordinator", "status": "ok", "message": "Done"},
            {"agent": "coordinator", "status": "answer", "message": "Done", "database_success": True},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                CoordinatorReply.model_validate(payload)

    def test_plain_specialist_prose_is_not_wrapped_as_success(self):
        self.assertEqual(_as_envelope("seller", {"result": "I saved it"})["status"], "error")

    def test_native_dict_and_json_string_preserve_error_and_unavailability(self):
        for status, expected in (("error", "error"), ("unavailable", "insufficient_data")):
            reply = REPLY_SCHEMAS["seller"](status=status, message="No pricing evidence")
            for raw in (reply.model_dump(), reply.model_dump_json(), {"result": reply.model_dump()}):
                self.assertEqual(_as_envelope("seller", raw)["status"], expected)

    def test_conversation_answer_is_not_a_database_operation(self):
        event = {"kind": "tool_response", "name": "seller", "author": "coordinator", "call_id": "s",
                 "response": _as_envelope("seller", REPLY_SCHEMAS["seller"](status="answer", message="Saved").model_dump())}
        self.assertEqual(database_operations([event]), [])

    def test_failed_actual_write_remains_failed_despite_successful_prose(self):
        event = {"kind": "tool_response", "name": "create_repair_issue", "author": "repair", "call_id": "r",
                 "response": tool_result("error", error="Vehicle not found.")}
        result = database_operations([event])[0]
        self.assertFalse(result["succeeded"])
        self.assertEqual(result["operation"], "write")
        self.assertEqual(result["status"], "error")

    def test_schema_fallback_with_tools_returns_json_without_internal_calls(self):
        class FallbackModel(ScriptedModel):
            @property
            def capabilities(self):
                return LlmCapabilities(output_schema_and_tools=False)
        model = FallbackModel(model="fake", script=[say("Hello")], calls=[])
        events = run_turn("test-user", [{"id": "u", "kind": "message", "role": "user", "author": "user", "text": "Hi"}], model=model)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["text"], "Hello")
        self.assertEqual(events[0]["output"]["status"], "answer")
