"""Read-only, deterministic matching of private buyer needs to public Sell posts."""

import json
from bisect import insort
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.fields import DecimalField

from agent.tools.result import error_result, tool_result
from common.validators import validate_model_year
from issues.models import BuyIssue
from issues.serializers import BuyIssueSerializer
from posts.models import Post


def search_and_rank_used(buy_issue_id, limit=5, *, user):
    """Return up to 50 eligible public listings for an authenticated owner's issue.

    ``user`` is a trusted server-only Django user, not a model-generated ID.
    Rank by asking price ascending, year descending, mileage ascending, then
    UUID ascending. All constraints are checked before a listing enters ranking.
    No changes are saved, and no contacts or private seller records are read.
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
        if preferences.get("fuel_type"):
            return error_result("Approved Sell-post data cannot verify the saved fuel_type criterion.")

        limitations = [
            "Published asking prices are seller-reported, not verified sales or guaranteed availability.",
            "Order is price ascending, year descending, mileage ascending, then post UUID; "
            "it is not an AI relevance score or a value appraisal.",
            "Explicit synthetic flags are preserved; absent flags do not establish genuine listings. "
            "Normal publication validation currently rejects those flags.",
        ]
        ranked = []
        if preferences.get("vehicle_type") == "new":
            limitations.append("This Buy issue requests new vehicles; this service searches used listings only.")
        else:
            queryset = Post.objects.filter(
                issue_type=Post.IssueType.SELL, status=Post.Status.PUBLISHED,
            )
            for key, field in (("preferred_makes", "make"), ("preferred_models", "model")):
                if preferences.get(key):
                    matches = Q()
                    for value in preferences[key]:
                        matches |= Q(**{f"post_data__{field}__iexact": value})
                    queryset = queryset.filter(matches)
            if "minimum_year" in preferences:
                queryset = queryset.filter(post_data__year__gte=preferences["minimum_year"])
            if "maximum_mileage" in preferences:
                queryset = queryset.filter(post_data__mileage__lte=preferences["maximum_mileage"])
            if preferences.get("location"):
                queryset = queryset.filter(post_data__location__icontains=preferences["location"])

            price_field = DecimalField(max_digits=12, decimal_places=2, min_value=0)
            # No unsafe SQL price casts: malformed JSON must not fail PostgreSQL
            # queries. Stream candidates, keeping only the globally best limit rows.
            for post in queryset.order_by("id").values("id", "post_data").iterator(chunk_size=200):
                data = post["post_data"]
                if not isinstance(data, dict):
                    continue
                make, model = data.get("make"), data.get("model")
                year, mileage = data.get("year"), data.get("mileage")
                raw_price = data.get("asking_price")
                if (
                    not isinstance(make, str) or not make.strip() or len(make) > 100
                    or not isinstance(model, str) or not model.strip() or len(model) > 100
                    or isinstance(year, bool) or not isinstance(year, int)
                    or isinstance(mileage, bool) or not isinstance(mileage, int) or mileage < 0
                    or isinstance(raw_price, bool) or not isinstance(raw_price, (str, int, float, Decimal))
                ):
                    continue
                try:
                    validate_model_year(year)
                    price = price_field.run_validation(Decimal(str(raw_price)))
                except (ValidationError, InvalidOperation, ValueError, TypeError):
                    continue
                if (min_budget is not None and price < min_budget) or (
                    max_budget is not None and price > max_budget
                ):
                    continue
                reasons = ["Published Sell post with an explicit valid asking price."]
                eligible = True
                for key, value, label in (
                    ("preferred_makes", make, "Make"), ("preferred_models", model, "Model"),
                ):
                    if preferences.get(key):
                        if value.casefold() not in {item.casefold() for item in preferences[key]}:
                            eligible = False
                            break
                        reasons.append(f"{label} {value} matches a saved choice.")
                if not eligible:
                    continue
                if "minimum_year" in preferences:
                    if year < preferences["minimum_year"]:
                        continue
                    reasons.append(f"Year {year} meets minimum year {preferences['minimum_year']}.")
                if "maximum_mileage" in preferences:
                    if mileage > preferences["maximum_mileage"]:
                        continue
                    reasons.append(f"Mileage {mileage} meets maximum mileage {preferences['maximum_mileage']}.")
                location = data.get("location")
                if preferences.get("location"):
                    if not isinstance(location, str) or preferences["location"].casefold() not in location.casefold():
                        continue
                    reasons.append(f"Public location contains saved location {preferences['location']}.")
                if min_budget is not None:
                    reasons.append(f"Asking price {price} meets minimum budget {min_budget}.")
                if max_budget is not None:
                    reasons.append(f"Asking price {price} meets maximum budget {max_budget}.")

                vehicle = {"make": make, "model": model, "year": year, "mileage": mileage}
                for key in ("trim", "location"):
                    if isinstance(data.get(key), str) and data[key].strip():
                        vehicle[key] = data[key]
                flags = {key: data[key] for key in ("synthetic", "is_synthetic")
                         if isinstance(data.get(key), bool)}
                synthetic = any(flags.values())
                if synthetic:
                    reasons.append("Explicitly marked synthetic/demo data, not verified customer inventory.")
                match = {
                    "post_id": str(post["id"]), "vehicle": vehicle, "asking_price": price,
                    "reasons": reasons, "synthetic_flags": flags,
                    "provenance": "synthetic_demo" if synthetic else "published_sell_post_unverified",
                }
                insort(ranked, (price, -year, mileage, str(post["id"]), match))
                if len(ranked) > limit:
                    ranked.pop()

        results = [item[-1] for item in ranked]
        return tool_result(
            "ok" if results else "no_results",
            data={"matches": results, "result_count": len(results), "limitations": limitations},
            ids={"issue": {"type": "buy", "id": str(issue.id)},
                 "post_ids": [item["post_id"] for item in results]},
            provenance="published_sell_posts",
        )
    except (ValidationError, ValueError, TypeError, OverflowError):
        return error_result("Invalid saved Buy issue criteria.")
    except DatabaseError:
        return error_result("Used-car search is unavailable.")
