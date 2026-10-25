"""Validated, owner-scoped persistence for the Buy chatbot workflow."""

import json
from decimal import Decimal
from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, transaction
from rest_framework.exceptions import APIException
from rest_framework.fields import empty

from agent.tools.result import error_result, tool_result
from issues.models import BuyIssue
from issues.serializers import BuyIssueSerializer
from issues.services import create_buy_issue, update_buy_issue


def create_or_update_buy_issue(
    description=None, min_budget=empty, max_budget=empty, preferences=empty,
    *, user, buy_issue_id=None,
):
    """Save a private Buy issue using a server-supplied authenticated user.

    Omitted optional fields retain their values on update; None clears them.
    Updates require an explicit owned issue UUID and a meaningful description.
    Budgets accept only Decimal, integer, numeric string or None. The existing
    serializer enforces precision, bounds and the supported preference schema.
    Results use the shared JSON-safe envelope; no post is created or published.
    """
    try:
        if (
            not isinstance(user, get_user_model())
            or not user.is_authenticated or not user.is_active or user._state.adding
            or not get_user_model().objects.filter(pk=user.pk, is_active=True).exists()
        ):
            return error_result("Authentication is required.")

        with transaction.atomic():
            issue = None
            if buy_issue_id is not None:
                if not isinstance(buy_issue_id, (str, UUID)):
                    return error_result("Buy issue not found.")
                try:
                    issue_id = UUID(str(buy_issue_id))
                except ValueError:
                    return error_result("Buy issue not found.")
                issue = BuyIssue.objects.select_for_update().filter(pk=issue_id, user=user).first()
                if issue is None:
                    return error_result("Buy issue not found.")

            if not isinstance(description, str) or not description.strip():
                return error_result("Invalid Buy issue input.")
            data = {"description": description}
            for name, value in (("min_budget", min_budget), ("max_budget", max_budget)):
                if value is empty:
                    continue
                if value is not None and (
                    isinstance(value, bool) or not isinstance(value, (Decimal, int, str))
                    or (isinstance(value, str) and not value.strip())
                ):
                    return error_result("Invalid Buy issue input.")
                data[name] = value
            if preferences is not empty:
                if preferences is not None and (
                    not isinstance(preferences, dict)
                    or any(not isinstance(key, str) for key in preferences)
                ):
                    return error_result("Invalid Buy issue input.")
                # Reject non-JSON Python objects/nonfinite values before the
                # existing serializer normalizes the supported preferences.
                json.dumps(preferences, allow_nan=False)
                data["preferences"] = preferences

            serializer = BuyIssueSerializer(instance=issue, data=data, partial=issue is not None)
            if not serializer.is_valid():
                return error_result("Invalid Buy issue input.")
            if issue is None:
                issue = create_buy_issue(user, serializer.validated_data)
            else:
                issue = update_buy_issue(issue, serializer.validated_data)
            return tool_result(
                "ok",
                data={
                    "id": str(issue.id), "description": issue.description,
                    "min_budget": issue.min_budget, "max_budget": issue.max_budget,
                    "preferences": issue.preferences, "status": issue.status,
                },
                ids={"issue": {"type": "buy", "id": str(issue.id)}},
                provenance="own_buy_issues",
            )
    except (APIException, DjangoValidationError, ValueError, TypeError, OverflowError):
        return error_result("Invalid Buy issue input.")
    except DatabaseError:
        return error_result("Unable to save Buy issue.")
