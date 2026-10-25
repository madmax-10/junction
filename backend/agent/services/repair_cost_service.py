"""Authorized cost-service boundary; unsupported prices never become estimates."""

from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import DatabaseError

from agent.tools.result import error_result, tool_result
from issues.models import RepairIssue
from issues.serializers import RepairIssueSerializer


def estimate_repair_cost(repair_issue_id, *, user=None):
    """Return insufficient_data until a trustworthy repair-pricing contract exists.

    Trusted server code supplies the authenticated Django user. Existing public
    Repair snapshots cannot establish currency or complete-repair cost scope;
    keyword similarity and preliminary AI hypotheses cannot establish a procedure.
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
        issue = RepairIssue.objects.filter(
            pk=issue_id, user=user, used_car__owner=user,
        ).select_related("used_car").first()
        if issue is None:
            return error_result("Repair issue not found.")
        criteria = RepairIssueSerializer(issue, data={
            "symptoms": issue.symptoms, "ai_analysis": issue.ai_analysis,
        }, partial=True)
        if not criteria.is_valid():
            return error_result("Invalid saved repair diagnosis data.")
        return tool_result(
            "insufficient_data",
            data={
                "id": str(issue.id), "status": "insufficient_data",
                "currency": None, "low": None, "median": None, "high": None,
                "evidence_count": 0, "evidence_type": None, "source_post_ids": [],
                "limitations": [
                    "Public Repair costs lack a supported currency and complete-repair cost-scope contract. "
                    "No trustworthy structured repair-pricing integration is implemented.",
                    "Reported symptoms and preliminary AI analysis do not establish a confirmed comparable "
                    "repair procedure; documented work alone does not establish equivalent cost coverage.",
                    "No numerical range or fallback price is justified. Owner-reported historical expenses "
                    "are not current local mechanic quotes or verified market prices.",
                    "This service does not diagnose faults, recommend a procedure or establish driving safety. "
                    "Low cost would not establish safety with brake failure, steering problems, fuel leaks, "
                    "smoke/fire, severe overheating or sudden power loss.",
                ],
            },
            ids={"issue": {"type": "repair", "id": str(issue.id)}, "post_ids": []},
            provenance="own_repair_issues",
        )
    except (ValueError, TypeError):
        return error_result("Invalid saved repair diagnosis data.")
    except DatabaseError:
        return error_result("Repair cost evidence is unavailable.")
