# Agent 6 — Task 6.4: Repair-cost service foundation

## Supported outcome and concrete limitation

`estimate_repair_cost()` is a secure, deterministic, read-only boundary for an
owner's repair issue. **It currently returns `insufficient_data` for every valid
authorized request. It does not implement numerical cost estimation.** This is
the safe supported behavior explicitly permitted by Task 6.4 when trustworthy
pricing evidence is unavailable.

Inspection found an optional public Repair `cost`, but no supported currency,
complete-repair/parts/labor coverage attribute, standardized procedure identity,
or trustworthy external pricing integration. No currency is established globally
by the repair contracts. Assuming USD because the hackathon is in Texas would
invent evidence. No amount of keyword overlap resolves these missing facts.

Task 6.3 was verified committed before edits: all three of its files matched
HEAD `1fc1ce8eb0e49cad8998cdacedf7dd88e2c78baa` byte for byte through read-only
Git object inspection. Native Apple Git remains unavailable here.

## Inputs, trust and output

```python
estimate_repair_cost(repair_issue_id, *, user=None)
```

The identifier accepts a UUID object or UUID string. Trusted Django server code
supplies the keyword-only user, following Tasks 6.1–6.3. The user must be a saved,
active instance of the configured account model, and current activity/existence
is checked in the database. Missing identity, anonymous objects, raw identity
mappings, inactive/deleted accounts and unsaved accounts cannot authorize access.

A DRF caller uses JWT-authenticated `request.user`. Future ADK integration must
resolve identity through the existing
[get_authenticated_user bridge](../auth.py), then invoke this synchronous service
through the established `sync_to_async(thread_sensitive=True)` convention.
An LLM/client-supplied user ID is never trusted. This function is not an ADK tool.

```python
result = estimate_repair_cost(issue.id, user=request.user)
```

The authorized result uses the [shared envelope](../tools/result.py):

```json
{
  "status": "insufficient_data",
  "data": {
    "id": "<authorized-repair-issue-uuid>",
    "status": "insufficient_data",
    "currency": null,
    "low": null,
    "median": null,
    "high": null,
    "evidence_count": 0,
    "evidence_type": null,
    "source_post_ids": [],
    "limitations": ["<pricing-contract, procedure, historical-price and safety explanations>"]
  },
  "ids": {"issue": {"type": "repair", "id": "<authorized-repair-issue-uuid>"}, "post_ids": []},
  "provenance": "own_repair_issues",
  "error": null
}
```

Null amounts are absence of evidence, not zero-dollar repairs. `evidence_count`
counts qualified pricing observations, not community posts or existing database
rows. There are currently zero qualified observations. No source is attributed
as pricing evidence because none can meet the verified contract. No fallback
range, default currency or demo/live price claim is generated.

Authentication errors use `Authentication is required.`. Foreign, missing,
malformed or inconsistent ownership references all use `Repair issue not found.`.
Invalid stored symptom/analysis data uses `Invalid saved repair diagnosis data.`.
Database failures use `Repair cost evidence is unavailable.`. Errors use the
existing error envelope with null data and empty IDs; no raw SQL or exception
details are returned.

## Actual models, services and pricing inspection

The existing [RepairIssue](../../issues/models.py) holds `user`, `used_car`,
description, structured symptoms/analysis, status, resolution details and dates.
Its [UsedCar](../../vehicles/models.py) has an owner and vehicle attributes.
An owner-scoped joined query requires both the issue user and car owner to match.
The authorized issue and related vehicle are loaded, including stored context;
only symptoms/analysis are passed through the existing
[RepairIssueSerializer](../../issues/serializers.py) to validate their structure.
No private context is emitted and no condition-specific price adjustment occurs.

The [public Post](../../posts/models.py) uses `issue_type`, `status`, `approved_at`
and a JSON snapshot. The existing [publication flow](../../posts/services.py)
validates public Repair snapshots, requires `owner_reported: true`, sets published
status and records approval. Its [public schema](../../posts/validation.py)
supports optional `cost`, `method` and free-text `work_performed` but rejects new
keys such as `currency` or `cost_scope`. Shared money validation permits zero and
serializes using integers/floats; it does not establish repair-pricing provenance,
currency, coverage or procedure comparability.

[Task 6.3](./repair_search_service.py) returns ranked public problem/symptom/work
text and source post IDs, but intentionally omits cost. Its keyword score is not
a confirmed procedure or pricing-comparability contract. Reusing that score to
average repairs would incorrectly turn text overlap into a financial assertion.
The function therefore does not call the search or scan public posts at runtime:
the schema-level failure already disqualifies every possible current observation.
It never queries other owners' private RepairIssues as substitute evidence.

The existing [Valuation estimator](./valuation_service.py) validates finite
Decimal/integer/string asking prices, deduplicates by source ID and computes
observed min/median/max. It explicitly assumes comparable same-currency input
and is about vehicle asking prices. It cannot establish the missing Repair
contracts, so it is inspected but not repurposed or modified. Repository Python
search found no implemented SerpApi/structured repair-pricing client; a settings
comment naming an API key is not an integration. No external API is introduced.

## Evidence rejection and calculation limits

Current repair costs, including positive published amounts, are rejected as
unqualified evidence because currency and complete-repair coverage cannot be
established. Missing, zero, negative, malformed, nonfinite or floating-point
amounts cannot bypass that decision. Unsupported currency/scope keys injected
directly into a database row cannot activate estimation. Single observations,
duplicates, different procedures, labor-only and parts-only figures likewise
never produce a range or inflated evidence count.

There is no Decimal arithmetic or rounding in the current service because no
prices qualify. This avoids converting existing binary float costs into falsely
precise Decimal evidence. In a future supported contract, minimum and maximum
would mean the smallest/largest qualified observed complete-repair expenses;
median would mean the middle observation, or the exact Decimal average of the
two middle observations. These terms do not imply market coverage or guaranteed
quotes. Such a future implementation would first need attributable independent
observations, a supported common currency and genuinely comparable procedures
and coverage. This task adds no speculative helper, ranking or pricing source.

The numerical-success, precision-arithmetic and min/median/max scenarios from
the requested test list cannot truthfully be implemented under the present
schema. Tests instead prove they remain unavailable rather than create a fake
pricing interface to make a successful calculation test pass.

## Runtime walkthrough for Django learners

1. Validate that server-supplied identity is a real saved active account and
   recheck current account activity with an ORM SELECT.
2. Parse the issue UUID. Use a generic lookup error for unsupported identifiers.
3. Query the requested RepairIssue with both user and related-car ownership
   filters. `select_related` fetches the authorized vehicle in the same SELECT.
   Staff status gives no override.
4. Validate existing JSON symptom/analysis structures with the shared serializer.
   A possible cause remains an unverified hypothesis; it does not select a repair.
5. Return the shared `insufficient_data` envelope, null amounts and explicit
   missing-contract explanations. No prices are queried or calculated.

```text
Trusted user + private issue UUID
    -> active saved account check
    -> authorized issue AND owned-car SELECT
    -> existing symptom/analysis validation
    -> explain unavailable trustworthy pricing evidence
    -> insufficient_data; no prices; no writes; no external calls
```

The normal path uses two SELECTs. It calls no save/update/create method and
requires no write transaction. Original description, vehicle, status, symptoms,
analysis and actual resolution details remain unchanged. A resolved issue's
documented work still cannot establish public cost currency or coverage.

## Safety, privacy and relationship to later work

Storing an AI cause does not confirm a mechanical fault. Documenting a repair
expense does not prove that a similar symptom requires the same procedure.
This service diagnoses nothing, recommends no cheap procedure, and makes no
safe-to-drive claim. Fixed limitations explicitly mention brake failure,
steering problems, fuel leaks, smoke/fire, overheating and sudden power loss.
A future low price must never be presented as a reason the vehicle is safe.

No contacts, account identifiers, private car UUIDs, other users' issue existence,
public source issue UUIDs or ORM objects appear in results. Tasks 6.1–6.3 remain
unchanged and continue creating reports, storing preliminary context and finding
public anecdotes. ADK integration, mechanics discovery, AI generation and a
future team-approved pricing contract are separate tasks.

## Actual tests and verification

From `backend/`, the existing Python 3.12.15 environment ran:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_repair_cost_service agent.tests.test_repair_search_service agent.tests.test_repair_issue_service agent.tests.test_repair_diagnosis_service issues.tests agent.tests.test_auth -v 1 --noinput
```

**106 passed / 0 failed**: 20 new cost-service tests, 23 search tests, 24 diagnosis
tests, 18 creation tests and 21 existing issue/authentication regressions.
Django system checks and new-file editor diagnostics report no errors. Tests
use real isolated ORM records; no paid API is called. Coverage includes generic
private failures, ownership, strict identifiers, inactive users, missing or
unqualified prices, currency/schema rejection, single/duplicate/partial expenses,
no fabricated ranges, uncertainty, documented outcomes, privacy, deterministic
responses and database errors. Query capture proves SELECT-only execution;
record snapshots prove issue, vehicle and Post preservation. Network connections
are blocked during the normal-path test.

Syntax/function-count and whitespace checks cover the three allowed task files.
The Django suite imports the function. Exactly one production function is added;
no helpers, migrations, dependencies or teammate changes are introduced. Native
Git status/diff/check/stat remain unavailable due to the environment's Apple Git
launcher. Read-only Git objects verify committed dependencies; final native Git
review is left for local Terminal. No system tools were installed and no commit,
push, merge, rebase, reset or Git identity changes were performed.
