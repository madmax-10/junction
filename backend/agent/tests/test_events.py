"""Event list validation; no Django or ADK required."""

import copy
import unittest

try:  # `manage.py test` runs from backend/; the repo-root unittest command does not
    from agent.events import MAX_EVENTS, EventsError, validate_events
except ModuleNotFoundError:
    from backend.agent.events import MAX_EVENTS, EventsError, validate_events

ENVELOPE = {"status": "ok", "data": {}, "ids": {}, "provenance": "own_records", "error": None}


def user_message(event_id="u-1", text="Value my Civic"):
    return {"id": event_id, "kind": "message", "role": "user", "author": "user", "text": text}


def assistant_message(event_id="a-1"):
    return {"id": event_id, "kind": "message", "role": "assistant", "author": "coordinator", "text": "Sure."}


def tool_call(event_id="c-1", call_id="call-1", name="get_user_context", author="coordinator"):
    return {"id": event_id, "kind": "tool_call", "author": author, "name": name, "call_id": call_id, "args": {}}


def tool_response(event_id="r-1", call_id="call-1", name="get_user_context", author="coordinator"):
    return {
        "id": event_id, "kind": "tool_response", "author": author, "name": name,
        "call_id": call_id, "response": dict(ENVELOPE),
    }


def full_turn():
    return [user_message("u-1"), tool_call(), tool_response(), assistant_message(), user_message("u-2")]


class ValidEventsTests(unittest.TestCase):
    def test_single_user_message_is_valid(self):
        self.assertEqual(validate_events([user_message()]), [user_message()])

    def test_full_history_is_valid_and_unchanged(self):
        events = full_turn()
        self.assertEqual(validate_events(events), events)

    def test_specialist_tool_events_are_valid(self):
        events = [
            user_message("u-1"),
            tool_call("c-1", "call-1", "valuation", "coordinator"),
            tool_call("c-2", "call-2", "calculate_value_range", "valuation"),
            tool_response("r-2", "call-2", "calculate_value_range", "valuation"),
            tool_response("r-1", "call-1", "valuation", "coordinator"),
            user_message("u-2"),
        ]
        self.assertEqual(len(validate_events(events)), 6)

    def test_input_is_not_modified(self):
        events = full_turn()
        original = copy.deepcopy(events)
        validate_events(events)
        self.assertEqual(events, original)

    def test_unknown_fields_are_dropped_including_user_id(self):
        message = user_message()
        message["user_id"] = "someone-else"
        message["extra"] = "x"
        message["images"] = [{"url": "blob:local"}]
        call = tool_call()
        call["user_id"] = "someone-else"
        cleaned = validate_events([call, message])
        for event in cleaned:
            self.assertNotIn("user_id", event)
            self.assertNotIn("extra", event)
            self.assertNotIn("images", event)


class InvalidEventsTests(unittest.TestCase):
    def assertRejected(self, events):
        with self.assertRaises(EventsError):
            validate_events(events)

    def test_non_list_and_empty_are_rejected(self):
        for bad in (None, {}, "events", (), []):
            with self.subTest(bad=bad):
                self.assertRejected(bad)

    def test_too_many_events_are_rejected(self):
        self.assertRejected([user_message(f"u-{n}") for n in range(MAX_EVENTS + 1)])
        validate_events([user_message(f"u-{n}") for n in range(MAX_EVENTS)])

    def test_last_event_must_be_a_user_message(self):
        for tail in (assistant_message("a-9"), tool_call("c-9", "call-9"),):
            with self.subTest(tail=tail["kind"]):
                self.assertRejected([user_message("u-1"), tail])
        self.assertRejected([user_message("u-1"), tool_call(), tool_response()])

    def test_duplicate_event_ids_are_rejected(self):
        self.assertRejected([user_message("same"), assistant_message("same"), user_message("u-3")])

    def test_missing_or_blank_event_id_is_rejected(self):
        for bad in (None, "", "  ", 5):
            with self.subTest(bad=bad):
                event = user_message()
                event["id"] = bad
                self.assertRejected([event])
        event = user_message()
        del event["id"]
        self.assertRejected([event])

    def test_non_object_events_are_rejected(self):
        for bad in (None, "message", 5, []):
            with self.subTest(bad=bad):
                self.assertRejected([bad, user_message()])

    def test_unknown_kind_is_rejected(self):
        event = user_message()
        event["kind"] = "system"
        self.assertRejected([event])

    def test_message_role_and_author_must_agree(self):
        spoofed = user_message()
        spoofed["author"] = "coordinator"
        self.assertRejected([spoofed])
        spoofed_assistant = assistant_message()
        spoofed_assistant["author"] = "user"
        self.assertRejected([spoofed_assistant, user_message("u-2")])
        bad_role = user_message()
        bad_role["role"] = "system"
        self.assertRejected([bad_role])

    def test_message_text_must_be_a_string(self):
        event = user_message()
        event["text"] = None
        self.assertRejected([event])

    def test_unknown_tool_author_is_rejected(self):
        call = tool_call(author="admin")
        self.assertRejected([call, user_message()])

    def test_tool_call_needs_name_call_id_and_object_args(self):
        for key, bad in (("name", ""), ("call_id", None), ("args", []), ("args", None)):
            with self.subTest(key=key, bad=bad):
                call = tool_call()
                call[key] = bad
                self.assertRejected([call, user_message()])

    def test_tool_response_needs_the_full_envelope(self):
        for missing in ("status", "data", "ids", "provenance", "error"):
            with self.subTest(missing=missing):
                response = tool_response()
                del response["response"][missing]
                self.assertRejected([tool_call(), response, user_message()])
        broken = tool_response()
        broken["response"] = "ok"
        self.assertRejected([tool_call(), broken, user_message()])

    def test_tool_response_must_pair_with_an_earlier_call(self):
        self.assertRejected([tool_response(), user_message()])
        self.assertRejected([tool_response(), tool_call(), user_message()])
        self.assertRejected([tool_call(), tool_response(name="get_vehicle_details"), user_message()])
        self.assertRejected([tool_call(), tool_response(call_id="other"), user_message()])

    def test_duplicate_call_ids_are_rejected(self):
        self.assertRejected([tool_call("c-1", "call-1"), tool_call("c-2", "call-1"), user_message()])


if __name__ == "__main__":
    unittest.main()
