"""Agent 1 (coordinator) function tools.

Each tool reads the caller from ``tool_context.state["user_id"]``; none takes a
user id as an argument. Tools call the same services the DRF views use.
"""

from accounts.models import User
from agent.tools.result import error_result, tool_result
from django.core.exceptions import ValidationError as DjangoValidationError
from issues.services import ISSUE_MODELS
from posts.models import Post
from posts.services import posts_for_user
from rest_framework import serializers
from vehicles.models import UsedCar
from vehicles.serializers import UsedCarSerializer
from vehicles.services import create_used_car

PROVENANCE = "own_used_cars"
OPEN_STATUS = "open"
DESCRIPTION_LIMIT = 300


def _current_user(tool_context):
    user_id = tool_context.state.get("user_id")
    if not user_id:
        return None
    try:
        return User.objects.get(pk=user_id, is_active=True)
    except (User.DoesNotExist, DjangoValidationError, ValueError, TypeError):
        return None


def _car_data(car):
    return {
        "id": car.id,
        "make": car.make,
        "model": car.model,
        "year": car.year,
        "trim": car.trim,
        "mileage": car.mileage,
        "condition": car.condition,
    }


def _issue_data(issue):
    data = {
        "id": issue.id,
        "type": issue.issue_type,
        "status": issue.status,
        "description": issue.description[:DESCRIPTION_LIMIT],
        "used_car_id": getattr(issue, "used_car_id", None),
    }
    return data


def _post_data(post):
    return {
        "id": post.id,
        "issue_type": post.issue_type,
        "issue_id": post.issue_id,
        "title": post.title,
        "status": post.status,
    }


def _validation_message(exc):
    parts = []
    for field, errors in exc.detail.items():
        first = errors[0] if isinstance(errors, list) else errors
        parts.append(f"{field}: {first}")
    return "; ".join(parts) or "Invalid input."


def get_vehicle_details(used_car_id: str, tool_context) -> dict:
    """Return one car the user owns: make, model, year, trim, mileage and condition.

    Args:
        used_car_id: The id of one of the user's registered cars.
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result("Not authenticated.", provenance=PROVENANCE)
    try:
        car = UsedCar.objects.get(pk=used_car_id, owner=user)
    except (UsedCar.DoesNotExist, DjangoValidationError, ValueError, TypeError):
        return error_result("Car not found.", provenance=PROVENANCE)
    return tool_result(
        "ok",
        data=_car_data(car),
        ids={"used_car_id": car.id},
        provenance=PROVENANCE,
    )


def get_user_context(tool_context) -> dict:
    """Return the user's registered cars, open issues and draft posts.

    Use this first on every conversation to resolve phrases like "my Civic" to a
    car id, and to resume an open issue instead of creating a duplicate.
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result("Not authenticated.", provenance="own_records")

    cars = list(UsedCar.objects.filter(owner=user))
    issues = {
        issue_type: list(
            model.objects.filter(user=user, status=OPEN_STATUS).order_by("-created_at")
        )
        for issue_type, model in ISSUE_MODELS.items()
    }
    drafts = list(posts_for_user(user).filter(status=Post.Status.DRAFT))

    data = {
        "user": {"name": user.name},
        "used_cars": [_car_data(car) for car in cars],
        "open_issues": {t: [_issue_data(i) for i in items] for t, items in issues.items()},
        "draft_posts": [_post_data(post) for post in drafts],
    }
    ids = {
        "used_car_ids": [car.id for car in cars],
        "issue_ids": {t: [i.id for i in items] for t, items in issues.items()},
        "draft_post_ids": [post.id for post in drafts],
    }
    return tool_result("ok", data=data, ids=ids, provenance="own_records")


def register_used_car(
    make: str,
    model: str,
    year: int,
    mileage: int,
    tool_context,
    trim: str = "",
    condition: str = "",
) -> dict:
    """Register a car for the user. Confirm the details with the user before calling.

    Args:
        make: Manufacturer, e.g. "Honda".
        model: Model name, e.g. "Civic".
        year: Model year.
        mileage: Odometer reading in miles.
        trim: Optional trim level.
        condition: Optional short description of the car's condition.
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result("Not authenticated.", provenance=PROVENANCE)
    serializer = UsedCarSerializer(
        data={
            "make": make,
            "model": model,
            "year": year,
            "mileage": mileage,
            "trim": trim or "",
            "condition": condition or "",
        }
    )
    try:
        serializer.is_valid(raise_exception=True)
    except serializers.ValidationError as exc:
        return error_result(_validation_message(exc), provenance=PROVENANCE)
    car = create_used_car(user, serializer.validated_data)
    return tool_result(
        "ok",
        data=_car_data(car),
        ids={"used_car_id": car.id},
        provenance=PROVENANCE,
    )
