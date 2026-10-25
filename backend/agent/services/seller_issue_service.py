"""Validated private SellIssue persistence using the existing trusted-user contract."""

import json
from decimal import Decimal
from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, transaction
from rest_framework.exceptions import APIException

from agent.tools.result import error_result, tool_result
from issues.models import SellIssue
from issues.serializers import SellIssueSerializer
from issues.services import create_sell_issue, update_sell_issue
from vehicles.models import UsedCar


def create_or_update_sell_issue(used_car_id, selling_details, sell_issue_id=None, *, user=None):
    """Create when issue ID is null; otherwise update that exact owned car's issue.

    User comes from trusted request.user or the shared ADK bridge. No state,
    owner, status or publication claim from selling_details authorizes a write.
    Omitted optional fields are preserved on update; no public Post is changed.
    """
    try:
        if (
            not isinstance(user, get_user_model()) or not user.is_authenticated
            or not user.is_active or user._state.adding
            or not get_user_model().objects.filter(pk=user.pk, is_active=True).exists()
        ):
            return error_result("Authentication is required.")
        if not isinstance(used_car_id, (str, UUID)):
            return error_result("Vehicle not found.")
        try:
            vehicle_id = UUID(str(used_car_id))
        except ValueError:
            return error_result("Vehicle not found.")
        issue_id = None
        if sell_issue_id is not None:
            if not isinstance(sell_issue_id, (str, UUID)):
                return error_result("Sell issue not found.")
            try:
                issue_id = UUID(str(sell_issue_id))
            except ValueError:
                return error_result("Sell issue not found.")
        with transaction.atomic():
            car = UsedCar.objects.select_for_update().filter(pk=vehicle_id, owner=user).first()
            if car is None:
                return error_result("Vehicle not found.")
            issue = None
            if issue_id is not None:
                issue = SellIssue.objects.select_for_update().filter(pk=issue_id, user=user, used_car=car).first()
                if issue is None:
                    return error_result("Sell issue not found.")
            allowed = {"description", "asking_price", "condition_details", "known_damage", "location", "contact_info"}
            if not isinstance(selling_details, dict) or not selling_details or set(selling_details) - allowed:
                return error_result("Invalid Sell issue input.")
            for field in ("description", "known_damage", "location"):
                if field in selling_details and not isinstance(selling_details[field], str):
                    return error_result("Invalid Sell issue input.")
            if "asking_price" in selling_details:
                price = selling_details["asking_price"]
                if price is not None and (
                    isinstance(price, bool) or not isinstance(price, (Decimal, int, str))
                    or (isinstance(price, str) and not price.strip())
                ):
                    return error_result("Invalid Sell issue input.")
            # JSON fields must serialize before optional values can be normalized away.
            for field in ("condition_details", "contact_info"):
                if field in selling_details:
                    value = selling_details[field]
                    if value is not None and (not isinstance(value, dict) or any(not isinstance(key, str) for key in value)):
                        return error_result("Invalid Sell issue input.")
                    json.dumps(value, allow_nan=False)
            data = dict(selling_details)
            if issue is None:
                data["used_car"] = car.id
            serializer = SellIssueSerializer(instance=issue, data=data, partial=issue is not None)
            serializer.fields["used_car"].queryset = UsedCar.objects.filter(pk=car.id, owner=user)
            if not serializer.is_valid():
                return error_result("Invalid Sell issue input.")
            action = "created" if issue is None else "updated"
            if issue is None:
                issue = create_sell_issue(user, serializer.validated_data)
            elif any(getattr(issue, key) != value for key, value in serializer.validated_data.items()):
                issue = update_sell_issue(issue, serializer.validated_data)
            return tool_result(
                "ok", data={"action": action, "id": str(issue.id), "used_car_id": str(car.id),
                            "description": issue.description, "asking_price": issue.asking_price,
                            "condition_details": issue.condition_details, "known_damage": issue.known_damage,
                            "location": issue.location, "status": issue.status},
                ids={"used_car_id": str(car.id), "issue": {"type": "sell", "id": str(issue.id)}},
                provenance="own_sell_issues",
            )
    except (APIException, DjangoValidationError, ValueError, TypeError, OverflowError, RecursionError):
        return error_result("Invalid Sell issue input.")
    except DatabaseError:
        return error_result("Unable to save Sell issue.")
