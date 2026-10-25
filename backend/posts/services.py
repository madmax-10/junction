from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound

from common.validators import PREFERENCE_KEYS
from issues.services import ISSUE_MODELS, get_owned_issue
from posts.models import Post
from posts.validation import normalize_post_data


def user_owns_post(user, post):
    if not getattr(user, "is_authenticated", False):
        return False
    model = ISSUE_MODELS.get(post.issue_type)
    if model is None:
        return False
    return model.objects.filter(pk=post.issue_id, user=user).exists()


def can_read_post(user, post):
    if post.status == Post.Status.PUBLISHED:
        return True
    return user_owns_post(user, post)


def posts_for_user(user):
    buy_ids = ISSUE_MODELS["buy"].objects.filter(user=user).values_list("id", flat=True)
    sell_ids = ISSUE_MODELS["sell"].objects.filter(user=user).values_list("id", flat=True)
    repair_ids = ISSUE_MODELS["repair"].objects.filter(user=user).values_list("id", flat=True)
    return Post.objects.filter(
        Q(issue_type=Post.IssueType.BUY, issue_id__in=buy_ids)
        | Q(issue_type=Post.IssueType.SELL, issue_id__in=sell_ids)
        | Q(issue_type=Post.IssueType.REPAIR, issue_id__in=repair_ids)
    )


def _build_sell_snapshot(issue):
    car = issue.used_car
    data = {
        "make": car.make,
        "model": car.model,
        "year": car.year,
        "mileage": car.mileage,
    }
    if car.trim:
        data["trim"] = car.trim
    if issue.asking_price is not None:
        data["asking_price"] = issue.asking_price
    if issue.condition_details:
        data["condition_details"] = issue.condition_details
    if issue.known_damage:
        data["known_damage"] = issue.known_damage
    if issue.location:
        data["location"] = issue.location
    return data


def _build_buy_snapshot(issue):
    data = {}
    if issue.min_budget is not None:
        data["min_budget"] = issue.min_budget
    if issue.max_budget is not None:
        data["max_budget"] = issue.max_budget
    preferences = issue.preferences or {}
    for key in PREFERENCE_KEYS:
        if key in preferences:
            data[key] = preferences[key]
    return data


def _build_repair_snapshot(issue):
    car = issue.used_car
    data = {
        "make": car.make,
        "model": car.model,
        "year": car.year,
        "mileage": car.mileage,
        "owner_reported": True,
    }
    if car.trim:
        data["trim"] = car.trim
    if issue.symptoms:
        data["symptoms"] = issue.symptoms
    details = issue.resolution_details or {}
    if details.get("method"):
        data["method"] = details["method"]
    work_performed = details.get("work_performed") or details.get("instructions")
    if work_performed:
        data["work_performed"] = work_performed
    if details.get("cost") is not None:
        data["cost"] = details["cost"]
    if details.get("mechanic_name"):
        data["mechanic_name"] = details["mechanic_name"]
    if details.get("location"):
        data["location"] = details["location"]
    return data


def _build_snapshot(issue_type, issue):
    if issue_type == Post.IssueType.SELL:
        return _build_sell_snapshot(issue)
    if issue_type == Post.IssueType.BUY:
        return _build_buy_snapshot(issue)
    return _build_repair_snapshot(issue)


def _default_title(issue_type, issue):
    if issue_type == Post.IssueType.SELL:
        car = issue.used_car
        return f"{car.year} {car.make} {car.model} for sale"[:255]
    if issue_type == Post.IssueType.REPAIR:
        car = issue.used_car
        return f"Repair notes for {car.year} {car.make} {car.model}"[:255]
    makes = (issue.preferences or {}).get("preferred_makes") or []
    if makes:
        return f"Looking for {', '.join(makes)}"[:255]
    return "Looking to buy a car"


@transaction.atomic
def generate_post(user, issue_type, issue_id, title="", content="", post_data=None):
    issue = get_owned_issue(user, issue_type, issue_id)
    snapshot = _build_snapshot(issue_type, issue)
    if post_data:
        snapshot.update(post_data)
    if issue_type == Post.IssueType.REPAIR:
        snapshot["owner_reported"] = True
    snapshot = normalize_post_data(issue_type, issue.id, snapshot)
    title = (title or "").strip() or _default_title(issue_type, issue)
    content = (content or "").strip() or issue.description.strip()
    if not title:
        raise serializers.ValidationError({"title": "Title is required."})
    if not content:
        raise serializers.ValidationError({"content": "Content is required."})
    return Post.objects.create(
        issue_id=issue.id,
        issue_type=issue_type,
        title=title,
        content=content,
        post_data=snapshot,
        status=Post.Status.DRAFT,
    )


def update_draft(user, post, data):
    if not user_owns_post(user, post):
        raise NotFound("Post not found.")
    if post.status != Post.Status.DRAFT:
        raise serializers.ValidationError("Only drafts can be edited.")
    if "title" in data:
        post.title = data["title"].strip()
    if "content" in data:
        post.content = data["content"].strip()
    if "post_data" in data:
        post.post_data = data["post_data"]
    if not post.title:
        raise serializers.ValidationError({"title": "Title is required."})
    if not post.content:
        raise serializers.ValidationError({"content": "Content is required."})
    post.save()
    return post


@transaction.atomic
def approve_post(user, post_id):
    try:
        post = Post.objects.select_for_update().get(pk=post_id)
    except Post.DoesNotExist:
        raise NotFound("Post not found.")
    if not user_owns_post(user, post):
        raise NotFound("Post not found.")
    if post.status == Post.Status.PUBLISHED:
        return post
    if post.status == Post.Status.ARCHIVED:
        raise serializers.ValidationError("Archived posts cannot be published.")
    post.post_data = normalize_post_data(
        post.issue_type,
        post.issue_id,
        post.post_data or {},
        publishing=True,
    )
    post.status = Post.Status.PUBLISHED
    post.approved_at = timezone.now()
    post.save(update_fields=["post_data", "status", "approved_at", "updated_at"])
    return post


def delete_post(user, post):
    owns = user_owns_post(user, post)
    if post.status == Post.Status.DRAFT:
        if not owns:
            raise NotFound("Post not found.")
        post.delete()
        return
    if owns or (user.is_staff and post.status == Post.Status.PUBLISHED):
        post.status = Post.Status.ARCHIVED
        post.save(update_fields=["status", "updated_at"])
        return
    raise NotFound("Post not found.")
