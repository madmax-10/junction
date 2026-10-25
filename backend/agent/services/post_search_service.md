# Comparable Post Search

## Purpose

[`search_comparable_posts()`](./post_search_service.py) retrieves public market
evidence for Vehicle Valuation Agent 2. It searches published Sell posts and
returns their approved vehicle snapshot and asking price. It does not calculate
a valuation, adjust prices, call Gemini, or call an external API.

## Actual Django model and data

The function uses [`posts.models.Post`](../../posts/models.py). The model stores
the approved public snapshot in `post_data`. A record is eligible only when
`issue_type` is `sell`, `status` is `published`, and the snapshot has matching
make, model, year, mileage, and a valid asking price. The Sell issue and
registered `UsedCar` are not queried, so private issue data is not exposed.

## Inputs and output

```python
search_comparable_posts(
    "Toyota", "Camry", (2018, 2022), (20000, 60000), "Austin"
)
```

Year and mileage ranges must each be a two-item list or tuple containing Python
integers. Booleans, floats (including `2018.0`), `Decimal` values, numeric strings,
missing values, and malformed containers raise `ValueError` before any database
query. Lower bounds cannot exceed upper bounds; mileage must be nonnegative.
Equal bounds are valid. No `int()` coercion or fractional truncation is performed.

Year and mileage bounds are inclusive and have no hidden tolerance. Make and
model are case-insensitive. Location, when provided, is a case-insensitive
substring match against public `post_data["location"]`. Invalid arguments raise
`ValueError` rather than silently changing the search.

The result is:

```python
{
    "status": "completed",  # or "no_results"
    "comparables": [
        {
            "post_id": "...",
            "asking_price": Decimal("18000.00"),
            "make": "Toyota",
            "model": "Camry",
            "year": 2020,
            "mileage": 40000,
            "trim": "SE",              # when public
            "condition_details": {...}, # when public
            "known_damage": "...",     # when public
            "location": "Austin, TX",  # when public
        }
    ],
    "limitations": [...],
}
```

The `comparables` list is directly consumable by Task 2.1's
[`estimate()`](./valuation_service.py). Prices remain `Decimal`; a later JSON
or ADK boundary must serialize them explicitly. Empty results return
`status="no_results"` and an empty list without fabricated records.

## Database query flow

1. Validate the arguments and inclusive ranges.
2. Query `Post.objects.filter(...)` for Sell and Published posts.
3. Apply make, model, year, mileage, and optional location filters in the
   database before iterating over rows.
4. Read only `id` and `post_data` from candidate rows.
5. Validate JSON snapshot fields again in Python because malformed JSON values
   must not become market evidence.
6. Exclude missing, negative, nonfinite, or malformed asking prices.
7. Exclude explicit `{"synthetic": true}` and `{"is_synthetic": true}` rows.

The current schema has no dedicated synthetic-data column. Search recognizes
only the existing boolean `synthetic` and `is_synthetic` keys when set to `true`;
no additional marker is introduced.

There is a publication limitation: [`SELL_KEYS` and
`normalize_post_data()`](../../posts/validation.py) do not permit either key.
Normal draft/publication validation rejects them as unknown fields, rather than
preserving them. Search can exclude marked rows already stored by another path,
but that does not make this an end-to-end synthetic-data policy. The synthetic
exclusion tests insert isolated rows directly through the ORM, bypassing that
publication validator. A missing flag does **not** establish that a listing is
genuine. Unmarked demo data cannot be distinguished reliably; publication and
source provenance need a future team-approved solution. The teammate-owned
model and publication validator are unchanged.

## Example

Given published snapshots for a 2020 Camry at $18,000 in Austin, a 2019 Camry
at $16,500 in Austin, a Honda Civic, and a Camry draft, a Toyota Camry search
for 2018–2022 and 20,000–60,000 miles in Austin returns only the two published
Camry records. The Honda fails make/model, and the draft fails publication
status.

Task 2.1 then decides whether those records are sufficient. With its current
provisional minimum of three distinct comparables, two records produce
`insufficient_data`; this search function does not calculate that result.

## Updated five-line architecture

1. Published Sell posts are the only cross-user source of used-car market evidence.
2. `search_comparable_posts()` filters approved public `post_data` in Django before returning records.
3. The search returns asking prices and vehicle facts but performs no valuation or price adjustment.
4. Task 2.1's `estimate()` consumes the returned comparables and performs deterministic Decimal arithmetic.
5. The Coordinator will eventually pass the valuation result to Seller Agent state without duplicating the search or calculation.

## Limitations

Trim, condition, options, title history, and timing are returned when public but
are not ranked or weighted. Asking prices are not verified completed sales.
Location is free-text substring matching because the current snapshot has no
normalized geographic field. The current database indexes cover `issue_type`
and `status`, not all JSON vehicle fields; future indexing may be needed at
scale, but this task changes no models or migrations.

## Validation correction and verification

Previously, `int()` silently truncated fractional range bounds, potentially
searching outside the user's intended criteria. The correction validates the
container and integer types first, then uses those bounds unchanged. All
malformed containers or bounds, reversed ranges, and negative mileage use the
same `ValueError` exception type without querying the database.

The focused suite now contains 12 tests: the original eight search tests plus
fractional rejection in all four bound positions, reversed-range rejection,
malformed/noninteger-range rejection, and valid integer list/tuple and
single-value-range searches. Publication coverage includes drafts, approved-but-
unpublished posts, and archived posts. Task 2.1 is unchanged.

Run from `backend/` with an existing Django-compatible interpreter:

```shell
../.venv/bin/python -B manage.py test agent.tests.test_post_search_service -v 2 --noinput
```

The focused command was attempted after this correction, but the existing
Python 3.9.6 venv raises `ModuleNotFoundError: No module named 'django'` before
test discovery. All 12 tests therefore remain unexecuted; editor diagnostics
are not passing tests. No alternate Django-compatible interpreter was found in
the checked project and standard installation locations. No environment was
modified and no packages were installed. Git review confirms only the three
authorized files have working-tree edits; Task 2.1 has no diff.
