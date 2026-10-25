from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from issues.models import BuyIssue, RepairIssue, SellIssue
from issues.photos import remove_photo_directory

ISSUE_MODELS = {
    "buy": BuyIssue,
    "sell": SellIssue,
    "repair": RepairIssue,
}


def get_owned_issue(user, issue_type, issue_id):
    model = ISSUE_MODELS.get(issue_type)
    if model is None or not user.is_authenticated:
        raise NotFound("Issue not found.")
    queryset = model.objects.select_related("user")
    if issue_type != "buy":
        queryset = queryset.select_related("used_car")
    try:
        issue = queryset.get(pk=issue_id)
    except model.DoesNotExist:
        raise NotFound("Issue not found.")
    if issue.user_id != user.id:
        raise NotFound("Issue not found.")
    return issue


def _require_owned_car(user, car):
    if car.owner_id != user.id:
        from rest_framework import serializers

        raise serializers.ValidationError({"used_car": "You can only use a car you own."})


def create_buy_issue(user, data):
    return BuyIssue.objects.create(user=user, **data)


def update_buy_issue(issue, data):
    for field, value in data.items():
        setattr(issue, field, value)
    issue.save()
    return issue


def create_sell_issue(user, data):
    _require_owned_car(user, data["used_car"])
    return SellIssue.objects.create(user=user, **data)


def update_sell_issue(issue, data):
    if "used_car" in data:
        _require_owned_car(issue.user, data["used_car"])
    for field, value in data.items():
        setattr(issue, field, value)
    issue.save()
    return issue


def create_repair_issue(user, data):
    _require_owned_car(user, data["used_car"])
    return RepairIssue.objects.create(user=user, **data)


def update_repair_issue(issue, data):
    if "used_car" in data:
        _require_owned_car(issue.user, data["used_car"])
    for field, value in data.items():
        setattr(issue, field, value)
    issue.save()
    return issue


def record_resolution(issue, status, resolution_details):
    issue.status = status
    issue.resolution_details = resolution_details
    if status == RepairIssue.Status.RESOLVED:
        issue.resolved_at = timezone.now()
    else:
        issue.resolved_at = None
    issue.save(update_fields=["status", "resolution_details", "resolved_at", "updated_at"])
    return issue


def delete_issue(issue):
    from posts.models import Post

    issue_type = issue.issue_type
    issue_id = issue.id
    with transaction.atomic():
        Post.objects.filter(issue_id=issue_id, issue_type=issue_type).update(
            status=Post.Status.ARCHIVED,
            updated_at=timezone.now(),
        )
        issue.delete()
    remove_photo_directory(issue_type, issue_id)
