"""Store private owner-reported outcomes, never mechanically verified diagnoses."""

import json
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, transaction
from rest_framework.exceptions import APIException

from agent.tools.result import error_result, tool_result
from issues.models import RepairIssue
from issues.serializers import ResolutionSerializer
from issues.services import record_resolution as persist_resolution
from vehicles.models import UsedCar


def record_resolution(repair_issue_id, resolution_details, *, user=None):
    """Accept the existing {status, resolution_details} resolution payload.

    Trusted server code supplies user. Status must explicitly be resolved,
    unresolved or unsure; work alone never implies a successful repair.
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
            try:
                if not isinstance(resolution_details, dict) or set(resolution_details) != {"status", "resolution_details"}:
                    return error_result("Invalid repair resolution data.")
                json.dumps(resolution_details, allow_nan=False)
                serializer = ResolutionSerializer(data=resolution_details)
                if not serializer.is_valid():
                    return error_result("Invalid repair resolution data.")
                status = serializer.validated_data["status"]
                details = serializer.validated_data["resolution_details"]
                description_field = "work_performed" if details["method"] == "mechanic" else "instructions"
                if not details.get(description_field):
                    return error_result("A meaningful repair outcome description is required.")
                RepairIssue._meta.get_field("resolution_details").clean(details, issue)
            except (APIException, DjangoValidationError, ValueError, TypeError, InvalidOperation, OverflowError, RecursionError):
                return error_result("Invalid repair resolution data.")
            identical = issue.status == status and issue.resolution_details == details
            if issue.status == RepairIssue.Status.RESOLVED and not identical:
                return error_result("An existing resolved outcome cannot be overwritten.")
            if not identical:
                persist_resolution(issue, status, details)
            # Shared JSON normalization stores fractional costs as floats. The
            # agent result contract instead requires Decimal/string amounts.
            result_details = dict(details)
            if "cost" in result_details:
                result_details["cost"] = Decimal(str(result_details["cost"]))
            return tool_result(
                "ok", data={"id": str(issue.id), "status": issue.status,
                            "resolution_details": result_details, "stored": True,
                            "owner_reported": True,
                            "limitations": ["Owner-reported outcome; not independently mechanically verified or a driving-safety assessment."]},
                ids={"issue": {"type": "repair", "id": str(issue.id)}},
                provenance="own_repair_issues",
            )
    except (APIException, DjangoValidationError, ValueError, TypeError, InvalidOperation, DatabaseError):
        return error_result("Unable to record repair resolution.")
