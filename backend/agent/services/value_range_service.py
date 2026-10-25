"""Owner-authorized integration of public asking-price evidence and catalog MSRP."""

from uuid import UUID

from agent.services.catalog_service import get_catalog_reference
from agent.services.post_search_service import search_comparable_posts
from agent.services.valuation_service import estimate
from agent.tools.result import error_result, tool_result
from posts.models import Post
from vehicles.models import UsedCar


def calculate_value_range(used_car_id, comparable_ids, *, user):
    """Calculate for an owned car using selected public posts, with no writes.

    ``user`` must be supplied by authenticated server code, never by the model.
    Missing, malformed, foreign-owned, or unauthenticated vehicle requests return
    the same generic error. Comparable UUIDs are deduplicated and revalidated;
    missing or ineligible posts are excluded without revealing their details.
    """
    if not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return error_result("Vehicle not found.")
    try:
        vehicle_id = UUID(str(used_car_id))
    except (ValueError, TypeError, AttributeError):
        return error_result("Vehicle not found.")
    car = UsedCar.objects.filter(pk=vehicle_id, owner=user).first()
    if car is None:
        return error_result("Vehicle not found.")
    if not isinstance(comparable_ids, (list, tuple)):
        raise ValueError("comparable_ids must be a list or tuple of post UUIDs.")

    selected_ids = {}
    invalid_ids = False
    for post_id in comparable_ids:
        if not isinstance(post_id, (str, UUID)):
            invalid_ids = True
            continue
        try:
            selected_ids[str(UUID(str(post_id)))] = None
        except ValueError:
            invalid_ids = True

    # Inspect only selected public snapshots to derive search bounds. These are
    # envelopes of selected records, not invented tolerances around the subject.
    snapshots = Post.objects.filter(
        pk__in=selected_ids,
        status=Post.Status.PUBLISHED,
        issue_type=Post.IssueType.SELL,
        post_data__make__iexact=car.make.strip(),
        post_data__model__iexact=car.model.strip(),
    ).values_list("post_data", flat=True)
    bounds = [
        (data["year"], data["mileage"])
        for data in snapshots
        if isinstance(data, dict)
        and isinstance(data.get("year"), int) and not isinstance(data["year"], bool)
        and isinstance(data.get("mileage"), int) and not isinstance(data["mileage"], bool)
        and data["mileage"] >= 0
    ]
    comparables = []
    if bounds:
        search = search_comparable_posts(
            car.make, car.model,
            (min(year for year, _ in bounds), max(year for year, _ in bounds)),
            (min(mileage for _, mileage in bounds), max(mileage for _, mileage in bounds)),
        )
        eligible = {
            item["post_id"]: item for item in search["comparables"]
            if item["post_id"] in selected_ids
        }
        comparables = [eligible[post_id] for post_id in selected_ids if post_id in eligible]

    catalog = get_catalog_reference(car.make, car.model, car.year, trim=car.trim or None)
    valuation = estimate(comparables, msrp_reference=catalog["msrp_reference"])
    valuation["limitations"].extend(catalog["limitations"])
    if invalid_ids or len(comparables) < len(selected_ids):
        valuation["limitations"].append(
            "Some requested comparables were excluded; only eligible published Sell posts were used."
        )
    valuation["limitations"].extend([
        "Compatibility checks use make/model and the selected posts' year/mileage bounds; "
        "prior search bounds or location are not available to this interface.",
        "A missing synthetic flag does not establish genuine market evidence; "
        "normal publication validation currently rejects the recognized synthetic flags.",
    ])
    return tool_result(
        "ok" if valuation["status"] == "completed" else "insufficient_data",
        data=valuation,
        ids={"used_car_id": str(car.id), "post_ids": valuation["comparable_post_ids"]},
        provenance="published_sell_posts",
    )
