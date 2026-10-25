"""Owner-authorized price-advice boundary without trusting client valuation claims."""

from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import DatabaseError

from agent.tools.result import error_result, tool_result
from issues.models import SellIssue


def recommend_asking_price(sell_issue_id, valuation_context=None, *, user=None):
    """Return safe insufficiency until the existing valuation handoff proves origin.

    Trusted server code supplies user. The current Agent 2 envelope and mutable
    history/state do not authenticate numerical evidence or establish currency.
    No caller-provided prices, IDs or source labels are promoted to verified facts.
    """
    try:
        if (
            not isinstance(user, get_user_model()) or not user.is_authenticated
            or not user.is_active or user._state.adding
            or not get_user_model().objects.filter(pk=user.pk, is_active=True).exists()
        ):
            return error_result("Authentication is required.")
        if not isinstance(sell_issue_id, (str, UUID)):
            return error_result("Sell issue not found.")
        try:
            issue_id = UUID(str(sell_issue_id))
        except ValueError:
            return error_result("Sell issue not found.")
        issue = SellIssue.objects.filter(pk=issue_id, user=user, used_car__owner=user).values(
            "id", "used_car_id",
        ).first()
        if issue is None:
            return error_result("Sell issue not found.")
        reason = (
            "Valuation context is missing." if valuation_context is None else
            "The supplied valuation context has no established authenticated result provenance."
        )
        return tool_result(
            "insufficient_data",
            data={
                "status": "insufficient_data", "id": str(issue["id"]),
                "used_car_id": str(issue["used_car_id"]), "suggested_asking_price": None,
                "low": None, "median": None, "high": None, "sample_size": 0,
                "price_basis": "asking", "comparable_post_ids": [], "currency": None,
                "limitations": [
                    reason,
                    "Agent 2 returns a plain result envelope, not authenticated evidence. "
                    "A provenance label or matching vehicle ID does not prove the origin of supplied prices.",
                    "Agent 2 does not establish currency in its current result contract. "
                    "No numerical asking-price recommendation is justified by this handoff.",
                    "Comparable asking prices are not verified completed-sale prices or a guaranteed sale value. "
                    "Catalog MSRP is separate and is not a used-car price recommendation.",
                    "No condition, mileage, negotiation or market adjustments are applied; "
                    "the existing private asking price is unchanged.",
                ],
            },
            ids={"issue": {"type": "sell", "id": str(issue["id"])},
                 "used_car_id": str(issue["used_car_id"]), "post_ids": []},
            provenance="own_sell_issues",
        )
    except DatabaseError:
        return error_result("Seller pricing advice is unavailable.")
