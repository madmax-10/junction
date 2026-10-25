"""Read-only owned-vehicle context for the future Seller workflow."""

from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import DatabaseError

from agent.tools.result import error_result, tool_result
from vehicles.models import UsedCar


def get_vehicle_details(used_car_id, *, user=None):
    """Return allowlisted details of one vehicle owned by a trusted Django user.

    Server callers supply request.user or the existing authenticated ADK bridge's
    user, never a client/model ownership claim or mutable session identity.
    """
    try:
        if (
            not isinstance(user, get_user_model()) or not user.is_authenticated
            or not user.is_active or user._state.adding
            or not get_user_model().objects.filter(pk=user.pk, is_active=True).exists()
        ):
            return error_result("Authentication is required.")
        if not isinstance(used_car_id, (str, UUID)):
            return error_result("Car not found.", provenance="own_used_cars")
        try:
            car_id = UUID(str(used_car_id))
        except ValueError:
            return error_result("Car not found.", provenance="own_used_cars")
        car = UsedCar.objects.filter(pk=car_id, owner=user).values(
            "id", "make", "model", "year", "trim", "mileage", "condition",
        ).first()
        if car is None:
            return error_result("Car not found.", provenance="own_used_cars")
        return tool_result("ok", data=car, ids={"used_car_id": car["id"]}, provenance="own_used_cars")
    except DatabaseError:
        return error_result("Unable to retrieve vehicle details.")
