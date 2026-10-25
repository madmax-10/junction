# Agent 6 — Task 6.3: Similar community repair experiences

## Purpose and dependencies

`search_similar_repairs()` compares an authenticated owner's existing private
repair report with approved, published community Repair Post snapshots. It is a
read-only Django persistence/query service. No model, external API, embedding,
ADK wrapper or new search infrastructure is involved.

[Task 6.1](./repair_issue_service.py) creates the report and
[Task 6.2](./repair_diagnosis_service.py) stores supplied symptoms and preliminary
analysis. Both were inspected, together with their tests, the models, shared
authentication, public snapshot validation, publication flow, and existing
[Buyer](./buyer_search_service.py) and
[Valuation](./post_search_service.py) searches. No equivalent Repair search
existed. Those services and all teammate-owned files remain unchanged.

Before production edits, Python read Git's stored commit/tree/blob objects:
HEAD was `0a381a30abd20c6a984b62cb025ee64f7d1b17ee`, message `added authentic
diagnosis`. All three Task 6.2 files matched that commit byte for byte. This
verified the dependency without relying on the unavailable Apple Git launcher.

## Signature, inputs and authentication

```python
search_similar_repairs(repair_issue_id, limit=5, *, user=None)
```

`repair_issue_id` accepts an existing UUID or UUID string. `limit` must be a
Python integer from 1 through 10. Booleans, strings, floats, null, zero and
negative or excessive limits are rejected rather than coerced.

The keyword-only user follows Task 6.1/6.2's server-only contract. A JWT-authenticated
DRF caller supplies `request.user`. A future ADK wrapper must obtain it using
the existing [authenticated identity bridge](../auth.py); it must never accept
a model-generated user ID or client ownership claim. Missing identity returns
an error. The function checks the actual configured user class, authentication,
saved state, activity and current database existence/activity.

The [RepairIssue](../../issues/models.py) query filters simultaneously by issue
UUID, authenticated user and the related [UsedCar](../../vehicles/models.py)
owner. Only an authorized row is retrieved, including its car. Staff status
does not override either ownership requirement. Missing, malformed, foreign or
inconsistent references all return `Repair issue not found.` with no data or IDs.

## Public source selection

The [Post model](../../posts/models.py) has `issue_type`, `status`, `approved_at`,
`title`, `content`, a source UUID `issue_id`, and JSON `post_data`. The existing
[publication service](../../posts/services.py) validates the snapshot, sets
`status=published`, and records `approved_at`; approval alone is not publication.
There is no separate boolean approval flag or rejected-status workflow to invent.

Every candidate must satisfy:

- `issue_type=repair`;
- `status=published`;
- non-null `approved_at`;
- snapshot `owner_reported` exactly true, rechecked in Python.

Draft, approved-but-unpublished, archived, unknown-status, Buy and Sell posts are
excluded. Private RepairIssues are never a community search source. The service
never follows a public post's `issue_id` back to its private source report.

Only the post UUID, source UUID for the shared validation signature, public title
and snapshot are read. The source UUID is never returned. From the snapshot,
only `make`, `model`, `symptoms`, `method`, `work_performed` and `owner_reported`
are used. These are normalized by the existing
[public snapshot validator](../../posts/validation.py) with `publishing=True`.
Invalid selected fields exclude the candidate. Arbitrary extra snapshot keys
are ignored and never returned. No account, registered vehicle, AI analysis,
contact, photo, cost or mechanic identity is exposed. Content is not used.
The publication process is the authority that the title and selected snapshot
text are public; the search cannot independently detect personal data embedded
in approved free text.

## Explainable ranking

The private report's symptoms and preliminary analysis first pass the existing
RepairIssue serializer. Analysis is read and validated but excluded from ranking:
possible AI causes must not become reported observations. Invalid saved analysis
or symptoms returns a structured error instead of silently using malformed data.

The matching algorithm uses sets of lowercase ASCII letter/digit tokens of at
least three characters, minus a small fixed list of common words. It does not
stem words, understand synonyms, parse negation or reason about faults.

| Evidence of text overlap | Score |
| --- | --- |
| Saved symptom token in public title/symptoms | 6 per distinct token |
| Other original-description token in public title/symptoms | 2 per distinct token |
| Saved symptom/description token in owner-reported work | 1 per distinct token |
| Matching public vehicle make, case-insensitive exact match | 2 |
| Matching public vehicle model, case-insensitive exact match | 3 |

At least one problem/symptom/work keyword must overlap; matching make/model alone
is insufficient. Symptom and description contributions to problem matching are
deduplicated. An outcome token can additionally contribute its own small score.
The symptom weight lets two symptom overlaps outrank a single overlap with both
vehicle bonuses. Public and private `inferred` symptoms remain inferred in their
stored structures; their tokens are search hints, not confirmed causes.

The function examines at most the 500 newest eligible posts, ordered by creation
time descending and UUID ascending. It ranks that bounded candidate set by score
descending, then UUID ascending, and returns at most `limit`. The same stored
inputs give the same ordering. It reads only the first 4000 description characters;
the existing symptom validator already bounds structured symptom text. Neither
stored description nor symptoms are changed or truncated in the database.

This is intentionally approximate. Older relevant posts beyond the candidate
window can be missed. Singular/plural words can differ; negated phrases may
overlap; broad words can produce weak matches. Vehicle matches do not establish
part compatibility. The integer score is neither probability nor confidence,
and documented work is not proof that it fixed the same problem. There is no
invented compatibility, resolution status, historical experience or AI conclusion.

## Example and shared results

```python
result = search_similar_repairs(issue.id, limit=5, user=request.user)
```

An illustrative successful response uses the existing
[tool result envelope](../tools/result.py):

```json
{
  "status": "ok",
  "data": {
    "matches": [{
      "post_id": "<published-post-uuid>",
      "problem_summary": "Brakes grinding",
      "symptoms": {"confirmed": ["Brakes grinding"]},
      "vehicle": {"make": "Toyota", "model": "Camry"},
      "repair": {"method": "mechanic", "work_performed": "Owner reports pads replaced"},
      "reasons": ["Saved symptom keywords: brakes, grinding", "Matching public vehicle make.", "Matching public vehicle model."],
      "keyword_score": 17,
      "provenance": "community_owner_experience"
    }],
    "result_count": 1,
    "limitations": ["<fixed anecdote, overlap, safety and bounded-search cautions>"]
  },
  "ids": {"issue": {"type": "repair", "id": "<authorized-issue-uuid>"}, "post_ids": ["<published-post-uuid>"]},
  "provenance": "published_repair_posts",
  "error": null
}
```

Absent optional public symptoms, vehicle or repair fields yield empty dictionaries.
The public title supplies `problem_summary`; there is no generated summary.
With no matches, `status` is `no_results`, `matches` and `post_ids` are empty,
and `result_count` is zero. The authorized issue reference and the same caution
messages remain available. Nothing is fabricated to fill the list.

Failures use the shared `error` status, null data and empty IDs. Messages cover
authentication, generic issue lookup, invalid limit, invalid saved diagnosis data,
and database unavailability. Raw database exceptions and private attributes are
not returned. No entire Django ORM instance is returned.

## Privacy, safety and future integration

All database operations are SELECTs. The private report, vehicle, ownership,
status, analysis and actual resolution remain unchanged. No publications are
created or edited. The function has no network clients and calls no paid APIs.

Every response with search data explicitly calls results community owner anecdotes,
not verified mechanical diagnoses. It says keyword overlap does not establish the
same fault or compatibility, and does not establish driving safety, especially
with brake/steering trouble, fuel leaks, smoke/fire, severe overheating or sudden
power loss. Public symptom and work text are preserved after standard normalization.
These fixed cautions are not a generated triage decision and do not claim to
fact-check other owners' stories. A missing documented repair remains missing.

Later Google ADK integration may resolve trusted identity through the existing
bridge and invoke this synchronous function through the established
`sync_to_async(thread_sensitive=True)` pattern. The Repair Agent/Coordinator can
show the public source references and explain uncertainty; this task introduces
no wrapper, agent changes or safety escalation workflow.

## Tests and verification

Using the existing Python 3.12.15 environment, run from `backend/`:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_repair_search_service agent.tests.test_repair_issue_service agent.tests.test_repair_diagnosis_service issues.tests agent.tests.test_auth -v 1 --noinput
```

The focused file has 23 tests for public-only inclusion, ownership and identity,
strict UUID/limit validation, ranking and UUID ties, bounded reads, optional and
malformed fields, empty results, analysis uncertainty, safe results, source privacy,
network exclusion, database failures and no writes. Real isolated Django model
fixtures exercise ownership without mocking away authorization. Query capture
verifies SELECT-only behavior and a 500-row candidate bound; full row snapshots
verify no private issue, vehicle or Post mutations.

Final verification: **86 passed / 0 failed**, comprising 23 new tests, 18 Task 6.1
tests, 24 Task 6.2 tests and 21 existing issue/authentication tests. Django system
checks pass. New Python files have no editor diagnostics. AST checks verify syntax
and exactly one production function, with no nested or anonymous functions;
whitespace checks cover all three new task files. Python imports are exercised
by the Django suite. Read-only comparison of all 131 tracked files against HEAD
found no changes to existing tracked content. Only these three task files were written.

Native Git `status`, `diff --check` and `diff --stat` cannot run because this
environment's Apple Git launcher cannot locate developer tools. Read-only Git
object inspection verified the committed Task 6.2 dependency; local Terminal
review is still needed for native final status/diff output. No system tools or
dependencies were installed. No files were staged, committed, pushed, merged,
rebased or reset, and no teammate-owned code was modified.
