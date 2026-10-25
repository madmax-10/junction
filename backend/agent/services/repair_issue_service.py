"""Create an owned private repair report without diagnosis or publication."""

from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, transaction
from rest_framework.exceptions import APIException

from agent.tools.result import error_result, tool_result
from issues.serializers import RepairIssueSerializer
from issues.services import create_repair_issue as create_repair_issue_record
from vehicles.models import UsedCar


def create_repair_issue(used_car_id, description=None, *, user):
    """Save a new repair report for an authenticated user's registered vehicle.

    User is supplied by trusted server code, not by a model-generated identity.
    Missing/malformed/foreign vehicle IDs share one generic error. The existing
    serializer and issue service own validation/persistence. No previous issue
    is resumed and no symptoms, AI analysis, costs or resolutions are generated.
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

        with transaction.atomic():
            car = UsedCar.objects.select_for_update().filter(pk=vehicle_id, owner=user).first()
            if car is None:
                return error_result("Vehicle not found.")
            if not isinstance(description, str) or not description.strip():
                return error_result("Invalid repair issue description.")
            serializer = RepairIssueSerializer(data={"used_car": car.id, "description": description})
            serializer.fields["used_car"].queryset = UsedCar.objects.filter(pk=car.id, owner=user)
            if not serializer.is_valid():
                return error_result("Invalid repair issue description.")
            issue = create_repair_issue_record(user, serializer.validated_data)
            return tool_result(
                "ok",
                data={"id": str(issue.id), "used_car_id": str(car.id),
                      "description": issue.description, "status": issue.status},
                ids={"used_car_id": str(car.id), "issue": {"type": "repair", "id": str(issue.id)}},
                provenance="own_repair_issues",
            )
    except (APIException, DjangoValidationError, ValueError, TypeError):
        return error_result("Unable to create repair issue.")
    except DatabaseError:
        return error_result("Unable to create repair issue.")
