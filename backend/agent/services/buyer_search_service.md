# Agent 3, Task 3.2 — Search and rank public used-car listings

## Purpose, repository and scope

[`search_and_rank_used()`](./buyer_search_service.py) reads the authenticated
buyer's saved private request and returns matching **published Sell posts**.
It does not create issues, publish posts, retrieve private seller information,
calculate value ranges, call models, or implement an ADK wrapper.

Work began on `Agent3(Buyer)` with a clean worktree. Task 3.1 was committed in
`8cfe72d`, and all 18 of its focused tests passed before implementation.
The actual database configuration is **SQLite**, although PostgreSQL remains
the target architecture. Only the three Task 3.2 files are added.

## Service signature and authentication

```python
search_and_rank_used(buy_issue_id, limit=5, *, user)
```

As in Task 3.1, `user` is a keyword-only **server-supplied Django user object**,
not a model-generated ID. DRF callers use JWT-authenticated identity; a future
ADK wrapper must use the existing [`get_authenticated_user`](../auth.py) bridge.
This synchronous service must run through `sync_to_async(thread_sensitive=True)`
when called from an async wrapper.

Saved active user identity is rechecked against Django. Issue retrieval filters
both UUID and owner. Foreign, malformed and missing issue IDs produce the same
generic error with no private data or IDs. No client history or editable session
field alone grants authorization. `limit` must be an integer from **1 to 50**;
booleans, fractions, numeric strings, null and larger values are rejected.
There was no existing ranked-search limit policy; this is an explicit bounded
service policy, not a hidden truncation of candidates.

## Dependencies and existing logic reuse

- [`BuyIssue`](../../issues/models.py) stores private budgets and preferences.
- Task 3.1's existing [`BuyIssueSerializer`](../../issues/serializers.py) revalidates
  the persisted description, effective budget range, model precision and
  preferences using the shared normalizer. It is never saved by this search.
- [`validate_model_year`](../../common/validators.py) checks listing years, and
  DRF's existing `DecimalField` checks money with the project's 12-digit,
  two-decimal, nonnegative rules.
- [`Post`](../../posts/models.py) and its enums define published public inventory.
- [`tool_result` / `error_result`](../tools/result.py) supply the existing envelope
  and exact Decimal-to-string serialization.

Task 2.2's [`search_comparable_posts()`](./post_search_service.py) was inspected
but is not a generic buyer search: it requires one make/model and explicit
year/mileage ranges, materializes the whole result, and discards synthetic
rows. Buyer needs can omit those constraints or include several makes/models,
and explicit synthetic provenance must remain visible. Calling it would require
inventing ranges or silently dropping data. Its public-field validation is
inline rather than an exported helper; the new function therefore uses existing
shared validators and the same published-only boundary without modifying or
copying the valuation implementation. The generic browse `PostFilter` was also
unsuitable: substring make/model matching and float price casts do not satisfy
exact buyer matching and safe Decimal comparisons of malformed JSON prices.

## Saved criteria and hard filters

Preferences originate in Task 3.1; raw chat text is not searched as if it were a
validated preference. Persisted data is checked again before inventory queries.
Unknown/malformed preferences or invalid budgets return `error`, rather than
being ignored to broaden the search.

| Saved field | Exact semantics |
| --- | --- |
| `min_budget`, `max_budget` | Inclusive Decimal asking-price bounds. Null means unconstrained. |
| `preferred_makes` | Exact case-insensitive membership; OR within the list. |
| `preferred_models` | Exact case-insensitive membership; OR within the list, AND with makes. The saved format does not encode make/model pairs. |
| `minimum_year` | Inclusive lower model-year bound. There is no supported `maximum_year`; supplying one is rejected by the existing schema. |
| `maximum_mileage` | Inclusive upper mileage bound. |
| `location` | Case-insensitive substring in public location, matching existing browse semantics; not geocoding or a radius search. Missing/nonstring locations cannot satisfy it. |
| `vehicle_type` | `used` or omitted permits used posts; `new` returns no used results. No catalog search occurs. |
| `fuel_type` | The Buy schema supports it, but approved Sell `post_data` does not. A nonblank fuel requirement returns a clear error rather than being silently ignored. |

All matching rows must have nonblank make/model, valid integer model year,
nonnegative integer mileage, and explicit valid asking price. Missing or
malformed fields exclude a listing, including boolean numbers and nonfinite,
negative, oversized or excess-precision money. Published JSON money may be an
integer/float; it is converted with `Decimal(str(value))` and validated, never
compared using binary floating-point arithmetic. Zero is allowed by the existing
schema. Optional public trim/location strings are returned when present; other
raw JSON content, contacts and owner/issue details are not exposed.

## Query, ranking and limit flow

1. Authenticate the server context and retrieve the owned issue.
2. Validate limit and saved criteria using the existing serializer/schema.
3. Query only `Post.IssueType.SELL` and `Post.Status.PUBLISHED`, applying
   supported make/model/year/mileage/location SQL filters before iteration.
4. Stream only post ID and public snapshot in chunks of 200. No private Sell
   issues or registered cars are queried. Price casts are deliberately not used
   in SQL: invalid JSON price text can otherwise fail a PostgreSQL query.
5. Validate each snapshot and apply every hard constraint, including Decimal
   budgets, **before** it enters ranking. SQL matches are checked again in Python.
6. Order eligible rows by **asking price ascending, year descending, mileage
   ascending, then post UUID ascending**. This is a simple display policy, not
   an invented relevance score, appraisal or claim of best value.
7. Maintain the exact global best `limit` rows via a bounded sorted list. This
   has the same result as filtering/ranking all candidates then limiting; later
   better matches can replace earlier ones. No SQL LIMIT or arbitrary scan cap
   discards candidates before ranking. Ranking memory is bounded by limit.
8. Return matches, evidence-based reasons, count and IDs in the shared envelope.

This avoids materializing an unbounded result list, but broad queries can still
scan many database-filtered public candidates. Guaranteed global ranking cannot
use an arbitrary early scan cutoff. JSON indexes/extracted numeric columns,
pagination and large-scale optimization remain future shared-service work.

## Output and match reasons

```python
{
    "status": "ok",  # or no_results; invalid requests use shared error envelope
    "data": {
        "matches": [{
            "post_id": "<published-post-uuid>",
            "vehicle": {"make": "Toyota", "model": "Camry", "year": 2020,
                        "mileage": 40000, "location": "Austin, TX"},
            "asking_price": "12000.00",
            "reasons": ["Published Sell post with an explicit valid asking price.",
                        "Make Toyota matches a saved choice.",
                        "Asking price 12000.00 meets maximum budget 15000.00."],
            "synthetic_flags": {},
            "provenance": "published_sell_post_unverified",
        }],
        "result_count": 1,
        "limitations": ["..."],
    },
    "ids": {"issue": {"type": "buy", "id": "<owned-buy-uuid>"},
            "post_ids": ["<published-post-uuid>"]},
    "provenance": "published_sell_posts",
    "error": None,
}
```

Example prices are synthetic teaching data, not real market claims. Reasons
state only checks actually established from saved criteria and approved public
facts. No unsupported fuel/condition match, verified stock, dealership contact,
or private seller claim is generated. A valid search without eligible matches
returns `no_results`, `matches=[]`, `result_count=0`, and an empty `post_ids` list.
`result_count` counts returned recommendations, not all possible matches.

## Synthetic provenance and privacy

Existing explicit boolean `synthetic`/`is_synthetic` flags are copied into each
result's `synthetic_flags`. A true flag produces `provenance="synthetic_demo"`
and a visible demo-only reason. Unmarked rows are labeled **unverified**, never
assumed genuine. Search does not invent another stored marker.

Normal Post publication validation currently rejects these marker keys; test
fixtures directly insert marked rows to exercise defensive handling. This is
a documented shared publication limitation, not a claim that genuine provenance
has been verified. No publication validator is changed.

Only explicitly projected public vehicle facts and price are returned. Neither
the post's private logical issue association nor the seller's profile, contact,
private car record or issue description is read to enrich results. Published
snapshots are not refreshed from later private edits.

## Coordinator workflow and deferred integration

Coordinator confirms needs → Task 3.1 saves the owned Buy issue → a future Buyer
tool resolves trusted identity → this service searches by issue ID → the shared
result returns to Coordinator/Buyer for explanation. An issue ID restored from
chat remains context, not authorization; ownership is checked on every call.
The eventual Buyer ADK agent can consume these results without doing its own
ranking. This task creates no wrapper, API endpoint, publication flow, catalog
recommendations, contact lookup or paid API integration.

## Tests and verification

The focused tests use synthetic isolated Django records and cover saved-issue
integration, authorization, budgets, make/model, year/mileage/location, combined
filters, deterministic ties and global limiting, malformed data, unsupported
criteria, private inventory exclusion, provenance, reasons, read-only SQL and
safe errors. Existing Task 3.1 tests are also run as regressions.

From `backend/`, use the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_buyer_search_service agent.tests.test_buy_issue_service -v 1 --noinput
```

The active database is SQLite; these tests do not certify PostgreSQL behavior.
Both SQL and Python case matching depend in part on database collation for
non-ASCII values. No real production inventory, Gemini or external API is used.

Actual verification: **23 Task 3.2 tests plus 18 Task 3.1 regression tests passed
(41 total), 0 failed** using Python 3.12.15. Django reported no system-check
issues, the new function imported successfully, and editor diagnostics reported
no errors. Git diff/status checks showed exactly the three new task files and
no unrelated modifications. `git diff --check` passed; new untracked content
was also reviewed with `git diff --no-index`. The production module defines
exactly one function. No files were staged or committed.
