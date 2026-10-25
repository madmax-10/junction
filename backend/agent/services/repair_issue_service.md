# Agent 6, Task 6.1 — Create a private repair report

## Purpose and checkpoint

[`create_repair_issue()`](./repair_issue_service.py) records an authenticated
owner's actual problem description for an already registered car. It does not
diagnose, triage, suggest repairs, estimate cost, locate mechanics, or publish.

Before editing, `Agent6(Repair)` had a clean worktree. The completed Buyer
integration was committed through `673ea7c` (`Agent3(buyer) (#5)`). No prior work
is combined into this task. Only this service, its focused tests and this
document are added; no Coordinator, model, authentication or specialist changes.

## Reuse decision: an existing low-level helper is not a duplicate entry point

[`issues.services.create_repair_issue(user, data)`](../../issues/services.py)
already exists. It checks a supplied vehicle object's ownership and persists a
model instance, but expects already validated input and a trusted caller. It
does not validate a UUID/description, check current authentication/activity, or
return the shared agent result envelope. It is therefore not equivalent to the
requested safe Agent 6 service boundary.

This task **reuses** that helper under the alias `create_repair_issue_record`;
it does not implement a second INSERT path or edit that helper. The existing
[`RepairIssueSerializer`](../../issues/serializers.py) supplies application
validation. Existing `issues.tests` includes owned-car denial and normal Repair
creation/resolution flows; the new tests focus on this service's full boundary.

## Exact signature, inputs and trusted identity

```python
create_repair_issue(used_car_id, description=None, *, user)
```

- `used_car_id`: a registered vehicle UUID object or valid UUID string. No new
  vehicle is registered automatically.
- `description`: meaningful problem text, required; default null returns a
  structured validation error if omitted.
- `user`: keyword-only **trusted server-supplied Django user**, as in Task 3.1.
  It is not a model-generated user ID, owner claim or editable session value.

A future tool must obtain `user` through the existing
[`get_authenticated_user(tool_context)`](../auth.py) bridge; a DRF caller uses
JWT-authenticated `request.user`. This synchronous service is not an ADK tool.
Async callers will need `sync_to_async(thread_sensitive=True)` as used by the
existing agents. No new authentication logic or fallback is introduced.

The user must be a saved active instance of the configured user model; current
database activity is rechecked. Anonymous/null/raw ID mappings, unsaved users,
inactive or deleted accounts cannot authorize creation. The service assumes
trusted server code obtained the user through the established boundary rather
than taking an arbitrary user object from chat input.

## Model relationships and validation

[`UsedCar`](../../vehicles/models.py) has UUID `id` and required `owner` FK.
The service filters by **both vehicle ID and authenticated owner**, with
`select_for_update()` in a transaction. No other owner's vehicle is fetched to
inspect its attributes. Staff status does not override ownership.

The existing [`RepairIssue`](../../issues/models.py) has required `user`,
`used_car` and TextField `description`. Its legitimate initial status is `open`.
`symptoms`, `ai_analysis`, `resolution_details` and `resolved_at` default to null
and remain untouched. A car may have multiple independent repair reports.
No existing duplicate/resume rule applies; each successful call creates a new
issue rather than selecting or merging with an earlier case.

Description must be a nonblank string. The existing serializer trims outer
whitespace, preserves interior text and rejects invalid characters such as null
characters. There is **no declared model maximum length**: long meaningful
reports are accepted without an invented cap or silent truncation. Tests cover
this explicitly instead of claiming a nonexistent length limit was enforced.

The serializer's vehicle-reference queryset is also scoped to the verified car
and owner, avoiding the default unscoped relation lookup. Only `used_car` and
`description` are supplied to it; no caller can override user, status, symptoms,
analysis, diagnosis or resolution. The shared create helper rechecks ownership.

## Runtime diagram and creation flow

```text
Trusted JWT/ADK identity + vehicle UUID + owner's description
    ↓ verify saved active Django user
    ↓ parse UUID; generic failure for malformed/private/missing car
    ↓ atomic owner-scoped, locked UsedCar lookup
    ↓ existing RepairIssueSerializer validates owned reference and description
    ↓ shared issues.services.create_repair_issue(user, validated_data)
Private RepairIssue (open; analysis/symptoms/resolution absent)
    ↓ existing tool_result() with issue and owned vehicle IDs
Coordinator can continue the Repair workflow later
```

Validation occurs before writing. Persistence and result serialization share
the same transaction, so even a failure after INSERT rolls the issue back.
SQLite is currently configured and does not provide PostgreSQL's row-lock
semantics; the locking query is ready for a database that supports row locks.
No new database configuration, indexes or migrations are introduced.

## Structured output and errors

```python
{
    "status": "ok",
    "data": {
        "id": "<repair-issue-uuid>", "used_car_id": "<owned-car-uuid>",
        "description": "Engine will not start", "status": "open",
    },
    "ids": {
        "used_car_id": "<owned-car-uuid>",
        "issue": {"type": "repair", "id": "<repair-issue-uuid>"},
    },
    "provenance": "own_repair_issues",
    "error": None,
}
```

This uses the existing [`tool_result`/`error_result`](../tools/result.py)
contract. The issue/vehicle IDs match existing Coordinator state conventions.
No unrestricted model, user profile, foreign vehicle detail or generated repair
information is returned.

- Missing trusted identity: generic `Authentication is required.` error.
- Foreign, missing, null or malformed vehicle ID: identical `Vehicle not found.`
  error, null data and no IDs; private vehicle existence is not disclosed.
- Blank/unsupported/invalid description: `Invalid repair issue description.`.
- Expected persistence/validation failures: generic `Unable to create repair
  issue.`; no raw exception, SQL or partial record.
- Unknown Python keywords (ownership, status or analysis overrides) are rejected
  by the function signature before execution, rather than forwarded to the model.

## Privacy, mechanical safety and later use

Only the owner receives the saved report. There is no Post search, draft or
publication and no Buy/Sell issue mutation. Contact/profile data is not read.
No Gemini, SerpApi, Places or other external API is involved.

Safety-critical descriptions such as brake failure, steering problems,
overheating and fuel leaks are retained. The service does **not** say the car
is safe, harmless or repaired, and does not generate a diagnosis. Coordinator
safety messaging and uncertain AI analysis belong to later tasks.

The Coordinator can later use the returned `ids.issue` and `ids.used_car_id`
to continue the owner's case. Task 6.2 can save owner-reported symptoms separately
from uncertain AI analysis after rechecking ownership. Any eventual experience
post still belongs to the Post Agent and explicit owner approval. Actual Repair
ADK tools, orchestration, safety triage and conversation-level retry/idempotency
remain out of scope. Repeated successful calls intentionally create distinct
reports, so callers must not blindly replay completed write tools.

For teammates/judges: this is a guarded record-creation boundary, not an AI
mechanic. Authentication establishes who is asking; the database proves car
ownership; shared validators and persistence save exactly the report the owner
supplied. Other agents cannot gain private access by inventing an identifier.

## Focused tests and actual verification

From `backend/`, using the existing environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_repair_issue_service issues.tests agent.tests.test_auth -v 1 --noinput
```

Isolated synthetic fixtures test actual ownership checks, private report
creation, initial defaults, UUID/error handling, invalid/long/safety-critical
descriptions, independent reports, immutable ownership, no publication or other
record mutations, generic failures and transactional rollback. Existing issue
API and authentication-bridge tests run as relevant regressions.

Actual verification: **18 focused Task 6.1 tests and 21 existing issue/auth
regressions passed (39 total), 0 failed**, using Python 3.12.15. Django reported
no system-check issues; the new function imported successfully. Editor
diagnostics report no errors. Git status/diff review shows exactly the three
new task files and no modifications to previous tasks or teammate code.
Whitespace checks passed, including review of new untracked file contents.
Exactly one production function was added. No files were staged or committed,
no packages installed, and no external APIs called.
