# Agent 3, Task 3.1 — Save a private Buy issue

## Purpose and inspected repository

[`create_or_update_buy_issue()`](./buy_issue_service.py) persists a buyer's own
description, budget and preferences for the shared Coordinator chatbot. It does
not find cars, rank listings, create a post, publish contact information, or run
ADK/Gemini. Task 3.2 can later use the returned issue ID to load the same owner's
saved requirements and search published inventory; that search is not included.

Inspection found the existing `BuyIssue`, `BuyIssueSerializer`, create/update
issue helpers, shared JWT/ADK bridge, and tool result envelope. No equivalent
combined Buyer service existed. Work began on `Agent2(Valuation)` with a clean
worktree and Agent 2 committed (`b9dd835` latest). The branch was not changed.

## Exact service interface

```python
create_or_update_buy_issue(
    description=None,
    min_budget=empty,
    max_budget=empty,
    preferences=empty,
    *, user,
    buy_issue_id=None,
)
```

`empty` is the existing DRF sentinel, not a new helper or JSON value. Omitted
optional arguments are different from explicit `None`. This is a synchronous
**service-only** function, not an ADK wrapper or a model-generated tool schema.

- `description`: required meaningful string on both create and update; omitted,
  null, blank, nonstring and invalid text are rejected. Whitespace is trimmed.
- Budgets: optional `Decimal`, integer, numeric string, or `None`. All Python
  floats and booleans are rejected rather than converted. Omit to preserve an
  existing value; pass `None` to clear it. Blank strings are invalid, not a
  substitute for null. Create defaults remain model nulls.
- `preferences`: supported JSON-compatible dict or `None`. Omission preserves
  existing preferences; `None` clears them. A provided object **replaces**, not
  merges with, the prior preference object. `{}` is a valid empty object.
- `user`: mandatory keyword-only, authenticated Django user supplied by trusted
  server code. It is never accepted as a raw user ID or copied from chat input.
- `buy_issue_id`: optional explicit Buy issue UUID/string for updates. Omission
  means create a new record; it never selects an arbitrary previous request.

Only the three task files were added; no existing serializer, shared helper,
model, authentication bridge, Coordinator or specialist was changed.

## Identity, ownership and privacy

The service follows Task 2.4's server-supplied `user` convention. A future ADK
wrapper must first resolve the user via the existing
[`get_authenticated_user(tool_context)`](../auth.py), not trust editable state
alone. A DRF caller can supply its JWT-authenticated `request.user`. Async
callers must dispatch this synchronous service via `sync_to_async` with
`thread_sensitive=True`, as with the existing agents.

The service requires a saved active instance of the configured Django user
model, and rechecks account existence/activity. Null, anonymous, unsaved,
inactive, deleted, or raw identity mappings cannot authorize a write. The
service itself cannot prove how trusted server code obtained a user object;
that provenance belongs to the existing JWT bridge/DRF boundary.

Updates query by **both issue UUID and user**, with `select_for_update` inside
`transaction.atomic()`. Missing, malformed and foreign IDs all return the same
`Buy issue not found.` error with null data and no IDs. No private foreign
description, preferences, budgets, or ownership details are returned. The API
does not accept ownership fields, status changes, or arbitrary keyword payloads;
unsupported Python keywords raise `TypeError` before the function runs.

Buy issues remain private because they are not published inventory: no `Post`
is created, changed, or approved by this service. Publishing an optional Buy
post stays with the Post Agent and its separate approval flow.

## Validation and dependencies

The existing [`BuyIssue`](../../issues/models.py) has UUID/user, TextField
description, nullable `DecimalField(12,2)` min/max budgets, nullable JSON
preferences, open/closed status, and timestamps. Description has no declared
model `max_length`; this service invents no artificial character limit.

After strict input-type guards, [`BuyIssueSerializer`](../../issues/serializers.py)
validates existing model field constraints, budget precision and finite values,
nonnegativity, and the **effective** min/max range on updates. More than two
fractional digits or more than ten integer digits are rejected, not rounded or
truncated. Equal budgets and zero are valid. The lower budget cannot exceed
the upper budget when both are present. `_money()` is not used because it is a
public-JSON conversion helper, not the private Decimal-field contract.

Preferences are checked for a dict with string keys and JSON encodability using
`allow_nan=False`. Nonfinite values, Decimal/date/set/object values and malformed
containers are rejected. The serializer calls the existing
[`normalize_preferences()`](../../common/validators.py), whose supported keys are:

| Key | Existing validation |
| --- | --- |
| `preferred_makes`, `preferred_models` | Lists of nonblank strings; existing count/length limits. |
| `minimum_year` | Integer accepted by shared model-year validation. |
| `maximum_mileage` | Nonnegative integer, not boolean. |
| `vehicle_type` | `new` or `used`. |
| `fuel_type`, `location` | Optional strings, trimmed; existing length limits. |

Unknown keys (including ownership fields) are rejected. JSON compatibility does
not override the preference schema. Validated preference content is copied by
normalization rather than mutating the caller's input.

Persistence reuses [`create_buy_issue(user, data)` and
`update_buy_issue(issue, data)`](../../issues/services.py), passing only explicit
validated fields. Serialization is inside the same atomic transaction, so a
failed save or response conversion rolls back rather than leaving partial state.
Generic validation/database errors do not expose raw input, SQL or exceptions.
The transaction lock is effective on databases supporting row locks; SQLite
does not provide PostgreSQL's `SELECT FOR UPDATE` concurrency guarantees.

## Runtime flow and output

1. Check the trusted server-supplied user and current account activity.
2. Start a transaction; if an update ID was given, resolve and lock the owned row.
3. Validate description, budget types and JSON preferences.
4. Run the existing serializer, using the saved issue to check partial budgets.
5. Call the shared create or update helper with validated data.
6. Return the existing shared envelope with Decimal budgets serialized as exact
   strings and `ids.issue` suitable for Coordinator `active_issue` restoration.

Example with synthetic buyer requirements:

```python
create_or_update_buy_issue(
    "Looking for a Toyota Camry",
    min_budget="5000.00", max_budget="15000.50",
    preferences={"preferred_makes": ["Toyota"], "vehicle_type": "used"},
    user=trusted_user,
)
```

The response is:

```python
{
    "status": "ok",
    "data": {
        "id": "<new-issue-uuid>", "description": "Looking for a Toyota Camry",
        "min_budget": "5000.00", "max_budget": "15000.50",
        "preferences": {"preferred_makes": ["Toyota"], "vehicle_type": "used"},
        "status": "open",
    },
    "ids": {"issue": {"type": "buy", "id": "<new-issue-uuid>"}},
    "provenance": "own_buy_issues",
    "error": None,
}
```

Invalid input/authentication/target/database operations return the same envelope
with `status="error"`, generic `error`, `data=None`, `ids={}`, and no private
payload. Failed updates preserve all prior valid fields and timestamps.

## What to explain to teammates/judges

The model does not write arbitrary database fields. It supplies buyer intent;
trusted server identity, existing schema validation, ownership checks and shared
Django persistence determine what can actually be saved. Creating a private
request is not publishing a listing or approving contact disclosure. Task 3.2
must recheck ownership when consuming the saved issue; the ID in chat history is
context, not authorization. No purchase matches or dealer stock are fabricated.

## Focused verification

From `backend/`, using the existing environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_buy_issue_service -v 1 --noinput
```

Tests use isolated database records and no external calls. They cover private
create/update, explicit targets, description/money/preferences validation,
partial-budget consistency, nullable/omitted fields, ownership spoofing, invalid
and foreign targets, authentication, structured output and rollback behavior.

Actual result: **18 passed, 0 failed** using the existing Python 3.12.15
environment. Django reported no system-check issues; the function import
succeeded. The tests exposed nullable serializer handling of blank budget
strings; the service now rejects those explicitly instead of treating them as
null. Git status and diff review showed only the three intended new files,
with no pre-existing uncommitted changes to disturb. `git diff --check` passed;
untracked-file content was reviewed using `git diff --no-index`. No dependencies
were installed and no files were staged or committed.
