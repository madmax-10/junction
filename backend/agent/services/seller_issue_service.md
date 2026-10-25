# Agent 4 — Task 4.2: Private SellIssue persistence

## Purpose and prerequisite

`create_or_update_sell_issue()` records the owner's selling information privately
against an existing owned vehicle. It creates or updates one SellIssue through
existing Django services. It does not publish a listing, calculate a price,
search buyers or integrate Google ADK.

Before edits, Task 4.1's service, tests and documentation matched HEAD
`243705e8fe0abb7fbea7d54e7c474f475bdeabf6` on `Agent4(Sell)`. Read-only inspection
of Git commit/tree/blob objects verified that dependency despite the unavailable
native Git launcher. Task 4.1, Buyer Task 3.1, Repair Task 6.1, actual models,
serializers, shared authentication, publication helpers and related tests were
inspected. Only the three permitted Task 4.2 files were written.

## Function signature and inputs

```python
create_or_update_sell_issue(used_car_id, selling_details,
                           sell_issue_id=None, *, user=None)
```

Both identifiers use the actual UUID primary keys. Null/omitted `sell_issue_id`
means explicitly creating a new issue, following Buyer service conventions. A
non-null identifier always means updating that exact issue; an empty or invalid
identifier never falls back to creation. `selling_details` is a nonempty object
with only these writable fields:

| Field | Existing contract |
| --- | --- |
| description | Meaningful string required on create; optional on update; whitespace trimmed |
| asking_price | Optional Decimal, integer or decimal string; null permitted; finite and nonnegative; at most 12 digits, 2 decimal places |
| condition_details | Optional/null object with mechanical, exterior, interior, maintenance_history text, each up to 1000 characters |
| known_damage | Optional blankable string; no model maximum length |
| location | Optional blankable string, maximum 255 characters |
| contact_info | Optional/null private contact object with validated phone, email or link |

The [existing serializer](../../issues/serializers.py) and
[shared validators](../../common/validators.py) own normalization and constraints.
Phone is limited to 50 characters, email to 255, and link to 500 with an HTTP(S)
prefix. The service rejects unknown fields, including IDs, user/owner claims,
status, approval flags, arbitrary preferences/notes and unsupported currency.
It explicitly rejects nonstring outer text values to prevent serializer coercion.

Prices reject booleans, binary floats, blank strings, nonfinite values, negative
amounts, excess precision and overflow. No price is required before valuation;
zero is permitted by the existing model's nonnegative contract. Decimal-compatible
validation preserves cents without inventing a currency or generating a price.
JSON fields must serialize before optional entries can be normalized; sets,
objects, cycles, nonfinite values and unsupported structures fail safely.

No arbitrary length cap is added to model TextFields. Excessive text is rejected
where actual limits exist, such as location, nested condition disclosures and
contact fields. Description must be nonblank whenever supplied, and the serializer
also rejects invalid text such as null characters in ordinary text fields.

## Actual models and reuse

The [SellIssue model](../../issues/models.py) has UUID `id`, `user`, `used_car`,
description, optional Decimal asking_price, condition_details, known_damage,
location, private contact_info, status and timestamps. Its existing statuses are
`open` and `closed`; new records use `open`. The
[UsedCar model](../../vehicles/models.py) uses a required owner foreign key.

[issues.services.create_sell_issue](../../issues/services.py) persists a new
issue and rechecks vehicle ownership. The existing update helper applies only
validated supplied attributes. Both are reused. There is no duplicate INSERT
implementation, new model, schema migration or publication path.

## Trusted identity and ownership

Trusted server callers supply JWT-authenticated `request.user` or a user resolved
by the existing [ADK authentication bridge](../auth.py). No user ID or mutable
session claim from Gemini can authorize this service. As with Task 4.1 and Buyer,
the service checks the configured user class, authentication, active/saved state
and current active account existence. It does not create another JWT or session
authentication system.

The requested car is selected by UUID **and owner** under a transaction lock.
An update additionally selects the issue by its UUID, authenticated user and
that exact car. Thus even another car owned by the same person cannot silently
become the issue's vehicle. Staff has no override. Foreign, missing and malformed
vehicle references share one error; foreign, missing, malformed and mismatched
issue references share another. Private record existence is not disclosed.

The serializer's related-car queryset is also restricted to the verified car
and owner. Callers cannot set or change owner, user, issue identity or car
association through selling_details.

## Create and update examples

```python
created = create_or_update_sell_issue(
    owned_car_uuid,
    {"description": "Owner wants to sell the Camry", "known_damage": "Rear bumper scratch"},
    user=request.user,
)

updated = create_or_update_sell_issue(
    owned_car_uuid,
    {"asking_price": "12500.25"},
    sell_issue_id=created["data"]["id"],
    user=request.user,
)
```

Creates require description and use model defaults. Updates validate only
provided fields and preserve omitted attributes, including description, private
contacts and status. Explicit null clears nullable price/JSON fields; empty
strings can clear blankable location/damage. Description cannot be cleared.
Nested objects are replacements under the existing serializer/helper contract,
not implicit deep merges; include nested values intended to remain.

Existing issue workflow status is preserved, including closed. Inspection found
no separate finalized/withdrawn edit prohibition in the existing SellIssue update
flow; this task does not invent one or reopen records. Public Posts are stored
snapshots: [generate_post](../../posts/services.py) copies approved-schema data
into a separate draft, and publication is a distinct action. Private edits do
not automatically refresh drafts, approved posts or published listings. A test
verifies that an existing published snapshot and its approval remain byte-for-byte
unchanged when private price data changes. A later publication correction must
use the separate Post workflow and explicit user approval.

## Atomic flow and repeat behavior

```text
Trusted user + vehicle UUID + selling_details + optional issue UUID
    -> active saved account check
    -> validate UUID types/format
    -> atomic locked owned-car lookup
    -> for update: locked owned issue lookup matching that exact car
    -> strict allowlist/type/JSON checks
    -> existing SellIssueSerializer validation
    -> existing create or update helper
    -> shared private result envelope
```

For Django learners, the model defines storage, serializer validates incoming
fields, and service helper performs persistence. Authorization limits which
records can enter that process. The transaction keeps persistence and result
construction together, so expected failures after an INSERT/UPDATE roll back.

Identical normalized updates skip the helper and do not change timestamps or
create duplicates. Repeated explicit create calls make distinct issues, as in
the existing Buyer workflow; there is no idempotency key or uniqueness contract
to invent. Future callers should retain the returned ID and use updates rather
than replaying a successful create. Failed updates never create a fallback issue.

Row locks protect the selected car and issue on databases supporting them. The
current SQLite database does not provide row-lock semantics; this task adds no
new database infrastructure or unsupported concurrent-write guarantees.

## Results and error behavior

The existing [shared result envelope](../tools/result.py) is used:

```json
{
  "status": "ok",
  "data": {
    "action": "updated",
    "id": "<authorized sell issue UUID>",
    "used_car_id": "<owned vehicle UUID>",
    "description": "Owner wants to sell the Camry",
    "asking_price": "12500.25",
    "condition_details": null,
    "known_damage": "Rear bumper scratch",
    "location": "",
    "status": "open"
  },
  "ids": {"used_car_id": "<owned vehicle UUID>", "issue": {"type": "sell", "id": "<authorized sell issue UUID>"}},
  "provenance": "own_sell_issues",
  "error": null
}
```

Creation uses action `created`; updates use `updated`, including an identical
no-write update. UUIDs and Decimal prices use the existing JSON-safe string
representations. The response is an explicit private projection, not unrestricted
ORM serialization. It excludes contact_info, account identifiers and other users'
data even when private contacts were accepted and stored.

Errors use the same envelope with `status: error`, null data and empty IDs.
Messages are `Authentication is required.`, `Vehicle not found.`, `Sell issue
not found.`, `Invalid Sell issue input.` and `Unable to save Sell issue.`. Raw
exceptions, SQL, foreign contacts and private record details are not exposed.

## Privacy and later tasks

A SellIssue is an owner's private request, not a marketplace Post. This function
never creates, approves or publishes a Post, searches private BuyIssues, calls
Valuation, generates prices, contacts buyers or invokes external APIs. Optional
private contact storage is not publication approval and the response never echoes
it. Public listing creation remains with the teammate-owned Post Agent and its
separate approval flow.

[Task 4.1](./seller_vehicle_service.py) can first retrieve owned-car information;
this write independently rechecks current ownership. Future Task 4.3 may obtain
valuation evidence separately before an owner chooses an asking price. This
task neither calculates a price nor treats one as a guaranteed market value.
A future Seller ADK adapter must resolve trusted identity through the existing
bridge and call the synchronous service using the established thread-sensitive
async wrapper. No ADK integration or Coordinator change is included here.

## Tests and actual verification

From `backend/`, using the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_seller_issue_service agent.tests.test_seller_vehicle_service agent.tests.test_buy_issue_service agent.tests.test_auth vehicles.tests issues.tests -v 1 --noinput
```

Final result: **86 passed / 0 failed**: 25 Task 4.2 tests, 16 Task 4.1 regressions
and 45 existing Buyer/identity/vehicle/issue regressions. The initial run exposed
that the shared serializer accepts blank price as null; explicit blank-string
rejection was added to match Buyer validation and the complete selected suite
was rerun. Django system checks and editor diagnostics report no errors.

Real isolated ORM tests cover trusted identity, both ownership relationships,
vehicle mismatch, strict types/allowlists, price precision/bounds, actual text
limits, JSON validation, null clearing, omitted-value preservation, closed status,
unchanged published snapshots, idempotent updates and deliberate creates. Helper
failure and post-write result-failure tests prove atomic rollback for create and
update. Query capture proves only the intended SellIssue is written; snapshots
protect vehicles, accounts and foreign records. No public Post is created,
Valuation is asserted uncalled and external network connections are blocked.

Syntax, imports, whitespace and exactly-one-production-function checks cover the
three task files; the Django suite exercises imports. Existing tracked content
was inspected through stored Git objects for the dependency checkpoint, without
altering unrelated work. The final whole-repository comparison could not finish
because one referenced Git object was unavailable in loose-object storage;
therefore a final clean-worktree or complete tracked-diff claim is not made. Native
Git status/diff/check/stat remain unavailable due to the known Apple developer-tools
limitation. Final native review remains for local Terminal. No other files were
written, dependencies installed, or changes staged, committed, pushed, merged,
reset or rebased; Git identity was not changed.
