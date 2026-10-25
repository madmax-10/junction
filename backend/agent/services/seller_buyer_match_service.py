"""Read-only matching of an owned SellIssue to approved public Buy snapshots."""

from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from rest_framework.exceptions import ValidationError

from agent.tools.result import error_result, tool_result
from common.validators import normalize_preferences
from issues.models import SellIssue
from posts.models import Post


def find_and_rank_buyers(sell_issue_id, limit=5, *, user=None):
    """Return public interest posts, never buyer identities or private BuyIssues.

    Trusted server callers supply request.user or the shared bridge's user.
    Ranking represents supported published requirements, not purchase intent
    verification, budget compatibility or a guarantee that a buyer will purchase.
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
            "id", "used_car__make", "used_car__model", "used_car__year", "used_car__mileage",
        ).first()
        if issue is None:
            return error_result("Sell issue not found.")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10:
            return error_result("limit must be an integer between 1 and 10.")
        keys = ("preferred_makes", "preferred_models", "minimum_year", "maximum_mileage", "vehicle_type")
        columns = ["post_data__" + key for key in keys]
        candidates = Post.objects.filter(
            issue_type=Post.IssueType.BUY, status=Post.Status.PUBLISHED, approved_at__isnull=False,
        ).order_by("-created_at", "id").values("id", *columns)[:500]
        ranked = []
        for post in candidates:
            try:
                requirements = normalize_preferences({key: post["post_data__" + key] for key in keys})
            except (ValidationError, ValueError, TypeError):
                continue
            if not requirements or requirements.get("vehicle_type") == "new":
                continue
            reasons = []
            matched = []
            eligible = True
            for key, actual, label in (
                ("preferred_makes", issue["used_car__make"], "make"),
                ("preferred_models", issue["used_car__model"], "model"),
            ):
                choices = requirements.get(key)
                matched.append(int(bool(choices)))
                if choices:
                    if actual.strip().casefold() not in {choice.casefold() for choice in choices}:
                        eligible = False
                        break
                    reasons.append("Vehicle " + label + " matches an explicitly published preference.")
            if not eligible:
                continue
            minimum_year = requirements.get("minimum_year")
            if minimum_year is not None:
                if issue["used_car__year"] < minimum_year:
                    continue
                reasons.append("Vehicle year meets the published minimum year.")
            maximum_mileage = requirements.get("maximum_mileage")
            if maximum_mileage is not None:
                if issue["used_car__mileage"] > maximum_mileage:
                    continue
                reasons.append("Vehicle mileage meets the published maximum mileage.")
            used = requirements.get("vehicle_type") == "used"
            if used:
                reasons.append("Published preference explicitly requests a used vehicle.")
            match = {
                "post_id": str(post["id"]), "public_requirements": requirements,
                "reasons": reasons, "provenance": "published_buy_post_interest",
            }
            ranked.append((-matched[0], -matched[1], -int(minimum_year is not None),
                           -int(maximum_mileage is not None), -int(used), str(post["id"]), match))
        ranked.sort()
        matches = [item[-1] for item in ranked[:limit]]
        return tool_result(
            "ok" if matches else "no_results",
            data={"matches": matches, "result_count": len(matches), "limitations": [
                "These are approved published Buy Post requirements, not verified buyer identities "
                "or guarantees of current interest or purchase. One person may have multiple posts.",
                "Ranking prefers explicit matching make, model, minimum-year, maximum-mileage and used-vehicle "
                "requirements, then post UUID. Only the newest 500 eligible public snapshots are considered.",
                "Budgets are not compared because currency is not established. Fuel type, location and other "
                "unsupported requirements are not assessed; matches indicate only the displayed requirements.",
                "No contact information is retrieved or disclosed.",
            ]},
            ids={"issue": {"type": "sell", "id": str(issue["id"])},
                 "post_ids": [match["post_id"] for match in matches]},
            provenance="published_buy_posts",
        )
    except DatabaseError:
        return error_result("Public buyer-interest search is unavailable.")
