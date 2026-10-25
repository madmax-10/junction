"""Allowlisted ORM snapshots referenced by this turn, not LLM-created records."""

from uuid import UUID

from django.db.models import Q
from rest_framework import serializers

from issues.models import BuyIssue, RepairIssue, SellIssue
from posts.models import Post
from posts.services import posts_for_user
from vehicles.models import UsedCar
from agent.schemas import DatabaseOperation

DATABASE_READS = {
    "get_user_context", "get_vehicle_details", "get_issue_context", "calculate_value_range",
    "search_and_rank_used", "search_new_catalog", "get_post_contact", "find_and_rank_buyers",
    "search_similar_repairs", "estimate_repair_cost", "recommend_asking_price",
}
DATABASE_WRITES = {
    "register_used_car", "create_or_update_buy_issue", "create_or_update_sell_issue",
    "create_repair_issue", "save_diagnosis", "record_resolution", "save_post_draft",
    "update_post_draft", "select_post_images", "approve_and_publish_post",
}


def database_operations(events):
    """Only actual function responses establish outcomes, never agent prose."""
    operations = []
    for event in events:
        if event.get("kind") != "tool_response":
            continue
        name = event.get("name")
        if name not in DATABASE_READS | DATABASE_WRITES:
            continue
        result = event["response"]
        operations.append(DatabaseOperation(
            agent=event["author"], tool=name, call_id=event["call_id"],
            operation="write" if name in DATABASE_WRITES else "read",
            status=result["status"], succeeded=result["status"] == "ok",
            ids=result["ids"], error=result["error"],
        ).model_dump(mode="json"))
    return operations


class VehicleRecord(serializers.ModelSerializer):
    class Meta:
        model = UsedCar
        fields = ("id", "make", "model", "year", "trim", "mileage", "condition", "created_at")


class BuyRecord(serializers.ModelSerializer):
    class Meta:
        model = BuyIssue
        fields = ("id", "description", "min_budget", "max_budget", "preferences", "status", "created_at", "updated_at")


class SellRecord(serializers.ModelSerializer):
    class Meta:
        model = SellIssue
        fields = ("id", "used_car_id", "description", "asking_price", "condition_details", "known_damage", "location", "status", "created_at", "updated_at")


class RepairRecord(serializers.ModelSerializer):
    class Meta:
        model = RepairIssue
        fields = ("id", "used_car_id", "description", "symptoms", "ai_analysis", "status", "resolution_details", "resolved_at", "created_at", "updated_at")


class PostRecord(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = ("id", "issue_id", "issue_type", "title", "status", "approved_at", "created_at", "updated_at")


def database_records(user, events):
    """Recheck every referenced ID against the authenticated user's access."""
    ids = {name: set() for name in ("used_cars", "buy_issues", "sell_issues", "repair_issues", "posts")}
    issue_tables = {"buy": "buy_issues", "sell": "sell_issues", "repair": "repair_issues"}

    def add(table, values):
        if not isinstance(values, (list, tuple)):
            return
        for value in values:
            try:
                ids[table].add(UUID(str(value)))
            except (ValueError, TypeError, AttributeError):
                continue

    for event in events:
        if event.get("kind") != "tool_response":
            continue
        response = event.get("response", {})
        if not isinstance(response, dict) or response.get("status") not in {"ok", "insufficient_data"}:
            continue
        references = response.get("ids") or {}
        if not isinstance(references, dict):
            continue
        add("used_cars", [references.get("used_car_id")])
        add("used_cars", references.get("used_car_ids"))
        add("posts", [references.get("post_id")])
        add("posts", references.get("post_ids"))
        add("posts", references.get("draft_post_ids"))
        issue = references.get("issue") or {}
        if isinstance(issue, dict) and issue.get("type") in issue_tables:
            add(issue_tables[issue["type"]], [issue.get("id")])
        issue_ids = references.get("issue_ids") or {}
        if not isinstance(issue_ids, dict):
            continue
        for kind, values in issue_ids.items():
            if kind in issue_tables:
                add(issue_tables[kind], values)

    queries = {
        "used_cars": (VehicleRecord, UsedCar.objects.filter(owner=user)),
        "buy_issues": (BuyRecord, BuyIssue.objects.filter(user=user)),
        "sell_issues": (SellRecord, SellIssue.objects.filter(user=user, used_car__owner=user)),
        "repair_issues": (RepairRecord, RepairIssue.objects.filter(user=user, used_car__owner=user)),
        "posts": (PostRecord, Post.objects.filter(
            Q(pk__in=posts_for_user(user).values("pk"))
            | Q(status=Post.Status.PUBLISHED, approved_at__isnull=False))),
    }
    return {
        table: serializer(query.filter(pk__in=ids[table]).order_by("id"), many=True).data
        for table, (serializer, query) in queries.items()
    }
