# Task 2.4 — Calculate a preliminary vehicle value range

## Purpose and inspected boundaries

[`calculate_value_range()`](./value_range_service.py) connects the existing
public-post search, catalog lookup, and deterministic calculation. It does not
implement an ADK agent, modify a record, or write session state. Tasks 2.1–2.3
were committed and the worktree was clean before this task (latest catalog
commit `962130c`).

The architecture names a tool `calculate_value_range(used_car_id, comparable_ids)`.
The actual service requires an additional **server-supplied authenticated user**:

```python
calculate_value_range(used_car_id, comparable_ids, *, user=request.user)
```

That keyword-only argument is not a future model-generated tool parameter. No
arbitrary user ID, owner ID, or authorization flag is accepted. The future tool
wrapper must bind it from the authenticated server context.

## Ownership and privacy

The current vehicle services implement CRUD but have no owned-vehicle getter.
This function follows the existing [`UsedCarDetailView` owner-scoped
query](../../vehicles/views.py): query `UsedCar` by both primary key and trusted
`owner=user`. Missing, malformed, foreign-owned, anonymous, and inactive requests
all return the same `error_result("Vehicle not found.")` with no data or IDs.
Catalog and comparable lookups do not run for rejected vehicle requests. Staff
status does not grant access to another owner's car.

Comparable reads use only published `Post` snapshots. The service never joins
private Sell issues, looks up another user's private registered vehicle, or
returns contacts, post bodies, owner identities, private condition, or issue IDs.
The successful response contains only the requesting owner's car ID, eligible
public post IDs, aggregate asking-price statistics, and catalog context.

## Existing functions reused

| Function | Existing signature / result |
| --- | --- |
| [`search_comparable_posts`](./post_search_service.py) | `(make, model, year_range, mileage_range, location=None)` → `{status, comparables, limitations}`; each comparable has string `post_id` and Decimal `asking_price`. |
| [`get_catalog_reference`](./catalog_service.py) | `(make, model, year, trim=None)` → `{status, msrp_reference, limitations}`; never picks an ambiguous catalog row. |
| [`estimate`](./valuation_service.py) | `(comparables, msrp_reference=None)` → preliminary low/median/high, sample size, eligible IDs, asking-price basis and limitations. |
| [`tool_result` / `error_result`](../tools/result.py) | Existing shared JSON-safe envelope; Decimal values become exact strings, not floats. |

The frozen [`agent contracts`](../contracts.md) require outer `ok` when estimate
returns inner `completed`, and outer `insufficient_data` otherwise. This task
uses that mapping without changing the contract or any previous service.

## Comparable ID validation and runtime flow

1. Authenticate the service context and resolve the owner-scoped vehicle.
2. Require a list or tuple of comparable identifiers. Invalid collection shape
   raises `ValueError` only after ownership succeeds.
3. Accept string/UUID post identifiers, canonicalize them as UUID strings, and
   deduplicate in first-requested order. Malformed elements are excluded.
4. Query only the selected IDs that are published Sell posts with the subject's
   exact make/model, case-insensitively. Read only public `post_data`.
5. Derive inclusive minimum/maximum year and mileage from selected snapshots
   with integer year and nonnegative integer mileage (booleans excluded).
   These bounds describe the selected evidence; they are **not** tolerances or
   personalized adjustments around the subject vehicle.
6. Reuse the existing comparable search with those bounds. It excludes missing
   or malformed fields, invalid prices, and explicit `synthetic: true` or
   `is_synthetic: true`. Intersect its output with the selected ID set again, so
   other marketplace posts cannot be silently added to the valuation. Preserve
   requested order for eligible IDs.
7. Look up catalog MSRP using the subject's make/model/exact year and trim if
   present. Missing or ambiguous catalog context does not block asking-price
   calculations; the catalog limitations are retained.
8. Pass eligible comparable records and separate MSRP reference to `estimate()`.
   Append catalog and evidence limitations. Excluded inputs get one generic
   explanation, not per-ID reasons that could reveal private post existence.
9. Return the existing shared envelope, with no session or database write.

## Inputs, output and synthetic example

For an owned Toyota Camry and three selected published Camry fixtures asking
`10000.00`, `12000.00`, and `15000.00`, the response is shaped as:

```python
{
    "status": "ok",
    "data": {
        "status": "completed",
        "low": "10000.00", "median": "12000.00", "high": "15000.00",
        "sample_size": 3, "price_basis": "asking",
        "comparable_post_ids": ["eligible-post-a", "eligible-post-b", "eligible-post-c"],
        "msrp_reference": None,  # or Task 2.3's catalog object with decimal strings
        "limitations": ["..."],
    },
    "ids": {"used_car_id": "owned-car-id", "post_ids": ["eligible-post-a", "..."]},
    "provenance": "published_sell_posts",
    "error": None,
}
```

The identifiers above are explanatory placeholders; real inputs/outputs use
UUIDs. All example prices and test records are synthetic fixtures, not genuine
market claims. Tests write only to Django's isolated temporary database.

If fewer than three eligible distinct comparables remain, the existing estimator
returns `insufficient_data`, with null low/median/high, actual sample size, and
eligible identifiers. MSRP may still be present but never supplies a numeric
used-car range. Missing catalog records likewise do not erase valid comparables.

## MSRP separation and Coordinator handoff

MSRP is a manufacturer's suggested/catalog reference, not a confirmed dealer
offer, completed sale, or current used-car value. The estimator preserves it as
context but does not use it in min/median/max arithmetic. The catalog's stored
Decimal and calculated Decimal values are serialized by the existing shared
helper only after calculation.

The future Coordinator receives this envelope and can consume `data` as the
valuation and `ids.used_car_id` as its vehicle binding, then pass the valuation
to Seller. No ADK state is read or written here; specialists are not invoked and
there is no direct Valuation-to-Seller call.

## Known limitations — quality improvements remain deferred

- The ID-only interface does not contain the original search's year/mileage
  bounds or location. The service rechecks publication, make/model, field types,
  asking prices, and explicit synthetic markers, but cannot reconstruct an
  earlier selection policy. It does not invent a subject-relative tolerance or
  assert that every selected year/mileage is equally representative.
- The reused search can scan additional matching public posts within the
  selected bounds; the final ID intersection prevents their inclusion. A future
  shared ID-scoped search interface could reduce that work, but this task leaves
  Task 2.2 unchanged.
- Synthetic flags are recognized by search but rejected by normal publication
  validation's permitted fields. Absence of a flag does not prove authenticity.
- Publication status is the existing public-access gate; private issue data is
  never used to refresh or supplement approved snapshots.
- Condition, trim, damage, location, outliers, currency consistency and market
  changes are not personalized or statistically adjusted. Task 2.1B is deferred.
- The result is an observed asking-price distribution, not a guaranteed sale
  value or confidence interval. Data can change between separate read queries;
  this service does not lock listings or reserve prices.

## Verification

From `backend/`, use the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_value_range_service -v 1 --noinput
```

Focused cases cover ownership/privacy, the real estimator, separate MSRP,
unavailable catalog, all nonpublic post statuses, other post types, invalid
snapshots and prices, explicit synthetic flags, wrong make/model, unselected
posts, duplicate/missing/malformed IDs, insufficient samples and read-only SQL.

Verification attempt: the 14 focused tests and the Django import check are
**blocked before discovery/setup** by `ModuleNotFoundError: No module named
'dotenv'`. Current settings import `load_dotenv`; current requirements already
declare `python-dotenv==1.2.4`, but it is absent from the specified Python 3.12
environment. No package was installed, no settings were changed, and no passing
tests are claimed. Editor diagnostics report no errors but are not runtime
verification. Git review shows exactly the three new Task 2.4 files and no
changes to the earlier services. Runtime verification remains required once the
existing environment satisfies the team's declared dependencies.
