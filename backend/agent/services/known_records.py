"""Read fields off records whose ids are already known.

This does not create records and it is not an HTTP endpoint. The caller passes
ids that a previous turn already produced. Only rows owned by ``user`` are
returned, and blank values are left out.
"""

from uuid import UUID

from issues.models import BuyIssue, RepairIssue, SellIssue
from issues.photos import list_photos
from posts.models import Post
from vehicles.models import UsedCar
from common.validators import money_to_json

_ISSUE_MODELS = {"buy": BuyIssue, "sell": SellIssue, "repair": RepairIssue}
_CAR_FIELDS = ("make", "model", "year", "trim", "mileage", "condition")
_BUY_FIELDS = ("description", "min_budget", "max_budget", "preferences", "status")
_SELL_FIELDS = (
    "description",
    "asking_price",
    "condition_details",
    "known_damage",
    "location",
    "status",
)
_REPAIR_FIELDS = ("description", "symptoms", "status", "resolution_details")
_MONEY_FIELDS = {"min_budget", "max_budget", "asking_price"}
_POST_FIELDS = ("issue_id", "issue_type", "title", "content", "post_data", "status")


def _uuid(value):
    if isinstance(value, UUID):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _present(instance, names):
    data = {"id": str(instance.pk)}
    for name in names:
        value = getattr(instance, name)
        if value is None or value == "" or value == {}:
            continue
        if name in _MONEY_FIELDS:
            data[name] = money_to_json(value)
        elif isinstance(value, UUID):
            data[name] = str(value)
        else:
            data[name] = value
    return data


def _owned_issue(user, issue):
    if not isinstance(issue, dict):
        return None
    issue_type = issue.get("type")
    model = _ISSUE_MODELS.get(issue_type)
    issue_id = _uuid(issue.get("id"))
    if model is None or issue_id is None:
        return None
    row = model.objects.filter(pk=issue_id, user=user).first()
    if row is None:
        return None
    names = {"buy": _BUY_FIELDS, "sell": _SELL_FIELDS, "repair": _REPAIR_FIELDS}[issue_type]
    data = _present(row, names)
    data["type"] = issue_type
    if issue_type != "buy":
        data["used_car_id"] = str(row.used_car_id)
    return row, data


def extract_known_records(user, ids):
    """Return the caller's car, issue, post, and issue photos for ``ids``.

    ``ids`` may include ``used_car_id``, ``issue`` (``{"type", "id"}``), and
    ``post_id``. Unknown ids and other people's rows are omitted.
    """
    if not isinstance(ids, dict):
        raise TypeError("ids must be an object.")

    result = {"used_car": None, "issue": None, "post": None, "photos": []}

    car_id = _uuid(ids.get("used_car_id"))
    if car_id is not None:
        car = UsedCar.objects.filter(pk=car_id, owner=user).first()
        if car is not None:
            result["used_car"] = _present(car, _CAR_FIELDS)

    owned = _owned_issue(user, ids.get("issue"))
    if owned is not None:
        row, data = owned
        result["issue"] = data
        result["photos"] = list_photos(row)

    post_id = _uuid(ids.get("post_id"))
    if post_id is not None:
        post = Post.objects.filter(pk=post_id).first()
        if post is not None:
            owner_issue = _owned_issue(user, {"type": post.issue_type, "id": str(post.issue_id)})
            if owner_issue is not None:
                data = _present(post, _POST_FIELDS)
                if post.approved_at is not None:
                    data["approved_at"] = post.approved_at.isoformat()
                result["post"] = data

    return result
