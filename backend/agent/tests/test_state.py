"""State rebuilt from the client history; no Django or ADK required."""

import unittest

try:  # `manage.py test` runs from backend/; the repo-root unittest command does not
    from agent.events import validate_events
    from agent.state import build_state
except ModuleNotFoundError:
    from backend.agent.events import validate_events
    from backend.agent.state import build_state

USER = "11111111-1111-1111-1111-111111111111"
CAR_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
CAR_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
ISSUE = "cccccccc-cccc-cccc-cccc-cccccccccccc"
POST_1 = "dddddddd-dddd-dddd-dddd-dddddddddddd"
POST_2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
VALUATION = {"status": "completed", "low": "10000.00", "median": "12000.00", "high": "15000.00"}


class History:
    """Builds a valid event list one tool exchange at a time."""

    def __init__(self):
        self.events = []
        self.count = 0

    def exchange(self, name, status="ok", data=None, ids=None, author="coordinator"):
        self.count += 1
        call_id = f"call-{self.count}"
        self.events.append({
            "id": f"c-{self.count}", "kind": "tool_call", "author": author,
            "name": name, "call_id": call_id, "args": {},
        })
        self.events.append({
            "id": f"r-{self.count}", "kind": "tool_response", "author": author,
            "name": name, "call_id": call_id,
            "response": {"status": status, "data": data, "ids": ids or {}, "provenance": "x", "error": None},
        })
        return self

    def build(self):
        self.events.append({"id": "u-final", "kind": "message", "role": "user", "author": "user", "text": "hi"})
        return validate_events(self.events)


class BuildStateTests(unittest.TestCase):
    def test_empty_history_has_only_user_id(self):
        events = History().build()
        self.assertEqual(build_state(USER, events), {"user_id": USER})

    def test_user_id_is_required(self):
        for bad in (None, ""):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    build_state(bad, History().build())

    def test_active_used_car_comes_from_the_latest_response(self):
        events = (History()
                  .exchange("register_used_car", ids={"used_car_id": CAR_A})
                  .exchange("get_vehicle_details", ids={"used_car_id": CAR_B})
                  .build())
        self.assertEqual(build_state(USER, events)["active_used_car_id"], CAR_B)

    def test_get_user_context_lists_do_not_set_an_active_car(self):
        events = History().exchange("get_user_context", ids={"used_car_ids": [CAR_A, CAR_B]}).build()
        self.assertNotIn("active_used_car_id", build_state(USER, events))

    def test_active_issue_is_restored(self):
        events = History().exchange("create_repair_issue", ids={"issue": {"type": "repair", "id": ISSUE}}).build()
        self.assertEqual(build_state(USER, events)["active_issue"], {"type": "repair", "id": ISSUE})

    def test_active_issue_with_unknown_type_or_bad_id_is_ignored(self):
        for issue in ({"type": "admin", "id": ISSUE}, {"type": "sell", "id": "nope"}, "sell", {"type": "sell"}):
            with self.subTest(issue=issue):
                events = History().exchange("create_sell_issue", ids={"issue": issue}).build()
                self.assertNotIn("active_issue", build_state(USER, events))

    def test_draft_post_is_restored_and_cleared_when_published(self):
        history = History().exchange("save_post_draft", ids={"post_id": POST_1})
        self.assertEqual(build_state(USER, history.build())["draft_post_id"], POST_1)

        history = History().exchange("save_post_draft", ids={"post_id": POST_1})
        history.exchange("approve_and_publish_post", ids={"post_id": POST_1})
        self.assertNotIn("draft_post_id", build_state(USER, history.build()))

    def test_publishing_another_post_keeps_the_current_draft(self):
        events = (History()
                  .exchange("save_post_draft", ids={"post_id": POST_1})
                  .exchange("approve_and_publish_post", ids={"post_id": POST_2})
                  .build())
        self.assertEqual(build_state(USER, events)["draft_post_id"], POST_1)

    def test_post_id_from_other_tools_is_not_a_draft(self):
        events = History().exchange("get_post_contact", ids={"post_id": POST_1}).build()
        self.assertNotIn("draft_post_id", build_state(USER, events))

    def test_valuation_is_restored_from_completed_and_insufficient_responses(self):
        events = History().exchange("calculate_value_range", data=VALUATION).build()
        self.assertEqual(build_state(USER, events)["valuation"], VALUATION)

        thin = {"status": "insufficient_data", "low": None, "median": None, "high": None}
        events = History().exchange("calculate_value_range", status="insufficient_data", data=thin).build()
        self.assertEqual(build_state(USER, events)["valuation"], thin)

    def test_latest_valuation_wins(self):
        newer = dict(VALUATION, median="13000.00")
        events = (History()
                  .exchange("calculate_value_range", data=VALUATION, author="valuation")
                  .exchange("calculate_value_range", data=newer, author="valuation")
                  .build())
        self.assertEqual(build_state(USER, events)["valuation"]["median"], "13000.00")

    def test_failed_valuation_is_ignored_and_keeps_the_previous_one(self):
        events = (History()
                  .exchange("calculate_value_range", data=VALUATION)
                  .exchange("calculate_value_range", status="error", data=None)
                  .build())
        self.assertEqual(build_state(USER, events)["valuation"], VALUATION)

    def test_valuation_data_must_be_an_object(self):
        events = History().exchange("calculate_value_range", data="12000").build()
        self.assertNotIn("valuation", build_state(USER, events))

    def test_other_tools_cannot_set_valuation(self):
        events = History().exchange("get_user_context", data=VALUATION).build()
        self.assertNotIn("valuation", build_state(USER, events))

    def test_last_search_results_keep_valid_ids_only(self):
        events = (History()
                  .exchange("search_comparable_posts", ids={"post_ids": [POST_1, "junk", 5, POST_2]})
                  .build())
        self.assertEqual(build_state(USER, events)["last_search_results"], [POST_1, POST_2])

    def test_empty_search_replaces_previous_results(self):
        events = (History()
                  .exchange("search_comparable_posts", ids={"post_ids": [POST_1]})
                  .exchange("search_and_rank_used", ids={"post_ids": []})
                  .build())
        self.assertEqual(build_state(USER, events)["last_search_results"], [])

    def test_post_ids_from_non_search_tools_are_ignored(self):
        events = History().exchange("get_user_context", ids={"post_ids": [POST_1]}).build()
        self.assertNotIn("last_search_results", build_state(USER, events))

    def test_failed_responses_do_not_set_ids(self):
        events = History().exchange("register_used_car", status="error", ids={"used_car_id": CAR_A}).build()
        self.assertNotIn("active_used_car_id", build_state(USER, events))

    def test_malformed_ids_are_skipped(self):
        for bad in ("not-a-uuid", "", None, 5, ["x"]):
            with self.subTest(bad=bad):
                events = History().exchange("get_vehicle_details", ids={"used_car_id": bad}).build()
                self.assertNotIn("active_used_car_id", build_state(USER, events))

    def test_non_object_ids_are_skipped(self):
        events = History().exchange("get_vehicle_details", ids="oops").build()
        self.assertEqual(build_state(USER, events), {"user_id": USER})

    def test_user_id_inside_the_history_is_ignored(self):
        other = "99999999-9999-9999-9999-999999999999"
        history = History().exchange(
            "get_user_context",
            data={"user_id": other},
            ids={"user_id": other, "owner_id": other},
        )
        for event in history.events:
            event["user_id"] = other
        history.events[-1]["response"]["user_id"] = other
        history.events.append({
            "id": "u-final", "kind": "message", "role": "user", "author": "user",
            "text": "hi", "user_id": other,
        })
        state = build_state(USER, validate_events(history.events))
        self.assertEqual(state, {"user_id": USER})
        self.assertNotIn(other, str(state))

    def test_state_is_rebuilt_from_scratch_each_call(self):
        events = History().exchange("register_used_car", ids={"used_car_id": CAR_A}).build()
        first = build_state(USER, events)
        first["active_used_car_id"] = CAR_B
        self.assertEqual(build_state(USER, events)["active_used_car_id"], CAR_A)

    def test_full_sell_journey_restores_every_key(self):
        events = (History()
                  .exchange("get_user_context", ids={"used_car_ids": [CAR_A]})
                  .exchange("get_vehicle_details", ids={"used_car_id": CAR_A})
                  .exchange("create_or_update_sell_issue", ids={"issue": {"type": "sell", "id": ISSUE}})
                  .exchange("calculate_value_range", data=VALUATION, author="valuation")
                  .exchange("save_post_draft", ids={"post_id": POST_1}, author="post_gen")
                  .exchange("search_comparable_posts", ids={"post_ids": [POST_2]}, author="valuation")
                  .build())
        self.assertEqual(build_state(USER, events), {
            "user_id": USER,
            "active_used_car_id": CAR_A,
            "active_issue": {"type": "sell", "id": ISSUE},
            "valuation": VALUATION,
            "draft_post_id": POST_1,
            "last_search_results": [POST_2],
        })


if __name__ == "__main__":
    unittest.main()
