# Agent 4 — Task 4.1: Retrieve an owned vehicle

## Purpose and scope

`get_vehicle_details()` supplies the future Seller workflow with existing,
owner-authorized vehicle information. It does not create a selling request,
calculate a price, match buyers or publish a listing. The user confirmed Task
6.7 committed; no previous-agent dependency changes were required.

Only this document, [the service](./seller_vehicle_service.py) and its
[focused tests](../tests/test_seller_vehicle_service.py) are added. No model,
migration, authentication, shared infrastructure or existing agent is changed.

## Models and reuse inspection

The [UsedCar model](../../vehicles/models.py) has a UUID primary key, an `owner`
foreign key to the configured user model, `make`, `model`, `year`, `trim`,
`mileage`, `condition` and `created_at`. Trim and condition are blankable strings;
mileage is a required nonnegative integer. Missing optional text is represented
by an empty string, not an invented value. The model has no VIN, MSRP, accident
history or ownership-history field. Toyota vehicles are supported without
inventing a Toyota-only restriction absent from the existing model.

[Vehicle services](../../vehicles/services.py) provide create/update/delete
operations, not a trusted-user detail service. The existing
[private vehicle view](../../vehicles/views.py) uses an owner-scoped queryset.
The Coordinator already has a similarly named
[vehicle tool](../tools/coordinator_tools.py), with the desired seven-field
projection and `own_used_cars` provenance. However, its internal identity lookup
reads mutable `tool_context.state.user_id`. Calling it with an invented context
would not be a safe reuse of the project's verified identity bridge. It remains
untouched and is not the authorization boundary for this Seller service.

This service reuses the established trusted Django-user contract from
[Task 6.1](./repair_issue_service.py), [Task 6.2](./repair_diagnosis_service.py)
and [Buyer Task 3.1](./buy_issue_service.py), plus the existing
[shared result builders](../tools/result.py). It keeps the Coordinator's vehicle
projection and provenance conventions without copying its mutable-state trust.
There is no equivalent existing service with this trusted signature to delegate
to. No valuation, repair issue or seller issue is retrieved to assemble the result.

## Signature, authentication and authorization

```python
get_vehicle_details(used_car_id, *, user=None)
```

`used_car_id` is a UUID object or UUID string. Unsupported types, including
booleans, numbers, mappings and lists, are rejected before ORM lookup. Invalid
UUID strings also fail safely.

The keyword-only user must come from trusted server code: JWT-authenticated
`request.user` in DRF, or the existing
[get_authenticated_user bridge](../auth.py) in a future ADK adapter. Never derive
it from a Gemini-supplied ID, client ownership claim or mutable session field.
This is a service boundary, not a new authentication implementation or ADK tool.

Following existing private-service conventions, it requires an actual configured
Django user instance that is authenticated, active and saved, then checks current
active account existence in the database. Missing, anonymous, raw-ID, forged
context, unsaved, inactive or deleted identities fail. Trusted callers must still
obtain that user through the established boundary; arbitrary user objects from
client input are not an authentication mechanism.

The vehicle lookup filters by **both requested UUID and authenticated owner**.
No foreign car is loaded and inspected afterward. Staff status gives no override.
A changed owner is observed on the next call. Authorization is service-level
and does not rely on an agent instruction or UI restriction.

## Input and output example

```python
result = get_vehicle_details(vehicle_uuid, user=request.user)
```

The success envelope follows the existing repository contract:

```json
{
  "status": "ok",
  "data": {
    "id": "<authorized vehicle UUID>",
    "make": "Toyota",
    "model": "Camry",
    "year": 2021,
    "trim": "SE",
    "mileage": 45000,
    "condition": "Owner reports worn upholstery"
  },
  "ids": {"used_car_id": "<authorized vehicle UUID>"},
  "provenance": "own_used_cars",
  "error": null
}
```

The seven allowlisted fields are the actual stored attributes, not a generated
description or valuation. UUIDs become strings through the shared serializer;
year and mileage remain integers. Blank trim/condition remain empty strings and
zero mileage remains zero. Condition is not independently verified, interpreted
as an accident history or silently truncated. No timestamp, owner UUID, user
profile, contact data, credentials, issue details or complete ORM object is
returned. `values()` explicitly selects the allowed columns; unrestricted
`model_to_dict()` is not used.

## Errors and privacy

- Missing trusted identity: `Authentication is required.`
- Foreign, missing, malformed or unsupported vehicle ID: `Car not found.`
- Database failure: `Unable to retrieve vehicle details.`

All failures use the shared `error` envelope with null data and empty IDs. Lookup
errors preserve the existing vehicle tool's `own_used_cars` provenance. Authentication
and database failures use the shared default null provenance. No raw SQL, stack
trace, credentials or foreign-car existence is disclosed. Foreign, malformed and
missing references yield identical responses after the authentication check.

## Step-by-step runtime explanation

```text
Trusted authenticated user + requested vehicle UUID
    -> check real saved active user and current account existence
    -> reject unsupported identifier types; parse UUID
    -> SELECT allowlisted UsedCar fields WHERE id AND owner match
    -> no row? generic private lookup error
    -> shared JSON-safe success envelope with authorized vehicle ID
```

For Django learners, the `owner` filter implements row-level privacy for this
query; `values()` chooses which columns can leave the service. A normal successful
call uses two SELECT queries, one for the active account and one for the vehicle.
No transaction or row lock is required for this read-only lookup. It makes no
create/update/delete calls, no selling decisions and no external requests.

Task 4.2 may use the returned authorized vehicle reference and stored attributes
to collect selling preferences in its separate scope. This task creates no
SellIssue and does not claim that the owner has approved a listing. Any later
write must independently recheck ownership; this read is not a transferable
authorization token.

A future Google ADK Seller adapter should resolve the user with the existing
bridge and invoke this synchronous function through the repository's
`sync_to_async(thread_sensitive=True)` convention. This task adds no adapter,
agent factory, Coordinator registration or frontend wiring.

## Actual tests and verification

Run from `backend/` using the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_seller_vehicle_service vehicles.tests agent.tests.test_auth agent.tests.test_repair_issue_service agent.tests.test_repair_diagnosis_service agent.tests.test_buy_issue_service -v 1 --noinput
```

**100 passed / 0 failed**, comprising 16 new focused Seller tests and 84 selected
vehicle/authentication/Repair/Buyer private-service regressions. No full-project
suite was needed. Django system checks and editor diagnostics report no errors.

Tests use actual isolated users and vehicle records. Coverage includes stored
attributes, UUID objects/strings, unsupported and boolean identifiers, identical
private lookup errors, inactive/deleted/unsaved/anonymous identities, staff denial,
owner changes, blank optional fields, zero mileage, field allowlisting, unrelated
issue privacy, query scope, database errors and absence of invented Toyota-only
constraints. Query capture proves SELECT-only execution and no reads of private
issue/Post tables. Record snapshots prove preservation; no SellIssue or Post is
created. Network connections and model generation are asserted uncalled.

Python syntax, one-production-function and whitespace checks cover all three
task files; Django execution verifies imports. Existing tracked content is
compared against stored Git objects: 146 tracked files were checked, and unrelated
differences were present in `backend/agent/runner.py` and
`backend/agent/prompts/coordinator.py`. This task did not edit either file; those
changes are preserved for their owner's review. The comparison therefore cannot
claim a clean overall worktree. Native Git status/diff/check/stat remain
unavailable due to the known Apple developer-tools issue; final native Git
review is left for local Terminal. No system tools or dependencies are installed,
and no files are staged, committed, pushed, merged, rebased or reset.
