"""Shared public contact projection; never supplement it from private records."""

from uuid import UUID

from django.db import DatabaseError
from rest_framework.exceptions import ValidationError

from agent.tools.result import error_result, tool_result
from common.validators import normalize_contact
from posts.models import Post


def get_post_contact(post_id):
    """Return only schema-valid public contact from a published Sell snapshot.

    Public post reads are AllowAny in the existing API, so no user/owner argument
    is accepted or needed. Publication is the approval/access gate. Missing,
    inaccessible, non-Sell, or contactless posts share the same empty response.
    """
    if not isinstance(post_id, (str, UUID)):
        return error_result("Invalid post identifier.")
    try:
        identifier = UUID(str(post_id))
    except ValueError:
        return error_result("Invalid post identifier.")

    try:
        post = Post.objects.filter(
            pk=identifier, issue_type=Post.IssueType.SELL, status=Post.Status.PUBLISHED,
        ).values("id", "post_data__contact").first()
        contact = None
        if post is not None:
            try:
                contact = normalize_contact(post["post_data__contact"])
            except (ValidationError, TypeError, ValueError):
                # A corrupt snapshot must not expose partially valid fields or
                # raw validation errors. Follow the publication validator as-is.
                contact = None
        if not contact:
            return tool_result("no_results", provenance="published_sell_posts")
        public_post_id = str(post["id"])
        return tool_result(
            "ok", data={"post_id": public_post_id, "contact": contact},
            ids={"post_id": public_post_id}, provenance="published_sell_posts",
        )
    except DatabaseError:
        return error_result("Public contact lookup is unavailable.")
