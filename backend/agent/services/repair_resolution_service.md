# Agent 6 — Task 6.6: Private owner-reported repair outcomes

## Purpose and dependency

`record_resolution()` records what an authenticated owner says happened after a
repair attempt. It does not independently verify the mechanical outcome, create
a diagnosis, determine driving safety or publish a Post. Existing Toyota owners
are supported through the ordinary owned-vehicle relationship; there is no new
Toyota-only model constraint or unsupported vehicle restriction.

Before edits, Task 6.5's production, test and documentation files matched commit
`24624cf5563eb15ce7cb7377e4e953a1634acf18` through read-only Git object inspection.
Tasks 6.1–6.5, authentication, models, resolution serializers/helpers, tests and
documentation were inspected. There was already a low-level persistence helper,
but no equivalent authenticated agent-result boundary. This task reuses that
helper rather than duplicating the database update implementation.

## Exact signature and existing input contract

```python
record_resolution(repair_issue_id, resolution_details, *, user=None)
```

The second argument is the existing resolution endpoint payload, **including
the explicit status**, rather than just the nested JSON field. This preserves
the requested two positional arguments without inventing new schema keys:

```python
result = record_resolution(
    issue.id,
    {
        "status": "resolved",
        "resolution_details": {
            "method": "mechanic",
            "work_performed": "Battery replaced; owner reports the car starts normally now",
            "mechanic_name": "Owner-supplied garage name",
            "cost": "180.25",
        },
    },
    user=request.user,
)
```

Both outer keys are required and additional outer keys are rejected. Status
must explicitly be `resolved`, `unresolved` or `unsure`, as defined by the
existing [ResolutionSerializer](../../issues/serializers.py). There is no default
success status and `open` is not an outcome status.

The nested field uses the [shared resolution validator](../../common/validators.py):

| Method | Allowed details |
| --- | --- |
| mechanic | `method`, `work_performed` (1000 characters), `mechanic_name` (100), `location` (255), `cost` |
| self | `method`, `instructions` (2000 characters), `parts_used` (up to 20 strings of 100 characters each), `cost` |

This service additionally requires meaningful `work_performed` for mechanic
work or `instructions` for self work. Put the owner's description of what
changed or remained wrong in that existing text field. The schema has no
separate outcome-description or diagnosis-verification field. The explicit
status records whether the owner considers the result resolved, unresolved or
uncertain; wording alone is not interpreted to infer a status.

Strings are trimmed by existing validation. Empty required descriptions, wrong
types, excess lengths, invalid methods, unknown nested fields and unsupported
structures fail. Raw input must serialize as strict JSON before normalization;
sets, objects, cycles and nonfinite numeric values cannot be saved. Expected
serializer/model/decimal errors yield a generic structured validation error.
The real model JSON field validates the normalized details before persistence.

Optional cost follows the existing expense contract: finite nonnegative amounts
are normalized to two decimal places. Zero is allowed for an owner reporting
no expense; this is not the cost-estimation service's evidence rule. No currency,
market quote, coverage, paid invoice or completeness claim is added. Existing
normalization stores fractional amounts as JSON floats; this service does not
claim arbitrary precision beyond that shared convention. Result costs are
converted to Decimal and serialized as strings for compatibility with the agent
result contract. No schema or shared money validator changes are made.

## Authentication and ownership

Trusted server code supplies a saved active Django user, following Tasks 6.1–6.5.
DRF uses JWT-authenticated `request.user`; future ADK code uses the existing
[get_authenticated_user bridge](../auth.py). An arbitrary LLM identity, client
owner claim or editable session user ID is not authorization. Missing, anonymous,
unsaved, inactive or deleted users fail; current activity/existence is rechecked.

The service parses the report UUID and selects an existing
[RepairIssue](../../issues/models.py) scoped to that user. It then verifies the
related [UsedCar](../../vehicles/models.py) is still owned by the same user.
Staff has no bypass. Invalid, missing, foreign or inconsistent references share
`Repair issue not found.` with no private details or IDs.

## Updates, repeats and status safety

The existing model has `open`, `resolved`, `unresolved` and `unsure` statuses.
Its resolution fields are nullable JSON `resolution_details` and nullable
`resolved_at`. The service reuses
[issues.services.record_resolution](../../issues/services.py) after authorization
and validation. That helper updates exactly `status`, `resolution_details`,
`resolved_at` and `updated_at`, sets a timestamp for `resolved`, and clears it
for unresolved/unsure outcomes. Original description, symptoms, AI analysis,
vehicle, user, identity and creation date are untouched.

- An open, unresolved or unsure issue can receive an explicit valid outcome.
- Unresolved work remains unresolved; an unsure outcome remains unsure.
- A later explicit owner submission may change unresolved/unsure to resolved.
- A normalized identical submission is a no-write success; timestamps are stable.
- Any differing submission to an already resolved issue is rejected, including
  changing expense, description, method or downgrading its status.

The unrestricted low-level helper is not an explicit confirmed-outcome correction
workflow, so this boundary does not silently use it to overwrite resolved history.
That guard is specific to this new service; it does not change other existing
endpoints or promise a repository-wide immutability policy.

For nonresolved cases, a valid submission is a **complete replacement** of the
resolution details under the existing helper contract, not an implicit merge.
Callers must include optional details they intend to retain. Invalid or missing
submissions never delete earlier data. No erase/clear command is provided.

The issue and owned car are selected with `select_for_update()` inside an atomic
transaction, in the same order as Task 6.2. Complete validation precedes writing;
persistence and response construction share that transaction. A database error
or expected result-construction failure after a write rolls back the change.
Databases supporting row locks serialize this service's competing issue writes.
The current SQLite database does not enforce row-level locks; this task adds no
new infrastructure or claim of PostgreSQL-style concurrency guarantees on SQLite.

## Runtime walkthrough

```text
Trusted user + issue UUID + explicit owner outcome payload
    -> verify current active saved user
    -> parse UUID
    -> atomic locked owner-scoped issue lookup
    -> locked owned-car verification
    -> strict JSON / existing serializer / meaningful description / field checks
    -> identical? return success without writing
    -> conflicting resolved outcome? return error without writing
    -> existing resolution persistence helper
    -> private owner-reported result; commit transaction
```

For Django learners: a model describes stored fields, a serializer checks
incoming data, and the existing service performs the permitted update. Wrapping
these steps in a transaction means they persist together or roll back together.
The new function adds trusted authorization and repeat/conflict handling around
that established persistence path. It never creates a second RepairIssue.

## Result and errors

Success follows the [shared result envelope](../tools/result.py):

```json
{
  "status": "ok",
  "data": {
    "id": "<authorized issue UUID>",
    "status": "resolved",
    "resolution_details": {"method": "mechanic", "work_performed": "Owner reports battery replaced and normal starting", "cost": "180.25"},
    "stored": true,
    "owner_reported": true,
    "limitations": ["Owner-reported outcome; not independently mechanically verified or a driving-safety assessment."]
  },
  "ids": {"issue": {"type": "repair", "id": "<authorized issue UUID>"}},
  "provenance": "own_repair_issues",
  "error": null
}
```

The details are normalized owner-supplied data returned only to the authorized
caller. No private vehicle attributes, other issue data, user profile, symptoms
or analysis are included. Owner-reported provenance is explicit in the result;
the existing stored schema has no separate verification flag to add.

Errors use `status: error`, null data and empty IDs. Messages cover authentication,
generic issue lookup, invalid resolution payload, missing meaningful description,
conflicting resolved outcome, and generic persistence failure. Raw exceptions,
SQL and foreign-owner information are not returned.

## Privacy, diagnosis and later integration

A preliminary AI cause is an unverified hypothesis. An owner-reported resolution
is what the owner says happened, even when they select `resolved`; it is not
independent mechanical confirmation. Neither status nor expense establishes
driving safety. The service performs no external calls, mechanic contact or
search. It creates no public Post and never invokes the Post Agent. Publication
requires a separate Coordinator/Post Agent flow and explicit owner approval.

Tasks 6.1–6.5 continue creating reports, storing preliminary analysis, finding
community experiences, returning supported cost-service limitations and discovering
businesses. This task only records the private reported outcome. A future ADK
wrapper must obtain trusted identity from the existing bridge, collect an
explicit owner outcome and call this synchronous function through the established
`sync_to_async(thread_sensitive=True)` pattern. No wrapper or Coordinator code
is added here.

## Actual verification

From `backend/`, using the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_repair_resolution_service agent.tests.test_repair_mechanic_service agent.tests.test_repair_cost_service agent.tests.test_repair_search_service agent.tests.test_repair_issue_service agent.tests.test_repair_diagnosis_service issues.tests agent.tests.test_auth -v 1 --noinput
```

Final result: **159 passed / 0 failed**, including 26 new resolution tests and
133 existing tests. The initial run found a test-helper mistake that placed
status at its valid outer level instead of testing an invalid nested field;
the fixture construction was corrected and the full suite rerun. Django system
checks and editor diagnostics report no issues. Tests exercise real isolated
ORM ownership and resolution records, meaningful descriptions, schema constraints,
strict JSON, every accepted outcome, explicit status changes, preserved fields,
idempotent repeats, resolved conflicts, safe failures, database/result rollback,
no new issues/Posts and no external calls. No paid APIs were called.

AST checks verify syntax and exactly one new production function; whitespace
checks cover the three task files. Imports are exercised by Django tests. Only
the permitted production, focused test and explanation files were written.
Existing tracked content is checked against committed Git objects. Native Git
status/diff/check/stat remain unavailable because this environment's Apple Git
launcher cannot locate developer tools; final native output is left for local
Terminal. No dependencies/system tools were installed, teammate files modified,
or commits/pushes/merges/rebases/resets/identity changes performed.
