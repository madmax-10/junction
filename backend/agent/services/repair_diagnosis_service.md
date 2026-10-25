# Agent 6 — Task 6.2: Save preliminary repair information

## Purpose and reviewed checkpoint

Task 6.1 creates the private report; Task 6.2 stores supplied structured symptoms
and preliminary AI analysis on that existing report. It does not generate analysis.
The user supplied local Git verification: branch `Agent6(Repair)`, clean working
tree, Task 6.1 committed as `cdb91f8`. Read-only review of
[Task 6.1](./repair_issue_service.py) and its
[tests](../tests/test_repair_issue_service.py) found no critical defect in the
active-user checks, owner-scoped vehicle lookup, description validation or generic
private-reference failures. Task 6.1 is unchanged.

## Signature and trust boundary

```python
save_diagnosis(repair_issue_id, symptoms, ai_analysis, *, user=None)
```

`repair_issue_id` is an existing UUID object or UUID string. `symptoms` and
`ai_analysis` are replacement values, not merge patches. Null is supported by
the existing nullable model contract and clears the respective field.
`user` is a trusted server-supplied Django user, following Task 6.1. DRF callers
use JWT-authenticated `request.user`; ADK callers obtain it through the shared
[get_authenticated_user bridge](../auth.py). Never expose this function directly
as a model tool accepting identity claims. Async callers must use the existing
`sync_to_async(thread_sensitive=True)` convention.

The function rejects missing, anonymous, unsaved, inactive, deleted or raw-ID
identities. It rechecks account activity in the database. This establishes the
same service trust boundary as Task 6.1; it does not independently authenticate
a caller-supplied arbitrary user object.

## Fields, ownership and validation

The existing [RepairIssue](../../issues/models.py) contains UUID `id`, `user`,
`used_car`, `description`, nullable JSON `symptoms` and `ai_analysis`, `status`,
`resolution_details`, `resolved_at`, and timestamps. The lookup requires both
the issue's user and its related [UsedCar](../../vehicles/models.py) owner to
match the authenticated user. Staff has no override. Missing, malformed,
foreign and inconsistent references return the same private-reference error.

The [existing serializer](../../issues/serializers.py) and
[shared validators](../../common/validators.py) define the schema:

| Field | Existing accepted structure |
| --- | --- |
| symptoms | Object with optional `confirmed` and `inferred` lists; each list has at most 20 nonblank strings, each at most 300 characters |
| ai_analysis | Object with optional `possibilities` list and `notes` string |
| possibilities | At most 20 objects; each requires nonblank `cause` and `uncertainty`, each at most 300 characters; no other keys |
| notes | Optional string, at most 2000 characters |

Unknown keys and unsupported structures are rejected. Raw inputs must serialize
as JSON with non-finite numbers disabled, before normalization. Serializer
normalization trims outer string whitespace, omits empty optional collections
and null optional values, and maps empty objects to null. No meaningful symptom
text is truncated. The real model JSON fields also validate normalized values.
There are no invented confidence scores, urgency keys or diagnosis fields.

`confirmed` refers to reported observations under the existing symptom schema;
it does not confirm a mechanical cause. Each possible cause requires its own
uncertainty text. Notes-only preliminary analysis is also valid. These checks
validate structure, not the truth of a claim, its AI origin, or the adequacy of
its uncertainty wording. The trusted caller is responsible for supplying the
proper report and analysis provenance; the schema has no provenance attribute.

## Runtime and atomic persistence

```text
Trusted authenticated user + issue UUID + supplied symptoms/analysis
    -> verify current active saved user
    -> parse UUID
    -> atomic owner-scoped locked RepairIssue lookup
    -> locked UsedCar lookup requiring the same owner
    -> raw JSON checks -> existing serializer -> model field validation
    -> one UPDATE of symptoms and ai_analysis only
    -> shared private success envelope
```

Both inputs validate before the database update. An invalid second input cannot
persist the first. Failure during saving or result construction rolls back the
transaction. No INSERT occurs. `update_fields` contains exactly `symptoms` and
`ai_analysis`; even `updated_at` is preserved to honor the two-field restriction.
Description, vehicle, user, issue identity, status and actual resolution remain
unchanged. Existing analysis can be replaced in any existing status without
changing a confirmed repair outcome in `resolution_details` or `resolved_at`.
SQLite is the existing database and does not enforce row locks. On a backend
supporting row locks, the selected issue and vehicle rows are locked until the
transaction finishes. This adds no new infrastructure or concurrency guarantee
to SQLite. Concurrent successful replacement calls follow database semantics;
there is no versioning or merge protocol.

## Results and error cases

Success uses the [shared result contract](../tools/result.py):

```json
{
  "status": "ok",
  "data": {"id": "<issue UUID>", "status": "open"},
  "ids": {"issue": {"type": "repair", "id": "<issue UUID>"}},
  "provenance": "own_repair_issues",
  "error": null
}
```

The returned issue status is the existing database value, not always `open`.
Errors use that same envelope with `status: error`, null data, empty IDs and
null provenance. Messages are `Authentication is required.`, `Repair issue not
found.`, `Invalid repair diagnosis data.`, or `Unable to save repair diagnosis.`.
No ORM object, raw SQL, exception details, user profile, vehicle details or
another owner's private existence is returned. Unknown ownership override
keywords fail at Python's signature boundary.

## Safety, privacy and subsequent tasks

Brake failure, steering trouble, fuel leaks, smoke/fire, overheating and sudden
power loss remain in the supplied symptom text. Warnings can be retained in
existing analysis notes. The service generates no reassurance and never declares
a vehicle safe, a hypothesis confirmed, or a repair completed. It cannot
fact-check analysis or detect all unsafe assertions in supplied free text.
User-facing safety escalation belongs to the later Repair Agent/Coordinator.

Storing an AI hypothesis preserves a possibility and its uncertainty. Confirming
a mechanical diagnosis requires evidence outside this storage function. Recording
an actual repair outcome uses the separate resolution workflow.

Task 6.3 can use `ids.issue` to retrieve this owner's saved symptoms through the
existing authorized issue flow. This service does not retrieve public posts,
estimate costs, find mechanics, call Gemini/Places/SerpApi, publish a Post,
create vehicles, or modify Buyer/Seller/Coordinator code.

## Tests and verification

Run from `backend/` using the existing Python 3.12.15 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_repair_diagnosis_service agent.tests.test_repair_issue_service issues.tests agent.tests.test_auth -v 1 --noinput
```

Final result: **63 passed, 0 failed**: 24 focused Task 6.2 tests plus the 39
Task 6.1/issue/auth regressions. The initial run exposed a protected-FK deletion
in a test fixture; the fixture now uses an independent account. No production
change was needed for that failure. Django system checks report no issues and
editor diagnostics report no errors in the new Python files.

Tests exercise actual ownership and ORM persistence, invalid/missing identity,
private/missing/malformed identifiers, inconsistent vehicle ownership, schema
constraints, JSON failures, uncertainty, status/resolution preservation, replacing
analysis, safety text, normalization, shared results, database failure and rollback
after a write. Query capture verifies one permitted UPDATE and no writes on
failed authentication. Snapshot comparisons protect unrelated records. No Post
is created and network connections are blocked during the success-boundary test.
Django uses an isolated test database; application records are not used.

Exactly one production function and only the three permitted task files were
added. No teammate files were edited, no dependencies installed, and nothing
was staged, committed or pushed. Python AST/import and whitespace checks are
used for local verification. Git commands (`diff --check`, `diff --stat`, and
final `status --short`) remain unavailable because this execution environment's
Apple Git launcher cannot locate developer tools. The user's clean committed
checkpoint is the baseline; final Git-wide change-count verification must be
performed locally. System tools were not installed.
