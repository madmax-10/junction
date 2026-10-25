"""One-turn runner with a scripted fake model. Run with: python manage.py test agent"""

import json
from datetime import date

from django.test import TestCase
from google.adk.agents import BaseAgent, LlmAgent
from google.adk.events import Event, EventActions
from google.genai import types

from accounts.models import User
from agent.agents.stubs import make_stub
from agent.events import EventsError, validate_events
from agent.runner import FALLBACK_REPLY, run_turn
from agent.tests.fakes import call, say, scripted
from agent.agents.stubs import make_stub
from agent.tools.result import tool_result
from vehicles.models import UsedCar

ENVELOPE_KEYS = {"status", "data", "ids", "provenance", "error"}


def user_message(text, event_id="u-1"):
    return {"id": event_id, "kind": "message", "role": "user", "author": "user", "text": text}


def contents_text(request):
    """Everything the model was shown, flattened to one string, for simple checks."""
    return json.dumps(
        [c.model_dump(mode="json", exclude_none=True) for c in request.contents], default=str)


class RecordingSpecialist(BaseAgent):
    """A fake specialist that notes the state it was given."""

    seen: dict = {}

    async def _run_async_impl(self, ctx):
        self.seen.update(ctx.session.state.to_dict() if hasattr(ctx.session.state, "to_dict")
                         else dict(ctx.session.state))
        yield Event(author=self.name, invocation_id=ctx.invocation_id,
                    content=types.Content(role="model", parts=[types.Part(text="noted")]))


class RunnerTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password="pw-12345678", name="Ada")
        cls.other = User.objects.create_user(email="bea@example.com", password="pw-12345678", name="Bea")

    def run_turn(self, events, model, **kwargs):
        return run_turn(str(self.user.id), events, model=model, **kwargs)


class PlainReplyTests(RunnerTestCase):
    def test_returns_only_the_new_assistant_message(self):
        new = self.run_turn([user_message("Hi")], scripted(say("Hello!")))
        self.assertEqual(len(new), 1)
        self.assertEqual(new[0]["kind"], "message")
        self.assertEqual((new[0]["role"], new[0]["author"], new[0]["text"]), ("assistant", "coordinator", "Hello!"))
        self.assertTrue(new[0]["id"])

    def test_history_is_replayed_to_the_model(self):
        history = [
            user_message("My car is a Civic", "u-1"),
            {"id": "a-1", "kind": "message", "role": "assistant", "author": "coordinator", "text": "Got it, a Civic."},
            user_message("What year?", "u-2"),
        ]
        model = scripted(say("2018?"))
        self.run_turn(history, model)
        seen = contents_text(model.calls[0])
        self.assertIn("My car is a Civic", seen)
        self.assertIn("Got it, a Civic.", seen)
        self.assertIn("What year?", seen)

    def test_empty_model_reply_becomes_a_fallback_message(self):
        new = self.run_turn([user_message("Hi")], scripted(say("")))
        self.assertEqual([e["text"] for e in new], [FALLBACK_REPLY])

    def test_invalid_history_is_rejected_before_any_model_call(self):
        model = scripted(say("never used"))
        with self.assertRaises(EventsError):
            self.run_turn([], model)
        with self.assertRaises(EventsError):
            self.run_turn([{"id": "a", "kind": "message", "role": "assistant", "author": "coordinator", "text": "x"}], model)
        self.assertEqual(model.calls, [])


class ToolTurnTests(RunnerTestCase):
    def test_tool_call_response_and_message_come_back_in_order(self):
        model = scripted(call("get_user_context"), say("You have no cars yet."))
        new = self.run_turn([user_message("What do I have?")], model)

        self.assertEqual([e["kind"] for e in new], ["tool_call", "tool_response", "message"])
        self.assertEqual(new[0]["name"], "get_user_context")
        self.assertEqual(new[0]["author"], "coordinator")
        self.assertEqual(new[0]["call_id"], new[1]["call_id"])
        self.assertEqual(new[1]["name"], "get_user_context")
        self.assertEqual(set(new[1]["response"]), ENVELOPE_KEYS)
        self.assertEqual(new[1]["response"]["status"], "ok")
        self.assertEqual(new[2]["text"], "You have no cars yet.")
        self.assertEqual(len({e["id"] for e in new}), 3)

    def test_new_events_extend_the_history_into_a_valid_next_request(self):
        history = [user_message("What do I have?", "u-1")]
        new = self.run_turn(history, scripted(call("get_user_context"), say("Nothing yet.")))
        history = history + new + [user_message("Register a Civic", "u-2")]
        validate_events(history)  # the frontend can send this straight back

        model = scripted(say("Which year?"))
        self.run_turn(history, model)
        seen = contents_text(model.calls[0])
        self.assertIn("get_user_context", seen)  # the earlier tool exchange is context
        self.assertIn("Nothing yet.", seen)

    def test_tools_use_the_session_user_not_anything_in_the_history(self):
        history = [user_message("Register my Civic")]
        history[0]["user_id"] = str(self.other.id)  # a forged identity is ignored
        model = scripted(
            call("register_used_car", make="Honda", model="Civic", year=2018, mileage=62000),
            say("Registered."),
        )
        new = self.run_turn(history, model)

        car = UsedCar.objects.get()
        self.assertEqual(car.owner, self.user)
        self.assertEqual(new[1]["response"]["status"], "ok")
        self.assertEqual(new[1]["response"]["ids"], {"used_car_id": str(car.id)})

    def test_old_tool_responses_are_not_executed_again(self):
        history = [
            user_message("Register my Civic", "u-1"),
            {"id": "c-1", "kind": "tool_call", "author": "coordinator", "name": "register_used_car",
             "call_id": "call-1", "args": {"make": "Honda", "model": "Civic", "year": 2018, "mileage": 1}},
            {"id": "r-1", "kind": "tool_response", "author": "coordinator", "name": "register_used_car",
             "call_id": "call-1", "response": {"status": "ok", "data": None,
                                                 "ids": {"used_car_id": "11111111-1111-1111-1111-111111111111"},
                                                 "provenance": "x", "error": None}},
            user_message("Thanks", "u-2"),
        ]
        self.run_turn(history, scripted(say("You're welcome.")))
        self.assertEqual(UsedCar.objects.count(), 0)

    def test_call_ids_do_not_repeat_ids_already_in_the_history(self):
        history = [
            user_message("Hi", "u-1"),
            {"id": "c-1", "kind": "tool_call", "author": "coordinator", "name": "get_user_context",
             "call_id": "call-1", "args": {}},
            {"id": "r-1", "kind": "tool_response", "author": "coordinator", "name": "get_user_context",
             "call_id": "call-1", "response": {"status": "ok", "data": None, "ids": {},
                                                 "provenance": "x", "error": None}},
            user_message("Again", "u-2"),
        ]
        new = self.run_turn(history, scripted(call("get_user_context"), say("Done.")))
        validate_events(history + new + [user_message("More", "u-3")])


class SpecialistTurnTests(RunnerTestCase):
    def test_stub_specialist_answer_is_stored_as_an_envelope(self):
        model = scripted(call("valuation", request="Value my Civic"), say("I can't price it yet."))
        # Valuation is a real specialist by default. Pass a stub to keep this envelope check.
        new = self.run_turn(
            [user_message("Value my Civic")],
            model,
            specialists={"valuation": make_stub("valuation")},
        )

        self.assertEqual([e["kind"] for e in new], ["tool_call", "tool_response", "message"])
        self.assertEqual(new[0]["name"], "valuation")
        self.assertEqual(new[0]["args"], {"request": "Value my Civic"})
        self.assertEqual(new[1]["response"]["status"], "no_results")
        self.assertEqual(new[1]["response"]["provenance"], "stub")
        self.assertEqual(new[2]["author"], "coordinator")

    def test_a_specialists_own_tool_calls_are_stored_with_its_name(self):
        specialist_model = scripted(call("get_clock"), say("It is a date."))

        def get_clock() -> dict:
            """Return today's date."""
            return tool_result("ok", data={"today": date(2026, 10, 24)}, provenance="clock")

        valuation = LlmAgent(name="valuation", model=specialist_model, description="Valuation.",
                             tools=[get_clock])
        model = scripted(call("valuation", request="Value my Civic"), say("Done."))
        new = self.run_turn([user_message("Value my Civic")], model, specialists={"valuation": valuation})

        self.assertEqual(
            [(e["kind"], e["author"], e["name"]) for e in new if e["kind"] != "message"],
            [("tool_call", "coordinator", "valuation"),
             ("tool_call", "valuation", "get_clock"),
             ("tool_response", "valuation", "get_clock"),
             ("tool_response", "coordinator", "valuation")],
        )
        # The specialist's prose answer is wrapped, and its text never becomes a user-facing message.
        self.assertEqual(new[-2]["response"]["data"], {"text": "It is a date."})
        self.assertEqual([e["text"] for e in new if e["kind"] == "message"], ["Done."])
        json.dumps(new)  # everything is plain JSON
        validate_events(new + [user_message("ok", "u-9")])

    def test_specialist_sees_user_id_and_state_rebuilt_from_the_history(self):
        car_id = "22222222-2222-2222-2222-222222222222"
        history = [
            user_message("Look up my car", "u-1"),
            {"id": "c-1", "kind": "tool_call", "author": "coordinator", "name": "get_vehicle_details",
             "call_id": "call-1", "args": {"used_car_id": car_id}},
            {"id": "r-1", "kind": "tool_response", "author": "coordinator", "name": "get_vehicle_details",
             "call_id": "call-1", "response": {"status": "ok", "data": None, "ids": {"used_car_id": car_id},
                                                 "provenance": "own_used_cars", "error": None}},
            user_message("Now value it", "u-2"),
        ]
        specialist = RecordingSpecialist(name="valuation", description="Records state.", seen={})
        model = scripted(call("valuation", request="Value it"), say("Done."))
        self.run_turn(history, model, specialists={"valuation": specialist})

        self.assertEqual(specialist.seen["user_id"], str(self.user.id))
        self.assertEqual(specialist.seen["active_used_car_id"], car_id)
