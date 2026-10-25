"""Database-backed searches over approved public post snapshots."""

from decimal import Decimal, InvalidOperation

from posts.models import Post


def search_comparable_posts(make, model, year_range, mileage_range, location=None):
    """Return published Sell-post comparables matching exact vehicle ranges.

    ``year_range`` and ``mileage_range`` are inclusive two-item lists or tuples
    of integers (not booleans, floats, strings, or Decimal values). The
    returned ``comparables`` list is directly consumable by Task 2.1's
    ``estimate`` function. Invalid search arguments raise ``ValueError``;
    malformed post snapshots are excluded from market evidence.
    """
    if not isinstance(make, str) or not make.strip():
        raise ValueError("make must be a nonblank string.")
    if not isinstance(model, str) or not model.strip():
        raise ValueError("model must be a nonblank string.")
    for bounds in (year_range, mileage_range):
        if not isinstance(bounds, (list, tuple)) or len(bounds) != 2:
            raise ValueError("ranges must be two-item lists or tuples of integers.")
        if any(isinstance(value, bool) or not isinstance(value, int) for value in bounds):
            raise ValueError("range bounds must be integers, not coerced numeric values.")
    year_start, year_end = year_range
    mileage_start, mileage_end = mileage_range
    if year_start > year_end:
        raise ValueError("year_range lower bound cannot exceed upper bound.")
    if mileage_start < 0 or mileage_start > mileage_end:
        raise ValueError("mileage_range must be nonnegative and ordered.")

    if location is not None:
        if not isinstance(location, str):
            raise ValueError("location must be a string when supplied.")
        location = location.strip() or None

    queryset = Post.objects.filter(
        issue_type=Post.IssueType.SELL,
        status=Post.Status.PUBLISHED,
        post_data__make__iexact=make.strip(),
        post_data__model__iexact=model.strip(),
        post_data__year__gte=year_start,
        post_data__year__lte=year_end,
        post_data__mileage__gte=mileage_start,
        post_data__mileage__lte=mileage_end,
    )
    if location is not None:
        queryset = queryset.filter(post_data__location__icontains=location)

    comparables = []
    for post in queryset.only("id", "post_data"):
        data = post.post_data if isinstance(post.post_data, dict) else {}
        if data.get("synthetic") is True or data.get("is_synthetic") is True:
            continue
        post_make, post_model = data.get("make"), data.get("model")
        year, mileage, raw_price = data.get("year"), data.get("mileage"), data.get("asking_price")
        post_location = data.get("location")
        if (
            not isinstance(post_make, str)
            or not isinstance(post_model, str)
            or post_make.casefold() != make.strip().casefold()
            or post_model.casefold() != model.strip().casefold()
            or isinstance(year, bool)
            or isinstance(mileage, bool)
            or not isinstance(year, int)
            or not isinstance(mileage, int)
            or not year_start <= year <= year_end
            or not mileage_start <= mileage <= mileage_end
            or not isinstance(raw_price, (str, int, float, Decimal))
            or isinstance(raw_price, bool)
        ):
            continue
        try:
            asking_price = Decimal(str(raw_price))
        except (InvalidOperation, ValueError):
            continue
        if not asking_price.is_finite() or asking_price < 0:
            continue
        if location is not None and (
            not isinstance(post_location, str)
            or location.casefold() not in post_location.casefold()
        ):
            continue
        comparable = {
            "post_id": str(post.id),
            "asking_price": asking_price,
            "make": post_make,
            "model": post_model,
            "year": year,
            "mileage": mileage,
        }
        for key in ("trim", "condition_details", "known_damage", "location"):
            if key in data:
                comparable[key] = data[key]
        comparables.append(comparable)

    return {
        "status": "completed" if comparables else "no_results",
        "comparables": comparables,
        "limitations": [
            "Results are published asking prices, not verified sold prices.",
            "Trim, condition, options, title history, and market timing are not ranked here.",
        ],
    }
