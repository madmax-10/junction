"""Agent 5 (post_gen) function tools.

Each tool reads the caller from ``tool_context.state["user_id"]``; none takes a
user id as an argument. Tools call the same services and serializers the posts
DRF views use, so validation and ownership rules are defined once.
"""

from decimal import Decimal

from agent.tools.coordinator_tools import _current_user
from agent.tools.result import error_result, tool_result
from django.core.exceptions import ValidationError as DjangoValidationError
from issues.photos import list_photos, relative_photo_path
from issues.services import get_owned_issue
from posts.models import Post
from posts.serializers import GeneratePostSerializer, PostUpdateSerializer
from posts.services import approve_post, generate_post, update_draft, user_owns_post
from rest_framework.exceptions import APIException, NotFound

POST_PROVENANCE = "own_posts"
ISSUE_PROVENANCE = "own_issue"
NOT_AUTHENTICATED = "Not authenticated."
HANDLED_ERRORS = (APIException, DjangoValidationError)


def _messages(detail, label=""):
    if isinstance(detail, dict):
        return [m for key, value in detail.items() for m in _messages(value, f"{label}{key}: ")]
    if isinstance(detail, (list, tuple)):
        return [m for item in detail for m in _messages(item, label)]
    return [f"{label}{detail}"]


def _error_message(exc):
    if isinstance(exc, DjangoValidationError):
        return "; ".join(exc.messages) or "Invalid input."
    return "; ".join(_messages(exc.detail)) or "Invalid input."


def _decimals(value):
    """Turn the floats that post_data stores for money into Decimals.

    Tool results reject floats (see tools/result.py), so money leaves as a string.
    """
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: _decimals(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_decimals(item) for item in value]
    return value


def _owned_post(user, post_id):
    try:
        post = Post.objects.get(pk=post_id)
    except (Post.DoesNotExist, DjangoValidationError, ValueError, TypeError):
        raise NotFound("Post not found.")
    if not user_owns_post(user, post):
        raise NotFound("Post not found.")
    return post


def _post_view(post):
    """The exact public snapshot the owner is asked to approve."""
    return {
        "id": post.id,
        "issue_type": post.issue_type,
        "issue_id": post.issue_id,
        "title": post.title,
        "content": post.content,
        "post_data": _decimals(post.post_data or {}),
        "status": post.status,
        "approved_at": post.approved_at,
    }


def _post_result(post):
    return tool_result(
        "ok",
        data=_post_view(post),
        ids={
            "post_id": post.id,
            "issue": {"type": post.issue_type, "id": post.issue_id},
        },
        provenance=POST_PROVENANCE,
    )


def _car_data(car):
    return {
        "make": car.make,
        "model": car.model,
        "year": car.year,
        "trim": car.trim,
        "mileage": car.mileage,
        "condition": car.condition,
    }


def _issue_data(issue_type, issue):
    """Only the facts the post templates use. Never ai_analysis or contact_info."""
    data = {
        "issue_type": issue_type,
        "status": issue.status,
        "description": issue.description,
    }
    if issue_type == "buy":
        data["min_budget"] = issue.min_budget
        data["max_budget"] = issue.max_budget
        data["preferences"] = issue.preferences
        return data
    data["car"] = _car_data(issue.used_car)
    if issue_type == "sell":
        data["asking_price"] = issue.asking_price
        data["condition_details"] = issue.condition_details
        data["known_damage"] = issue.known_damage
        data["location"] = issue.location
    else:
        data["symptoms"] = issue.symptoms
        data["resolution_details"] = _decimals(issue.resolution_details)
    return data


def get_issue_context(issue_type: str, issue_id: str, tool_context) -> dict:
    """Return the facts to write a post from, for one issue the user owns.

    Call this first, and write the post only from what it returns. For a repair
    the fix comes only from resolution_details. Contact details are not included:
    ask the user which ones to publish.

    Args:
        issue_type: "buy", "sell" or "repair".
        issue_id: The id of the user's issue.
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result(NOT_AUTHENTICATED, provenance=ISSUE_PROVENANCE)
    try:
        issue = get_owned_issue(user, issue_type, issue_id)
    except HANDLED_ERRORS:
        return error_result("Issue not found.", provenance=ISSUE_PROVENANCE)

    data = _issue_data(issue_type, issue)
    data["photo_filenames"] = [photo["filename"] for photo in list_photos(issue)]
    data["existing_posts"] = [
        {"id": post.id, "status": post.status, "title": post.title}
        for post in Post.objects.filter(issue_type=issue_type, issue_id=issue.id).exclude(
            status=Post.Status.ARCHIVED
        )
    ]
    ids = {"issue": {"type": issue_type, "id": issue.id}}
    if issue_type != "buy":
        ids["used_car_id"] = issue.used_car_id
    return tool_result("ok", data=data, ids=ids, provenance=ISSUE_PROVENANCE)


def save_post_draft(
    issue_type: str,
    issue_id: str,
    title: str,
    content: str,
    tool_context,
    post_data: dict | None = None,
) -> dict:
    """Save a private draft post for one of the user's issues. Nothing is public yet.

    Show the returned title, content and post_data to the user and wait for their
    approval before publishing. A repair needs its outcome recorded first.

    Args:
        issue_type: "buy", "sell" or "repair".
        issue_id: The id of the user's issue.
        title: The post title.
        content: The post text, written in the user's own voice.
        post_data: Optional fields that add to or override the ones taken from the
            issue (for example contact the user approved, location, photos).
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result(NOT_AUTHENTICATED, provenance=POST_PROVENANCE)
    try:
        issue = get_owned_issue(user, issue_type, issue_id)
        if issue_type == "repair" and not issue.resolution_details:
            return error_result(
                "Record the repair outcome before drafting a post.",
                provenance=POST_PROVENANCE,
            )
        draft = Post.objects.filter(
            issue_type=issue_type, issue_id=issue.id, status=Post.Status.DRAFT
        ).first()
        if draft is not None:
            return error_result(
                f"A draft already exists for this issue (post id {draft.id}). "
                "Use update_post_draft to change it.",
                provenance=POST_PROVENANCE,
            )
        payload = {
            "issue_type": issue_type,
            "issue_id": issue_id,
            "title": title or "",
            "content": content or "",
        }
        if post_data:
            payload["post_data"] = post_data
        serializer = GeneratePostSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        valid = serializer.validated_data
        post = generate_post(
            user,
            valid["issue_type"],
            valid["issue_id"],
            title=valid.get("title", ""),
            content=valid.get("content", ""),
            post_data=valid.get("post_data"),
        )
    except HANDLED_ERRORS as exc:
        return error_result(_error_message(exc), provenance=POST_PROVENANCE)
    return _post_result(post)


def _apply_changes(user, post, changes):
    """Validate ``changes`` like PATCH /api/posts/{id}/ does, then save them."""
    serializer = PostUpdateSerializer(post, data=changes, partial=True)
    serializer.is_valid(raise_exception=True)
    return update_draft(user, post, serializer.validated_data)


def update_post_draft(
    post_id: str,
    tool_context,
    title: str = "",
    content: str = "",
    post_data: dict | None = None,
) -> dict:
    """Apply the user's edits to one of their drafts, or re-show it if nothing changed.

    post_data is merged into the draft's existing fields, so send only the fields
    that change. A field set to null is removed. Only drafts can be edited.

    Args:
        post_id: The id of the user's draft post.
        title: New title, or empty to keep the current one.
        content: New post text, or empty to keep the current one.
        post_data: Fields to add, change or (with null) remove.
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result(NOT_AUTHENTICATED, provenance=POST_PROVENANCE)
    try:
        post = _owned_post(user, post_id)
        if post.status != Post.Status.DRAFT:
            return error_result("Only drafts can be edited.", provenance=POST_PROVENANCE)
        changes = {}
        if title and title.strip():
            changes["title"] = title
        if content and content.strip():
            changes["content"] = content
        if post_data:
            merged = dict(post.post_data or {})
            for key, value in post_data.items():
                if value is None:
                    merged.pop(key, None)
                else:
                    merged[key] = value
            changes["post_data"] = merged
        if changes:
            post = _apply_changes(user, post, changes)
    except HANDLED_ERRORS as exc:
        return error_result(_error_message(exc), provenance=POST_PROVENANCE)
    return _post_result(post)


def select_post_images(post_id: str, filenames: list[str], tool_context) -> dict:
    """Choose which of the issue's photos a draft post shows. Send an empty list for none.

    Use the photo_filenames from get_issue_context. This replaces the draft's
    current photo selection; its other fields are kept.

    Args:
        post_id: The id of the user's draft post.
        filenames: Photo filenames from the post's own issue.
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result(NOT_AUTHENTICATED, provenance=POST_PROVENANCE)
    try:
        post = _owned_post(user, post_id)
        if post.status != Post.Status.DRAFT:
            return error_result("Only drafts can be edited.", provenance=POST_PROVENANCE)
        if not isinstance(filenames, list) or not all(isinstance(name, str) for name in filenames):
            return error_result("filenames must be a list of names.", provenance=POST_PROVENANCE)
        merged = dict(post.post_data or {})
        merged.pop("photos", None)
        if filenames:
            merged["photos"] = [
                relative_photo_path(post.issue_type, post.issue_id, name) for name in filenames
            ]
        post = _apply_changes(user, post, {"post_data": merged})
    except HANDLED_ERRORS as exc:
        return error_result(_error_message(exc), provenance=POST_PROVENANCE)
    return _post_result(post)


def approve_and_publish_post(post_id: str, tool_context) -> dict:
    """Publish the user's draft. Call only after they clearly said yes in this turn.

    Only the draft you last saved or showed can be published. Publishing an
    already published post is safe and changes nothing.

    Args:
        post_id: The id of the draft the user just approved.
    """
    user = _current_user(tool_context)
    if user is None:
        return error_result(NOT_AUTHENTICATED, provenance=POST_PROVENANCE)
    try:
        post = _owned_post(user, post_id)
        if post.status != Post.Status.PUBLISHED:
            if str(post.id) != tool_context.state.get("draft_post_id"):
                return error_result(
                    "Only the draft you just showed can be published. "
                    "Show it with update_post_draft first.",
                    provenance=POST_PROVENANCE,
                )
            post = approve_post(user, post.id)
    except HANDLED_ERRORS as exc:
        return error_result(_error_message(exc), provenance=POST_PROVENANCE)
    return _post_result(post)
