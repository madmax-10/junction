"""Read-only recommendations from the admin-managed catalog, not dealer stock."""

import json
from bisect import insort
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.db.models import Q
from rest_framework.exceptions import ValidationError

from agent.tools.result import error_result, tool_result
from issues.models import BuyIssue
from issues.serializers import BuyIssueSerializer
from vehicles.models import NewCar
from vehicles.serializers import NewCarSerializer


def search_new_catalog(buy_issue_id, limit=5, *, user):
    """Match an authenticated owner's saved Buy issue to existing catalog rows.

    User is supplied only by trusted server code. Filter before ranking; preserve
    variants as distinct UUIDs. Rank known MSRP first, price ascending, year
    descending, then catalog UUID. Missing MSRP is eligible only without budget
    bounds. No catalog entry is a verified dealer offer or availability claim.
    """
    try:
        if (
            not isinstance(user, get_user_model()) or not user.is_authenticated
            or not user.is_active or user._state.adding
            or not get_user_model().objects.filter(pk=user.pk, is_active=True).exists()
        ):
            return error_result("Authentication is required.")
        if not isinstance(buy_issue_id, (str, UUID)):
            return error_result("Buy issue not found.")
        try:
            issue_id = UUID(str(buy_issue_id))
        except ValueError:
            return error_result("Buy issue not found.")
        issue = BuyIssue.objects.filter(pk=issue_id, user=user).first()
        if issue is None:
            return error_result("Buy issue not found.")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 50:
            return error_result("limit must be an integer between 1 and 50.")

        preferences = issue.preferences
        if preferences is not None and (
            not isinstance(preferences, dict)
            or any(not isinstance(key, str) for key in preferences)
        ):
            return error_result("Invalid saved Buy issue criteria.")
        json.dumps(preferences, allow_nan=False)
        criteria = BuyIssueSerializer(instance=issue, data={
            "description": issue.description, "min_budget": issue.min_budget,
            "max_budget": issue.max_budget, "preferences": preferences,
        })
        if not criteria.is_valid():
            return error_result("Invalid saved Buy issue criteria.")
        preferences = criteria.validated_data.get("preferences") or {}
        min_budget = criteria.validated_data.get("min_budget")
        max_budget = criteria.validated_data.get("max_budget")
        limitations = [
            "Catalog entries only: MSRP is a manufacturer/reference price, not a confirmed "
            "dealer quote, out-the-door price, guaranteed purchase price, or proof of availability.",
            "Budgets filter MSRP references only; final dealer prices are not verified.",
            "Variants remain separate catalog records; ranking does not identify a preferred trim.",
            "Order is known MSRP first, MSRP ascending, year descending, then catalog UUID; "
            "catalog accuracy and freshness are not independently verified.",
        ]
        ranked = []
        if preferences.get("vehicle_type") == "used":
            limitations.append("This Buy issue requests used vehicles; no new-car catalog search was performed.")
        else:
            unsupported = [key for key in ("maximum_mileage", "fuel_type", "location")
                           if key in preferences]
            if unsupported:
                return error_result("New-car catalog cannot verify saved criteria: " + ", ".join(unsupported) + ".")
            queryset = NewCar.objects.all()
            for key, field in (("preferred_makes", "make"), ("preferred_models", "model")):
                if preferences.get(key):
                    matches = Q()
                    for value in preferences[key]:
                        matches |= Q(**{f"{field}__iexact": value})
                    queryset = queryset.filter(matches)
            if "minimum_year" in preferences:
                queryset = queryset.filter(year__gte=preferences["minimum_year"])
            if min_budget is not None:
                queryset = queryset.filter(msrp__gte=min_budget)
            if max_budget is not None:
                queryset = queryset.filter(msrp__lte=max_budget)

            rows = queryset.order_by("id").values("id", "make", "model", "year", "trim", "msrp")
            for row in rows.iterator(chunk_size=200):
                entry = NewCarSerializer(data=row)
                if not entry.is_valid():
                    continue
                data = entry.validated_data
                msrp = data.get("msrp")
                if msrp is None and (min_budget is not None or max_budget is not None):
                    continue
                if msrp is not None and (
                    (min_budget is not None and msrp < min_budget)
                    or (max_budget is not None and msrp > max_budget)
                ):
                    continue
                reasons = ["Admin-managed catalog entry only; dealer price and availability are not verified."]
                eligible = True
                for key, field, label in (
                    ("preferred_makes", "make", "Make"), ("preferred_models", "model", "Model"),
                ):
                    if preferences.get(key):
                        if data[field].casefold() not in {value.casefold() for value in preferences[key]}:
                            eligible = False
                            break
                        reasons.append(f"{label} {data[field]} matches a saved choice.")
                if not eligible:
                    continue
                if "minimum_year" in preferences:
                    if data["year"] < preferences["minimum_year"]:
                        continue
                    reasons.append(f"Year {data['year']} meets minimum year {preferences['minimum_year']}.")
                if msrp is None:
                    reasons.append("MSRP is unavailable; no reference price or budget claim is inferred.")
                else:
                    reasons.append("Stored MSRP is a catalog reference, not a verified dealer quote.")
                    if min_budget is not None:
                        reasons.append(f"MSRP {msrp} meets minimum reference-price budget {min_budget}.")
                    if max_budget is not None:
                        reasons.append(f"MSRP {msrp} meets maximum reference-price budget {max_budget}.")
                match = {
                    "catalog_id": str(row["id"]), "make": data["make"], "model": data["model"],
                    "year": data["year"], "trim": data.get("trim", ""), "msrp": msrp,
                    "price_basis": "catalog_msrp", "reasons": reasons, "provenance": "new_cars_catalog",
                }
                insort(ranked, (msrp is None, msrp if msrp is not None else Decimal(0),
                                -data["year"], str(row["id"]), match))
                if len(ranked) > limit:
                    ranked.pop()

        results = [item[-1] for item in ranked]
        return tool_result(
            "ok" if results else "no_results",
            data={"matches": results, "result_count": len(results), "limitations": limitations},
            ids={"issue": {"type": "buy", "id": str(issue.id)},
                 "catalog_ids": [item["catalog_id"] for item in results]},
            provenance="new_cars_catalog",
        )
    except (ValidationError, ValueError, TypeError, OverflowError):
        return error_result("Invalid saved Buy issue criteria.")
    except (DatabaseError, InvalidOperation):
        return error_result("New-car catalog search is unavailable.")
