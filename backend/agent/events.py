"""Validation of the client-held ``events`` list (see contracts.md, section 2).

The history is untrusted. ``validate_events`` returns a cleaned copy that keeps
only contract fields, so extra keys such as a ``user_id`` never reach the agent.
"""

MAX_EVENTS = 500
AUTHORS = {"coordinator", "valuation", "buyer", "seller", "post_gen", "repair"}
ENVELOPE_KEYS = {"status", "data", "ids", "provenance", "error"}
ROLE_AUTHOR = {"user": "user", "assistant": "coordinator"}
FIELDS = {
    "message": ("role", "author", "text"),
    "tool_call": ("author", "name", "call_id", "args"),
    "tool_response": ("author", "name", "call_id", "response"),
}


class EventsError(ValueError):
    """The submitted event list does not match the contract."""


def _text(event, key, position):
    value = event.get(key)
    if not isinstance(value, str) or not value.strip():
        raise EventsError(f"Event {position}: '{key}' must be a non-empty string.")
    return value


def _clean_event(event, position):
    if not isinstance(event, dict):
        raise EventsError(f"Event {position}: must be an object.")
    event_id = _text(event, "id", position)
    kind = event.get("kind")
    if kind not in FIELDS:
        raise EventsError(f"Event {position}: 'kind' must be message, tool_call or tool_response.")

    cleaned = {"id": event_id, "kind": kind}
    if kind == "message":
        role = event.get("role")
        if role not in ROLE_AUTHOR:
            raise EventsError(f"Event {position}: 'role' must be user or assistant.")
        if event.get("author") != ROLE_AUTHOR[role]:
            raise EventsError(
                f"Event {position}: a {role} message must have author '{ROLE_AUTHOR[role]}'."
            )
        text = event.get("text")
        if not isinstance(text, str):
            raise EventsError(f"Event {position}: 'text' must be a string.")
        cleaned.update(role=role, author=event["author"], text=text)
        return cleaned

    author = event.get("author")
    if author not in AUTHORS:
        raise EventsError(f"Event {position}: 'author' is not a known agent.")
    cleaned.update(author=author, name=_text(event, "name", position), call_id=_text(event, "call_id", position))
    if kind == "tool_call":
        if not isinstance(event.get("args"), dict):
            raise EventsError(f"Event {position}: 'args' must be an object.")
        cleaned["args"] = event["args"]
    else:
        response = event.get("response")
        if not isinstance(response, dict) or not ENVELOPE_KEYS <= set(response):
            raise EventsError(
                f"Event {position}: 'response' must have status, data, ids, provenance and error."
            )
        cleaned["response"] = response
    return cleaned


def validate_events(events):
    """Return a cleaned copy of ``events`` or raise ``EventsError``.

    Rules: a non-empty list of at most MAX_EVENTS; unique event ids; every
    event matches its kind; each tool_response follows a tool_call with the
    same call_id and name; the last event is a user message.
    """
    if not isinstance(events, list):
        raise EventsError("'events' must be a list.")
    if not events:
        raise EventsError("'events' must not be empty.")
    if len(events) > MAX_EVENTS:
        raise EventsError(f"'events' must contain {MAX_EVENTS} events or fewer.")

    cleaned = []
    seen_ids = set()
    calls = {}
    for position, event in enumerate(events, start=1):
        item = _clean_event(event, position)
        if item["id"] in seen_ids:
            raise EventsError(f"Event {position}: duplicate id '{item['id']}'.")
        seen_ids.add(item["id"])

        if item["kind"] == "tool_call":
            if item["call_id"] in calls:
                raise EventsError(f"Event {position}: duplicate call_id '{item['call_id']}'.")
            calls[item["call_id"]] = item["name"]
        elif item["kind"] == "tool_response":
            if calls.get(item["call_id"]) != item["name"]:
                raise EventsError(
                    f"Event {position}: tool_response has no matching earlier tool_call."
                )
        cleaned.append(item)

    last = cleaned[-1]
    if last["kind"] != "message" or last["role"] != "user":
        raise EventsError("The last event must be a user message.")
    return cleaned
