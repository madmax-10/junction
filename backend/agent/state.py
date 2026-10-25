"""Per-turn agent state (see contracts.md, "Per-turn state keys").

``user_id`` comes only from the authenticated request. Every other key is
rebuilt from the latest matching ``tool_response`` in the client history. That
history is untrusted context: it never sets identity, and every tool still
checks ownership against ``user_id``.
"""

from uuid import UUID

ISSUE_TYPES = {"buy", "sell", "repair"}
DRAFT_TOOLS = {"save_post_draft", "update_post_draft"}
PUBLISH_TOOL = "approve_and_publish_post"
VALUATION_TOOL = "calculate_value_range"
VALUATION_STATUSES = {"ok", "insufficient_data"}
SEARCH_TOOLS = {
    "search_comparable_posts",
    "search_and_rank_used",
    "find_and_rank_buyers",
    "search_similar_repairs",
}


def _uuid_string(value):
    if not isinstance(value, str):
        return None
    try:
        return str(UUID(value))
    except ValueError:
        return None


def _ids(response):
    ids = response.get("ids")
    return ids if isinstance(ids, dict) else {}


def build_state(user_id, events):
    """Return the in-request state for one turn.

    ``events`` must already have passed ``events.validate_events``. Later
    responses replace earlier ones. Only successful responses are used, and
    malformed ids are skipped rather than trusted.
    """
    if not user_id:
        raise ValueError("user_id is required.")
    state = {"user_id": str(user_id)}

    for event in events:
        if event.get("kind") != "tool_response":
            continue
        response = event["response"]
        status = response.get("status")
        name = event["name"]
        ids = _ids(response)

        if status == "ok":
            car_id = _uuid_string(ids.get("used_car_id"))
            if car_id:
                state["active_used_car_id"] = car_id

            issue = ids.get("issue")
            if isinstance(issue, dict) and issue.get("type") in ISSUE_TYPES:
                issue_id = _uuid_string(issue.get("id"))
                if issue_id:
                    state["active_issue"] = {"type": issue["type"], "id": issue_id}

            post_id = _uuid_string(ids.get("post_id"))
            if post_id and name in DRAFT_TOOLS:
                state["draft_post_id"] = post_id
            elif post_id and name == PUBLISH_TOOL and state.get("draft_post_id") == post_id:
                del state["draft_post_id"]

            post_ids = ids.get("post_ids")
            if name in SEARCH_TOOLS and isinstance(post_ids, list):
                cleaned = [_uuid_string(item) for item in post_ids]
                state["last_search_results"] = [item for item in cleaned if item]

        if name == VALUATION_TOOL and status in VALUATION_STATUSES:
            data = response.get("data")
            if isinstance(data, dict):
                state["valuation"] = data

    return state
