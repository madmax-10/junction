"""Runs one chat turn: replay the history, run Agent 1 once, return the new events.

Nothing is saved here. The frontend keeps the full event list; this module
rebuilds an in-memory ADK session from it, runs the coordinator, and hands back
only the events created during this turn.
"""

import json
import uuid

from asgiref.sync import async_to_sync
from google.adk.events import Event
from google.adk.plugins import BasePlugin
from google.adk.runners import InMemoryRunner
from google.genai import types

from agent.agents.coordinator import build_coordinator
from agent.events import AUTHORS, ENVELOPE_KEYS, validate_events
from agent.state import build_state
from agent.tools.result import error_result, tool_result

APP_NAME = "car_owner_hub"
FALLBACK_REPLY = "Sorry, I couldn't finish that. Please try again."


def _new_id():
    # Server-made ids must never collide with ids the frontend already holds.
    return f"evt-{uuid.uuid4().hex}"


# ---------------------------------------------------------------- replay ----

def _replay_events(history):
    """Turn stored events into ADK events so the model sees the earlier turns.

    Only the coordinator's own messages and tool calls are replayed. A
    specialist's inner tool calls happened in its own private session, so the
    coordinator's model has no such tools; the specialist's final answer is
    already inside the coordinator's tool response.
    """
    # Find which calls got an answer. A call with no answer would confuse the model.
    answered = {e["call_id"] for e in history if e["kind"] == "tool_response"}

    for event in history:
        if event["kind"] == "message":
            is_user = event["role"] == "user"
            content = types.Content(
                role="user" if is_user else "model",
                parts=[types.Part(text=event["text"])],
            )
            yield Event(author=event["author"], invocation_id="history", content=content)
        elif event["author"] != "coordinator":
            continue  # a specialist's inner tool call; see the docstring above
        elif event["kind"] == "tool_call" and event["call_id"] in answered:
            part = types.Part(function_call=types.FunctionCall(
                id=event["call_id"], name=event["name"], args=event["args"]))
            yield Event(author="coordinator", invocation_id="history",
                        content=types.Content(role="model", parts=[part]))
        elif event["kind"] == "tool_response":
            part = types.Part(function_response=types.FunctionResponse(
                id=event["call_id"], name=event["name"], response=event["response"]))
            yield Event(author="coordinator", invocation_id="history",
                        content=types.Content(role="user", parts=[part]))


# --------------------------------------------------------------- capture ----

class _EventRecorder(BasePlugin):
    """Collects every event ADK produces, including the specialists' own.

    ADK runs each specialist in a separate session, so its tool calls never
    reach the coordinator's event stream. Plugins are shared with those inner
    runs, so this one sees everything, in the order it happened.
    """

    def __init__(self):
        super().__init__(name="event_recorder")
        self.events = []

    async def on_event_callback(self, *, invocation_context, event):
        if not event.partial:  # ignore half-finished streaming chunks
            self.events.append(event)
        return None


def _as_envelope(name, response):
    """Make a tool's raw answer fit the {status, data, ids, provenance, error} shape."""
    if isinstance(response, dict) and ENVELOPE_KEYS <= set(response):
        return response  # our own tools already answer in this shape
    # ADK wraps a plain-text result (such as a specialist's answer) as {"result": text}.
    text = response.get("result") if isinstance(response, dict) else response
    if isinstance(text, str):
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        if isinstance(parsed, dict) and ENVELOPE_KEYS <= set(parsed):
            return parsed  # a specialist that answered with the envelope as JSON
        return tool_result("ok", data={"text": text}, provenance=f"specialist:{name}")
    if isinstance(response, dict) and isinstance(response.get("error"), str):
        return error_result(response["error"], provenance=name)
    return tool_result("ok", data=response, provenance=name)


def _to_contract_events(adk_events, used_call_ids):
    """Convert recorded ADK events into message / tool_call / tool_response events."""
    new_events = []
    call_ids = {}  # the model's call id -> the unique id we store

    def final_call_id(original):
        # Keep the model's id unless the history already uses it.
        if original not in call_ids:
            chosen = original if original and original not in used_call_ids else f"call-{uuid.uuid4().hex}"
            used_call_ids.add(chosen)
            call_ids[original] = chosen
        return call_ids[original]

    for event in adk_events:
        author = event.author
        if author not in AUTHORS or not event.content or not event.content.parts:
            continue  # the user's own message, or an event with nothing in it
        text = []

        def flush_text():
            # Only the coordinator speaks to the user; specialist text stays inside tool responses.
            if text and author == "coordinator":
                new_events.append({"id": _new_id(), "kind": "message", "role": "assistant",
                                   "author": "coordinator", "text": "".join(text)})
            text.clear()

        for part in event.content.parts:
            if part.function_call:
                flush_text()
                call = part.function_call
                new_events.append({"id": _new_id(), "kind": "tool_call", "author": author,
                                   "name": call.name, "call_id": final_call_id(call.id),
                                   "args": dict(call.args or {})})
            elif part.function_response:
                flush_text()
                reply = part.function_response
                new_events.append({"id": _new_id(), "kind": "tool_response", "author": author,
                                   "name": reply.name, "call_id": final_call_id(reply.id),
                                   "response": _as_envelope(reply.name, reply.response)})
            elif part.text and not part.thought:
                text.append(part.text)
        flush_text()
    return new_events


# ------------------------------------------------------------------ turn ----

async def run_turn_async(user_id, events, *, specialists=None, model=None):
    """Run one turn and return only the new events (a list of dicts).

    user_id: the signed-in user, taken from the JWT by the caller. Nothing
        inside `events` can change it.
    events: the full history from the frontend, ending with the user's new message.
    specialists / model: passed to build_coordinator (used to swap in real
        specialists or, in tests, a fake model).
    Raises EventsError when the history does not match the contract.
    """
    cleaned = validate_events(events)  # also guarantees the last event is a user message
    history, new_message = cleaned[:-1], cleaned[-1]

    # Identity comes from the caller; the rest of the state is rebuilt from the history.
    state = build_state(user_id, cleaned)

    recorder = _EventRecorder()
    runner = InMemoryRunner(
        agent=build_coordinator(specialists, model=model),
        app_name=APP_NAME,
        plugins=[recorder],
    )
    # A throwaway session that lives only for this request.
    session = await runner.session_service.create_session(
        app_name=APP_NAME, user_id=state["user_id"], state=state)
    for replayed in _replay_events(history):
        await runner.session_service.append_event(session, replayed)

    message = types.Content(role="user", parts=[types.Part(text=new_message["text"])])
    try:
        async for _ in runner.run_async(
            user_id=state["user_id"], session_id=session.id, new_message=message
        ):
            pass  # the recorder plugin collects the events
    finally:
        await runner.close()

    used_call_ids = {e["call_id"] for e in cleaned if e["kind"] == "tool_call"}
    new_events = _to_contract_events(recorder.events, used_call_ids)

    # Always give the user something to read, even if the model said nothing.
    if not any(e["kind"] == "message" for e in new_events):
        new_events.append({"id": _new_id(), "kind": "message", "role": "assistant",
                           "author": "coordinator", "text": FALLBACK_REPLY})
    return new_events


def run_turn(user_id, events, *, specialists=None, model=None):
    """Blocking version of run_turn_async, for normal (synchronous) Django views.

    async_to_sync (not asyncio.run) so that database work done by the tools
    runs back on this same thread and uses this request's database connection.
    """
    return async_to_sync(run_turn_async)(user_id, events, specialists=specialists, model=model)
