# Asking-price calculation

`estimate(comparables, msrp_reference=None, weights=...)` validates distinct post IDs and finite nonnegative Decimal prices. Conflicting duplicates raise ValueError; identical duplicates count once. At least three distinct posts with positive weights are required.

The server computes `estimated_value = sum(asking_price * weight) / sum(weight)` with Decimal arithmetic. There is no median calculation. `median` remains a deprecated compatibility field, always null. `low` and `high` are observed evidence bounds, not confidence intervals. Missing weights or thin evidence return insufficient_data with no numeric estimate/range. MSRP is separate and never enters arithmetic. `price_basis` is `asking`: this estimate is not calibrated against real sales. Currency is not inferred or fabricated.
