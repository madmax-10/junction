"""Pure asking-price calculations; no database, agent, or network integration."""

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation, localcontext


def estimate(comparables, msrp_reference=None):
    """Return observed min/median/max for at least three distinct posts.

    Each comparable is a mapping with a nonblank string ``post_id`` and a
    nonnegative, finite ``asking_price`` (Decimal, integer, or numeric string).
    Invalid input, including conflicting prices for one post, raises ValueError.
    Identical repeated posts count once. MSRP is returned unchanged, never used
    in the calculation. See valuation_service.md for the complete contract.
    """
    if isinstance(comparables, (str, bytes, Mapping)):
        raise ValueError("comparables must be an iterable of comparable records.")
    try:
        records = iter(comparables)
    except TypeError as exc:
        raise ValueError("comparables must be an iterable of comparable records.") from exc

    prices_by_id = {}
    for record in records:
        if not isinstance(record, Mapping):
            raise ValueError("Each comparable must be a mapping.")
        post_id = record.get("post_id")
        if not isinstance(post_id, str) or not post_id.strip():
            raise ValueError("Each comparable requires a nonblank string post_id.")

        raw_price = record.get("asking_price")
        if isinstance(raw_price, bool) or not isinstance(raw_price, (Decimal, int, str)):
            raise ValueError("asking_price must be a Decimal, integer, or numeric string.")
        try:
            price = Decimal(raw_price)
        except (InvalidOperation, ValueError) as exc:
            raise ValueError("asking_price must be a valid decimal number.") from exc
        if not price.is_finite() or price < 0:
            raise ValueError("asking_price must be finite and nonnegative.")

        if post_id in prices_by_id and prices_by_id[post_id] != price:
            raise ValueError("Repeated post_id values must have the same asking_price.")
        prices_by_id[post_id] = price

    prices = sorted(prices_by_id.values())
    sample_size = len(prices)
    limitations = [
        "Asking prices only; not verified sold prices or a guaranteed sale value.",
        "Preliminary observed range; no condition, mileage, or market adjustments.",
    ]
    result = {
        "status": "insufficient_data",
        "low": None,
        "median": None,
        "high": None,
        "sample_size": sample_size,
        "price_basis": "asking",
        "comparable_post_ids": list(prices_by_id),
        "msrp_reference": msrp_reference,
        "limitations": limitations,
    }
    if sample_size < 3:
        limitations.append("At least three distinct valid comparable posts are required.")
        return result

    middle = sample_size // 2
    median = prices[middle]
    if sample_size % 2 == 0:
        # Allow enough decimal digits for exact addition and division by two,
        # even when the caller uses a low-precision Decimal context.
        with localcontext() as context:
            context.prec = max(
                28,
                max(price.adjusted() for price in prices)
                - min(price.as_tuple().exponent for price in prices)
                + 3,
            )
            median = (prices[middle - 1] + prices[middle]) / Decimal(2)

    result.update(status="completed", low=prices[0], median=median, high=prices[-1])
    return result
