# Asking-price calculation: `estimate()`

## What it does and why Valuation needs it

[`estimate()`](./valuation_service.py) is a pure Python function: it validates
comparable asking prices, removes repeated posts, and calculates an observed
minimum, median, and maximum. It does not read a database, save anything, call
an agent, or use an external API. It uses only Python's standard library.

The Valuation Agent will need a dependable calculation instead of asking a
language model to guess prices or do arithmetic. This function provides that
calculation. It is not yet an agent or an ADK tool.

## Input

Call `estimate(comparables, msrp_reference=None)` with an iterable of dictionaries
(or other mappings). Each record must contain:

| Key | Accepted value |
| --- | --- |
| `post_id` | A nonblank string identifying one post. Convert UUID objects to strings before calling. |
| `asking_price` | A finite, nonnegative `Decimal`, integer, or numeric string such as `"12000.50"`. Zero is allowed. |

Floats, booleans, missing values, currency symbols, and formatted amounts such
as `"$12,000"` are not accepted. Use a decimal string or `Decimal` rather than a
float so binary floating-point values are not carried into the calculation.
Additional record fields are ignored. IDs are preserved exactly as supplied,
in first-seen order; callers should supply canonical identifiers.

`msrp_reference` is optional reference information. It is returned unchanged,
without validation, copying, or use in the calculation. The function does not
modify the input records or reference. An iterator input is consumed once.

All prices must already use the same currency and units. The function cannot
verify currency, vehicle similarity, publication status, or whether a supplied
price is genuine. The future calling service must select real, approved,
published Sell posts and perform those checks before calling this function.

## Output

The result is a plain Python dictionary with exactly these fields:

| Field | Meaning |
| --- | --- |
| `status` | `"completed"` for at least three distinct valid posts; otherwise `"insufficient_data"`. |
| `low` | Smallest asking price as a `Decimal`, or `None` when data is insufficient. |
| `median` | Middle asking price, or the exact average of the two middle prices, as a `Decimal`; otherwise `None`. |
| `high` | Largest asking price as a `Decimal`, or `None` when data is insufficient. |
| `sample_size` | Number of distinct valid post identifiers. |
| `price_basis` | Always `"asking"`, never sold-price evidence. |
| `comparable_post_ids` | Distinct post IDs in first-seen order. |
| `msrp_reference` | The optional reference supplied by the caller, or `None`. |
| `limitations` | A list explaining that asking prices are not verified sales and that this preliminary range has no vehicle or market adjustments; also explains insufficient data when relevant. |

Prices remain `Decimal` values, not floats or JSON strings. A future integration
must explicitly serialize them, preferably as decimal strings. This task does
not add that integration or a shared agent response envelope.

## Example and calculation

These are synthetic teaching fixtures, not real marketplace evidence:

```python
from backend.ai.services.valuation_service import estimate

result = estimate([
    {"post_id": "example-a", "asking_price": "15000.00"},
    {"post_id": "example-b", "asking_price": "10000.00"},
    {"post_id": "example-c", "asking_price": "12000.00"},
])
```

The function performs these steps:

1. Validate the iterable, each record, its post ID, and its asking price.
2. Convert accepted prices to `Decimal` and keep one price per distinct post ID.
3. Sort the prices: `10000.00`, `12000.00`, `15000.00`.
4. Count three distinct posts, meeting the provisional minimum of three.
5. Use the first price as `low`, the middle as `median`, and the last as `high`.
6. Return `status="completed"`, `sample_size=3`, `price_basis="asking"`, the
   original identifiers, the optional MSRP reference, and limitations.

The example range is therefore `Decimal("10000.00")`, `Decimal("12000.00")`,
and `Decimal("15000.00")`. There is no invented percentage adjustment.

For an even number of posts, the median averages the two middle prices using
Decimal arithmetic. For example, `12000.01` and `12000.02` give `12000.015`.
The function does not round this to cents. It uses a local precision sufficient
for that arithmetic without changing the caller's Decimal precision.

## Invalid data and repeated posts

Invalid input raises `ValueError`; it does not return a partial estimate or
silently skip a bad record. This includes a non-iterable collection, a string
or mapping supplied instead of a collection of records, a non-mapping record,
a missing or blank post ID, and a missing, malformed, negative, or nonfinite
price (`NaN` or infinity).

Repeated IDs with the same numeric price count once, even if represented as
`"10000"` and `Decimal("10000.00")`. Repeated IDs with different prices raise
`ValueError`, so choosing the first or last record cannot change the estimate.
Every record is validated, including repeats.

## What `insufficient_data` means

Empty input, one distinct post, or two distinct posts returns
`status="insufficient_data"`. `low`, `median`, and `high` are all `None`.
The actual sample size, available IDs, MSRP reference, and limitations remain
in the result. MSRP cannot fill in a missing comparable range.

Three is a provisional minimum from the architecture example, not proof that
three listings always make a reliable valuation. Observed extremes can be
outliers; similarity, data quality, currency, and evidence selection remain
the caller's responsibility.

## Why MSRP is not a sold price

MSRP is a manufacturer's suggested retail price for a new vehicle. It is not
proof of a completed sale, a dealer's current stock, or a used car's present
value. This function keeps it separate and never blends it into the comparable
asking-price calculation. Asking prices are also not confirmed sale prices.

## Future agent use: not implemented here

Eventually, an authorized Django service can retrieve a user's vehicle and
genuine published Sell-post comparables, then call `estimate()` with those
records. The Valuation Agent can explain the returned evidence and limitations
without inventing or recalculating prices.

The Coordinator can receive that valuation and manage the state passed to
the Seller Agent. The Seller Agent should consume the stored valuation, not
invoke Valuation directly or repeat its arithmetic. None of those database,
session, authentication, ADK, or agent connections are implemented in this task.

## Focused tests

The tests use synthetic fixtures only. From the repository root, run:

```shell
python3 -B -m unittest discover -s backend/ai/tests -p "test_valuation_service.py" -v
```

The directories use Python namespace packages, so no additional `__init__.py`
files are necessary for this import when running from the repository root.
