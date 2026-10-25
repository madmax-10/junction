"""Owner-authorized integration of public asking-price evidence and catalog MSRP."""

from uuid import UUID

from agent.config import valuation_provider_config
from agent.services.catalog_service import get_catalog_reference
from agent.services.post_search_service import search_comparable_posts
from agent.services.valuation_service import estimate
from agent.services.ai_valuation_service import get_evidence_weights, ValuationProviderError
from agent.tools.result import error_result, tool_result
from vehicles.models import UsedCar


def calculate_value_range(used_car_id, comparable_ids=None, *, user, provider=None):
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
    if comparable_ids is None:
        comparable_ids = []
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

    search = search_comparable_posts(car.make, car.model)
    comparables = search["comparables"]
    if comparable_ids:
        comparables_by_id = {item["post_id"]: item for item in comparables}
        comparables = [comparables_by_id[key] for key in selected_ids if key in comparables_by_id]
    # Never let an entirely malformed explicit selection broaden into discovery.
    weights = None
    evidence = None
    provider_failed = False
    if len(comparables) >= 3:
        try:
            evidence = get_evidence_weights(
                {"make": car.make, "model": car.model, "year": car.year,
                 "mileage": car.mileage, "trim": car.trim, "condition": car.condition},
                comparables, provider=provider,
            )
            weights = {row.post_id: row.weight for row in evidence.weights}
        except ValuationProviderError:
            provider_failed = True

    catalog = get_catalog_reference(car.make, car.model, car.year, trim=car.trim or None)
    valuation = estimate(comparables, msrp_reference=catalog["msrp_reference"], weights=weights)
    valuation["method"] = "ai_weighted_asking_mean"
    valuation["formula"] = "sum(asking_price * weight) / sum(weight)"
    provider_name, provider_model, _ = valuation_provider_config()
    valuation["weighting_provider"] = "injected" if provider is not None else provider_name
    # An injected provider must not be attributed to a Gemini model it never used.
    valuation["weighting_model"] = provider_model if provider is None and evidence is not None else None
    prices_by_id = {row["post_id"]: row["asking_price"] for row in comparables}
    valuation["weight_evidence"] = [
        {**row.model_dump(), "asking_price": prices_by_id[row.post_id]}
        for row in evidence.weights
    ] if evidence is not None else []
    valuation["limitations"].extend(catalog["limitations"])
    if invalid_ids or len(comparables) < len(selected_ids):
        valuation["limitations"].append(
            "Some requested comparables were excluded; only eligible published Sell posts were used."
        )
    if provider_failed:
        valuation["limitations"].append("AI weighting provider unavailable or returned invalid evidence weights.")
    valuation["limitations"].append("AI-weighted asking estimate; not calibrated against real sales. median is deprecated and always null.")
    return tool_result(
        "ok" if valuation["status"] == "completed" else "insufficient_data",
        data=valuation,
        ids={"used_car_id": str(car.id), "post_ids": valuation["comparable_post_ids"]},
        provenance="published_sell_posts",
    )
