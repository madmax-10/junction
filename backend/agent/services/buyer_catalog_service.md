# Agent 3, Task 3.3 — New-car catalog matching

## Purpose and Git checkpoint

[`search_new_catalog()`](./buyer_catalog_service.py) searches the existing
admin-managed catalog using the authenticated buyer's saved requirements. These
are **catalog recommendations, not dealership inventory**. Nothing is generated
by Gemini, and no dealer prices, availability, contacts or specifications are
invented.

Before edits, the branch was `Agent3(Buyer)`, the worktree was clean, and Task
3.2's three files were committed in `7a091b9`. Only the three new Task 3.3 files
are added. Tasks 3.1, 3.2, Agent 2 and all teammate-owned code remain unchanged.

## Exact interface and trusted identity

```python
search_new_catalog(buy_issue_id, limit=5, *, user)
```

`buy_issue_id` must identify the caller's own private Buy issue. `user` is a
keyword-only server-supplied Django user, using the existing Task 3.1/3.2 service
convention. A future tool must resolve this user through the existing
[`get_authenticated_user()`](../auth.py) bridge; a DRF caller uses verified JWT
identity. Model-provided user IDs and chat state alone do not authorize access.
This synchronous service needs `sync_to_async(thread_sensitive=True)` in a
future async wrapper. No ADK wrapper is added here.

The user must be saved, authenticated, active, and still active in the database.
Issue queries include both UUID and owner. Missing, malformed and foreign IDs
return the same generic error without private issue content or record IDs.
The `limit` policy matches Task 3.2: integer **1–50**, default **5**; booleans,
fractions, strings, null, zero, negative and larger limits are rejected.

## Actual models and dependencies

[`BuyIssue`](../../issues/models.py) stores description, optional Decimal budgets,
and JSON preferences saved by Task 3.1. The existing
[`BuyIssueSerializer`](../../issues/serializers.py) revalidates these persisted
criteria without saving anything. This checks unknown keys, year and preference
types, budget precision and finite/nonnegative values, and effective min/max.

[`NewCar`](../../vehicles/models.py), table `new_cars`, has UUID ID, admin owner,
make, model, year, trim, nullable `DecimalField(12,2)` MSRP, and creation time.
There is a make/model/year index and year-minimum/nonnegative-MSRP constraints,
but **no uniqueness constraint** for variants. There is no mileage, location,
fuel specification, dealership, inventory status or currency field.

Catalog rows are validated with the existing
[`NewCarSerializer`](../../vehicles/serializers.py), reusing name/trim cleaning,
shared model-year validation and precise nonnegative Decimal-field validation.
Only catalog ID and vehicle/MSRP fields are queried; owner profiles are not
joined. The existing [`tool_result()`](../tools/result.py) supplies the shared
`{status, data, ids, provenance, error}` envelope and exact Decimal string output.

## Supported and unsupported hard requirements

| Saved criterion | Behavior |
| --- | --- |
| `preferred_makes` | Exact case-insensitive matches; OR within list. |
| `preferred_models` | Exact case-insensitive matches; OR within list and AND with makes. No invented make/model-pair relationship. |
| `minimum_year` | Inclusive lower bound. |
| `min_budget`, `max_budget` | Inclusive Decimal **MSRP reference** bounds, never a guarantee of the final dealer price. |
| `vehicle_type` | `new` or omitted searches catalog. `used` returns no catalog results and explains why, without running a catalog search. |
| `maximum_mileage`, `location`, `fuel_type` | Valid Buy-schema fields but not evaluable from `NewCar`; a catalog request containing one returns a safe explicit error. No used-car mileage filter is imposed and no hard requirement is silently ignored. |
| `maximum_year`, preferred trim, condition | Not supported by the saved Buy preference schema. Unknown keys are rejected rather than inferred from description or added to the schema. |

Although catalog records have a trim field, there is no saved trim preference
to filter against. All matching variants remain separate recommendations.
Missing/nonfinite/negative/malformed MSRP is never used for price filtering.
Missing MSRP can be returned as null only if neither budget bound is set. Zero
is a legitimate stored value under the existing model; it is not treated as null.

## Database lookup and deterministic ranking

1. Check authenticated user, owner-scoped Buy issue UUID and bounded limit.
2. Validate saved JSON and existing serializer criteria before catalog access.
3. For `used` requests return an explained empty result. For catalog requests,
   reject unsupported hard criteria before querying catalog records.
4. Query `NewCar` with supported SQL make/model/year/MSRP filters. Native Decimal
   fields allow budget filtering in SQL, unlike Task 3.2's untrusted JSON prices.
5. Stream projected records in chunks of 200; validate each catalog row. Check
   hard constraints before ranking and do not save serializer instances.
6. Rank **known MSRP before unknown; MSRP ascending; year descending; UUID
   ascending**. Unknown MSRP never sorts as a real zero price. This is a display
   policy, not an AI score or personalized financial recommendation.
7. Maintain the exact global best `limit` records in a bounded sorted list.
   There is no early SQL LIMIT before validation, or arbitrary scan cutoff that
   would exclude a later better record. Broad queries may still scan many rows.
8. Return results with factual reasons, separate IDs and catalog-only provenance.

## Variants and Agent 2 reuse decision

Agent 2's [`get_catalog_reference()`](./catalog_service.py) was inspected. It
answers a different question: find **one unambiguous MSRP** for an exact vehicle,
returning ambiguity when multiple rows match. Calling it for every broad buyer
match would add redundant queries and suppress valid variants or duplicate IDs.
This task therefore does not call or reimplement that exact-lookup workflow.

Instead each returned recommendation preserves the same catalog identity and
reference fields used in Task 2.3 (`catalog_id`, make/model/year/trim, Decimal
`msrp`, `price_basis="catalog_msrp"`), plus reasons and provenance. Distinct rows
are not merged or averaged, including duplicate exact records. If a limit cuts
off variants, it uses the explicit ranking and stable UUID tie-breaker, not an
arbitrary default trim. No claim is made that the selected trim is preferred.

## Output, example and MSRP honesty

For a synthetic Toyota Camry catalog fixture with MSRP `30000.25` and a saved
MSRP budget cap of `35000.00`, the result is shaped as:

```python
{
    "status": "ok",
    "data": {
        "matches": [{
            "catalog_id": "<catalog-uuid>", "make": "Toyota", "model": "Camry",
            "year": 2024, "trim": "SE", "msrp": "30000.25",
            "price_basis": "catalog_msrp", "provenance": "new_cars_catalog",
            "reasons": ["Admin-managed catalog entry only; dealer price and availability are not verified.",
                        "MSRP 30000.25 meets maximum reference-price budget 35000.00."],
        }],
        "result_count": 1, "limitations": ["..."],
    },
    "ids": {"issue": {"type": "buy", "id": "<owned-buy-uuid>"},
            "catalog_ids": ["<catalog-uuid>"]},
    "provenance": "new_cars_catalog", "error": None,
}
```

These are teaching fixtures, not a real manufacturer's price claim. MSRP means
manufacturer's suggested/catalog reference price: not a dealer quote,
out-the-door price, guaranteed purchase price or proof that a car is available.
Budget reasons explicitly refer to **reference prices**. Null MSRP is labeled
unavailable with no inferred number. Serialization preserves Decimal precision;
`result_count` counts returned recommendations, not all possible catalog rows.

## Errors, empty results and privacy

Valid empty/no-match searches return `no_results`, empty matches/catalog IDs,
count zero and honest limitations. Unsupported hard criteria, invalid saved
preferences, invalid limits or authentication/ownership failures return existing
generic error envelopes, never fallback cars. Malformed catalog rows are skipped
through serializer validation. If a database driver cannot decode corrupt native
Decimal data before row validation, return a generic unavailable error rather
than expose SQL or fake an empty catalog.

No Buy issue, catalog record, private registered car, Sell issue or Post is
created/updated. There are no private seller/profile joins, contact output or
other users' issue reads. Catalog authenticity/freshness is not independently
verified. The model contains no synthetic-data indicator, so test catalog
fixtures are clearly synthetic, while production lookup makes no verified
manufacturer/dealer claim beyond reading existing catalog data.

## Coordinator/Buyer workflow and known limits

Coordinator confirms needs → Task 3.1 saves the owned request → a future Buyer
tool resolves trusted identity → this service matches catalog records → the
structured result returns to the Buyer/Coordinator for an honest explanation.
Saved IDs are context, not authorization. No new Coordinator registration,
endpoint, ADK wrapper, model call or dealer integration is included.

Task 3.2 searches published used-car Sell snapshots; Task 3.3 searches typed
admin catalog records and compares **MSRP**, not asking prices. They share the
existing auth/issue/error conventions, result structure and bounded deterministic
ranking pattern, but neither is called to pretend the other data source exists.

Currency, regional pricing, options, incentives, taxes, condition, dealer stock,
maximum-year/trim preferences, deduplication and price freshness remain outside
this task. SQLite is the current configuration; tests do not certify PostgreSQL
deployment. Non-ASCII case matching remains dependent on database collation.

## Focused tests and regressions

Use the existing Python 3.12 environment from `backend/`:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_buyer_catalog_service agent.tests.test_buy_issue_service agent.tests.test_buyer_search_service -v 1 --noinput
```

Tests use isolated synthetic records, cover authorization, filters, variants,
ranking/limits, missing/invalid money, fail-closed criteria, honest reasons,
private-data exclusion, read-only SQL and JSON-safe provenance. For invalid
native numeric values normally prevented by model constraints, tests inject
reader rows while still exercising the real catalog serializer; no production
catalog records or model constraints are changed.

Actual results: **28 Task 3.3 tests, 18 Task 3.1 tests and 23 Task 3.2 tests
passed (69 total), 0 failed**, using the existing Python 3.12.15 environment.
Django reported no system-check issues; the new service imports successfully,
and editor diagnostics report no errors. Git status shows only the three new
Task 3.3 files; no previous-task or teammate changes were made. Diff checks and
untracked-file content/whitespace review passed. The production module defines
exactly one function. Nothing was staged, committed or installed.
