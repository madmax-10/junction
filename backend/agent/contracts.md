# Agent JSON contracts

These are the frozen shapes the agents, the chat endpoint, and the frontend
share. If you need to change one, update this file first and tell the team.
The source of truth for each shape is listed next to it.

## 1. Tool result envelope

Every ADK function tool returns this object, built with
[`tool_result()`](./tools/result.py):

```json
{
  "status": "ok",
  "data": {},
  "ids": {"used_car_id": "6f1c…"},
  "provenance": "own_used_cars",
  "error": null
}
```

| Field | Rule |
| --- | --- |
| `status` | One of `ok`, `no_results`, `insufficient_data`, `vision_unavailable`, `search_unavailable`, `error` |
| `data` | The payload, or `null`. Empty searches return `no_results` with `data: null` or an explanation, never invented rows |
| `ids` | Named record ids the coordinator restores state from (`used_car_id`, `issue`, `post_id`, `post_ids`, …) |
| `provenance` | Where the data came from, e.g. `own_used_cars`, `published_sell_posts`, `new_cars_catalog`, `serpapi_google_maps` |
| `error` | A short message when `status` is `error`; otherwise `null` |

Serialization (`to_jsonable`):

| Python | JSON |
| --- | --- |
| `Decimal("12000.015")` | `"12000.015"` (plain decimal string, never a float or exponent) |
| `UUID` | `"6f1c…"` |
| `date` / `datetime` | ISO 8601 string |
| `float` | Rejected, so money cannot pick up binary rounding errors |

## 2. Chat events (client-held history)

`POST /api/chat/turns/` with `{"events": [...]}`, where the last event is a user `message`.
The response is `{"events": [...new events only]}`.

```json
{"id": "c-1", "kind": "message", "role": "user", "author": "user", "text": "Value my Civic"}
{"id": "s-1", "kind": "tool_call", "author": "coordinator", "name": "get_user_context", "call_id": "call-1", "args": {}}
{"id": "s-2", "kind": "tool_response", "author": "coordinator", "name": "get_user_context", "call_id": "call-1", "response": {"status": "ok", "data": {}, "ids": {}, "provenance": "own_records", "error": null}}
{"id": "s-3", "kind": "message", "role": "assistant", "author": "coordinator", "text": "…"}
```

| `kind` | Fields | Written by |
| --- | --- | --- |
| `message` | `id`, `role` (`user`/`assistant`), `author` (`user`/`coordinator`), `text` | Frontend for `role: user`; backend for the coordinator |
| `tool_call` | `id`, `author`, `name`, `call_id`, `args` | Backend only |
| `tool_response` | `id`, `author`, `name`, `call_id`, `response` (the envelope above) | Backend only |

- `author` on tool events is one of `coordinator`, `valuation`, `buyer`, `seller`, `post_gen`, `repair`.
- `id` is unique in the list. The frontend assigns ids for user messages and the backend assigns ids for everything else.
- The history is untrusted. A `user_id` inside it is ignored, and old tool calls are never executed again.

### Per-turn state keys

The server sets `user_id` from the JWT. It restores the other keys from the
latest matching `tool_response` in the history.

| Key | Shape | Restored from |
| --- | --- | --- |
| `user_id` | string | JWT only |
| `active_used_car_id` | UUID string | `ids.used_car_id` |
| `active_issue` | `{"type": "buy"\|"sell"\|"repair", "id": "<uuid>"}` | `ids.issue` |
| `draft_post_id` | UUID string | `ids.post_id` from `save_post_draft` |
| `valuation` | Valuation `data` (§3) | `calculate_value_range` response |
| `last_search_results` | list of post ids | `ids.post_ids` from search tools |

## 3. Valuation result

The valuation result is owned by Agent 2. Its source of truth is
[`estimate()`](./services/valuation_service.md). The tool response wraps that
output after `to_jsonable`. The envelope `status` is `ok` when `estimate()`
returns `completed`, and `insufficient_data` otherwise.

```json
{
  "status": "completed",
  "low": "10000.00",
  "median": "12000.00",
  "high": "15000.00",
  "sample_size": 3,
  "price_basis": "asking",
  "comparable_post_ids": ["…", "…", "…"],
  "msrp_reference": {"msrp": "24000.00", "new_car_id": "…"},
  "limitations": ["Asking prices only; …"]
}
```

`low`/`median`/`high` are decimal strings, or `null` when the status is
`insufficient_data`. The `msrp_reference` shape is up to Agent 2. It is
reference information only and never feeds the range.

## 4. `post_data` per post type

These shapes are already enforced by
[`normalize_post_data`](../posts/validation.py) (unknown keys are rejected).
Money in `post_data` is stored as a JSON number, rounded to cents
(`common.validators.money_to_json`), not as a string.

| `issue_type` | Allowed keys |
| --- | --- |
| `sell` | `make`, `model`, `year`, `trim`, `mileage`, `asking_price`, `condition_details`, `known_damage`, `location`, `contact`, `photos` |
| `buy` | `min_budget`, `max_budget`, `preferred_makes`, `preferred_models`, `minimum_year`, `maximum_mileage`, `vehicle_type` (`new`/`used`), `fuel_type`, `location`, `contact`, `photos` |
| `repair` | `make`, `model`, `year`, `trim`, `mileage`, `symptoms`, `method` (`mechanic`/`self`), `work_performed`, `cost`, `mechanic_name`, `owner_reported` (must be `true`), `photos` |

Nested objects:

| Key | Shape |
| --- | --- |
| `contact` | `{"phone"?, "email"?, "link"?}`. Only fields the owner approved; `link` must be http(s) |
| `condition_details` | `{"mechanical"?, "exterior"?, "interior"?, "maintenance_history"?}`, all strings |
| `symptoms` | `{"confirmed"?: [str], "inferred"?: [str]}` |
| `photos` | Paths into the issue's own photo folder (validated by `issues.photos.normalize_photo_paths`) |

Example sell snapshot:

```json
{
  "make": "Honda", "model": "Civic", "year": 2018, "trim": "EX", "mileage": 62000,
  "asking_price": 14500,
  "condition_details": {"mechanical": "New battery 2026"},
  "location": "Austin, TX",
  "contact": {"email": "seller@example.com"}
}
```

A repair post never contains `ai_analysis`. The fix comes only from
`resolution_details` (`method`, `work_performed`, `cost`, `mechanic_name`).
