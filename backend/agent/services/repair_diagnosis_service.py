"""Persist preliminary repair information supplied by trusted server code."""

import json
from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, transaction
from rest_framework.exceptions import APIException

from agent.tools.result import error_result, tool_result
from issues.models import RepairIssue
from issues.serializers import RepairIssueSerializer
from vehicles.models import UsedCar


def save_diagnosis(repair_issue_id, symptoms, ai_analysis, *, user=None):
    """Replace the two analysis fields on an owned issue; never confirm a repair.

    ``user`` must come from authenticated request.user or the shared ADK bridge,
    never from model/client ownership claims. Existing serializer schemas govern
    normalization, including required uncertainty on each possible cause.
    """
    try:
        if (
            not isinstance(user, get_user_model()) or not user.is_authenticated
            or not user.is_active or user._state.adding
            or not get_user_model().objects.filter(pk=user.pk, is_active=True).exists()
        ):
            return error_result("Authentication is required.")
        if not isinstance(repair_issue_id, (str, UUID)):
            return error_result("Repair issue not found.")
        try:
            issue_id = UUID(str(repair_issue_id))
        except ValueError:
            return error_result("Repair issue not found.")

        with transaction.atomic():
            issue = RepairIssue.objects.select_for_update().filter(pk=issue_id, user=user).first()
            if issue is None:
                return error_result("Repair issue not found.")
            car = UsedCar.objects.select_for_update().filter(pk=issue.used_car_id, owner=user).first()
            if car is None:
                return error_result("Repair issue not found.")
            # Check raw JSON before normalizers can discard optional empty values.
            try:
                json.dumps(symptoms, allow_nan=False)
                json.dumps(ai_analysis, allow_nan=False)
                serializer = RepairIssueSerializer(
                    issue, data={"symptoms": symptoms, "ai_analysis": ai_analysis}, partial=True,
                )
                if not serializer.is_valid():
                    return error_result("Invalid repair diagnosis data.")
                for field in ("symptoms", "ai_analysis"):
                    value = serializer.validated_data[field]
                    RepairIssue._meta.get_field(field).clean(value, issue)
                    setattr(issue, field, value)
            except (APIException, DjangoValidationError, ValueError, TypeError, RecursionError):
                return error_result("Invalid repair diagnosis data.")
            issue.save(update_fields=["symptoms", "ai_analysis"])
            return tool_result(
                "ok", data={"id": str(issue.id), "status": issue.status},
                ids={"issue": {"type": "repair", "id": str(issue.id)}},
                provenance="own_repair_issues",
            )
    except (APIException, DjangoValidationError, ValueError, TypeError, DatabaseError):
        return error_result("Unable to save repair diagnosis.")
