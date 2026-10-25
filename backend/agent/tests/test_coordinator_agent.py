"""Coordinator wiring. Uses a scripted fake model, so no API key or network is needed.

Run with: python manage.py test agent
"""

import json
from types import SimpleNamespace

from django.test import SimpleTestCase
from google.adk.agents import BaseAgent, LlmAgent
from google.adk.events import Event, EventActions
from google.adk.models import BaseLlm, LlmResponse
from google.adk.models.base_llm import LlmCapabilities
from google.adk.runners import InMemoryRunner
from google.adk.tools import AgentTool
from google.genai import types

from agent.agents.coordinator import SPECIALIST_NAMES, build_coordinator
from agent.agents.stubs import make_stub
from agent.tests.fakes import structured_response


class ScriptedModel(BaseLlm):
    """A fake model that replays prepared replies instead of calling an API."""

    script: list = []
    calls: list = []

    @property
    def capabilities(self):
        return LlmCapabilities(output_schema_and_tools=True)

    async def generate_content_async(self, llm_request, stream=False):
        # Remember what the model was asked, then hand back the next prepared reply.
        self.calls.append(llm_request)
        yield structured_response(llm_request, self.script[len(self.calls) - 1])


def call(name, **args):
    """A model reply that asks to run one tool."""
    part = types.Part(function_call=types.FunctionCall(name=name, args=args))
    return LlmResponse(content=types.Content(role="model", parts=[part]))


def say(text):
    """A model reply that is plain text for the user."""
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=text)]))


class RecordingSpecialist(BaseAgent):
    """A fake specialist that notes the state it was given and sets a new key."""

    seen: dict = {}

    async def _run_async_impl(self, ctx):
        self.seen["user_id"] = ctx.session.state.get("user_id")
        yield Event(
            author=self.name,
            invocation_id=ctx.invocation_id,
            content=types.Content(role="model", parts=[types.Part(text="done")]),
            actions=EventActions(state_delta={"valuation": {"status": "completed"}}),
        )


async def run_turn(agent, text, state):
    """Run one user message through an agent and return (session, final reply text)."""
    runner = InMemoryRunner(agent=agent, app_name="test")
    session = await runner.session_service.create_session(app_name="test", user_id="u", state=state)
    message = types.Content(role="user", parts=[types.Part(text=text)])
    reply = ""
    async for event in runner.run_async(user_id="u", session_id=session.id, new_message=message):
        if event.is_final_response() and event.content and event.content.parts:
            reply = event.content.parts[0].text
    session = await runner.session_service.get_session(app_name="test", user_id="u", session_id=session.id)
    return session, reply


class BuildCoordinatorTests(SimpleTestCase):
    def test_has_its_own_tools_and_all_five_specialists(self):
        coordinator = build_coordinator()
        names = [getattr(tool, "name", None) or tool.__name__ for tool in coordinator.tools]
        self.assertEqual(
            names,
            ["get_user_context", "get_vehicle_details", "register_used_car",
             "valuation", "buyer", "seller", "post_gen", "repair"],
        )
        self.assertEqual(coordinator.name, "coordinator")
        specialist_tools = [t for t in coordinator.tools if isinstance(t, AgentTool)]
        self.assertEqual([t.name for t in specialist_tools], list(SPECIALIST_NAMES))

    def test_coordinator_uses_the_prompt_and_has_no_sub_agents_to_hand_off_to(self):
        coordinator = build_coordinator()
        self.assertIn("only agent the user ever talks to", coordinator.instruction)
        self.assertEqual(coordinator.sub_agents, [])

    def test_a_real_specialist_replaces_its_stub(self):
        real = LlmAgent(name="valuation", model="m", description="Real valuation agent.")
        coordinator = build_coordinator({"valuation": real})
        by_name = {t.name: t for t in coordinator.tools if isinstance(t, AgentTool)}
        self.assertIs(by_name["valuation"].agent, real)
        self.assertNotIsInstance(by_name["buyer"].agent, LlmAgent)

    def test_unknown_or_misnamed_specialists_are_rejected(self):
        with self.assertRaises(ValueError):
            build_coordinator({"mechanic": make_stub("repair")})
        with self.assertRaises(ValueError):
            build_coordinator({"valuation": make_stub("buyer")})

    def test_stubs_have_descriptions_for_the_model_to_read(self):
        for name in SPECIALIST_NAMES:
            self.assertTrue(make_stub(name).description)


class StubTests(SimpleTestCase):
    async def test_stub_answers_no_results_without_a_model(self):
        session, reply = await run_turn(make_stub("valuation"), "value my car", {})
        answer = json.loads(reply)
        self.assertEqual(answer["status"], "no_results")
        self.assertEqual(answer["provenance"], "stub")
        self.assertEqual(set(answer), {"status", "data", "ids", "provenance", "error"})


class CoordinatorRunTests(SimpleTestCase):
    async def test_coordinator_calls_a_stub_and_answers_the_user_itself(self):
        model = ScriptedModel(model="fake", script=[
            call("valuation", request="Value my 2018 Civic"),
            say("I can't price your car yet."),
        ], calls=[])
        coordinator = build_coordinator(model=model)

        session, reply = await run_turn(coordinator, "What is my Civic worth?", {"user_id": "u-1"})

        self.assertEqual(json.loads(reply)["message"], "I can't price your car yet.")
        # The second model call saw the stub's no_results answer as a tool result.
        second_request = model.calls[1]
        responses = [
            part.function_response
            for content in second_request.contents
            for part in (content.parts or [])
            if part.function_response
        ]
        self.assertEqual(responses[0].name, "valuation")
        self.assertIn("no_results", json.dumps(responses[0].response))

    async def test_specialist_gets_user_id_and_its_state_changes_reach_the_coordinator(self):
        specialist = RecordingSpecialist(name="valuation", description="Records state.", seen={})
        model = ScriptedModel(model="fake", script=[
            call("valuation", request="Value my car"),
            say("Done."),
        ], calls=[])
        coordinator = build_coordinator({"valuation": specialist}, model=model)

        session, _ = await run_turn(coordinator, "Value my car", {"user_id": "u-1"})

        self.assertEqual(specialist.seen["user_id"], "u-1")
        self.assertEqual(session.state["valuation"], {"status": "completed"})
