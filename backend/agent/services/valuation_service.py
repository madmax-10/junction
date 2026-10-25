"""Pure asking-price calculations; no database, agent, or network integration."""

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation, localcontext


def estimate(comparables, msrp_reference=None, *, weights=None):
    """Validate evidence and compute a Decimal weighted asking-price mean.

    Missing weights never produce an estimate. median is deprecated and always None.
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
        "AI evidence weights express relevance; this is not calibrated against real sales.",
        "median is deprecated and always null.",
    ]
    result = {
        "status": "insufficient_data",
        "low": None,
        "median": None,
        "estimated_value": None,
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

    if weights is None:
        limitations.append("Validated evidence weights are required; median is deprecated.")
        return result
    if not isinstance(weights, Mapping) or set(weights) != set(prices_by_id):
        raise ValueError("Weights must cover exactly the distinct evidence IDs.")
    parsed = {}
    for post_id, raw in weights.items():
        if isinstance(raw, bool) or not isinstance(raw, (Decimal, int, str)):
            raise ValueError("Weights must be finite nonnegative decimal values.")
        try:
            weight = Decimal(raw)
        except (InvalidOperation, ValueError) as exc:
            raise ValueError("Invalid weight.") from exc
        if not weight.is_finite() or weight < 0:
            raise ValueError("Invalid weight.")
        parsed[post_id] = weight
    if sum(value > 0 for value in parsed.values()) < 3:
        limitations.append("At least three comparables must receive positive weight.")
        return result
    with localcontext() as context:
        context.prec = max(50, max(len(p.as_tuple().digits) + abs(p.as_tuple().exponent)
                                   for p in prices) + 30)
        total = sum(parsed.values(), Decimal(0))
        value = sum((prices_by_id[key] * weight for key, weight in parsed.items()), Decimal(0)) / total
    result.update(status="completed", low=prices[0], high=prices[-1], estimated_value=value)
    return result
