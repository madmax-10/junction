"""Deterministic private-report to public owner-experience matching."""

import re
from uuid import UUID

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from rest_framework.exceptions import ValidationError

from agent.tools.result import error_result, tool_result
from issues.models import RepairIssue
from issues.serializers import RepairIssueSerializer
from posts.models import Post
from posts.validation import normalize_post_data


def search_similar_repairs(repair_issue_id, limit=5, location=None, *, user=None):
    """Search at most 500 approved public snapshots; never infer a diagnosis.

    Trusted server code supplies request.user or the shared authenticated ADK
    bridge's user. Keyword scores express text overlap, not mechanical certainty.

    When location (a city the owner stated) is given, only experiences whose public
    location contains that city are returned; data["location"]["local_matches_found"]
    tells the caller whether to fall back to a live business search for that city.
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
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10:
            return error_result("limit must be an integer between 1 and 10.")
        if location is not None:
            if not isinstance(location, str) or not location.strip() or len(location) > 255:
                return error_result("location must be a nonblank string up to 255 characters.")
            city = location.split(",")[0].strip().casefold()
        criteria = RepairIssueSerializer(issue, data={
            "symptoms": issue.symptoms, "ai_analysis": issue.ai_analysis,
        }, partial=True)
        if not criteria.is_valid():
            return error_result("Invalid saved repair diagnosis data.")
        symptoms = criteria.validated_data["symptoms"] or {}
        # Preliminary analysis is read/validated but never used as observed fact.
        stopwords = {
            "the", "and", "with", "when", "this", "that", "have", "has", "had",
            "was", "are", "for", "from", "car", "vehicle", "repair", "issue",
            "problem", "some", "after", "before", "not", "but", "its", "can",
        }
        symptom_text = " ".join(symptoms.get("confirmed", []) + symptoms.get("inferred", []))
        symptom_terms = set(re.findall(r"[a-z0-9]{3,}", symptom_text.casefold())) - stopwords
        description_terms = set(re.findall(r"[a-z0-9]{3,}", issue.description[:4000].casefold())) - stopwords
        query_terms = symptom_terms | description_terms
        ranked = []
        candidates = Post.objects.filter(
            issue_type=Post.IssueType.REPAIR, status=Post.Status.PUBLISHED,
            approved_at__isnull=False, post_data__owner_reported=True,
        ).order_by("-created_at", "id").values("id", "issue_id", "title", "post_data")[:500]
        for post in candidates if query_terms else ():
            raw = post["post_data"]
            if not isinstance(raw, dict) or raw.get("owner_reported") is not True:
                continue
            # Use only this operation's approved snapshot fields, never contacts,
            # source issue details, internal analysis or arbitrary extra keys.
            public = {key: raw[key] for key in (
                "make", "model", "symptoms", "method", "work_performed", "cost",
                "insurance_settlement", "owner_reported", "location",
            ) if key in raw}
            try:
                public = normalize_post_data("repair", post["issue_id"], public, publishing=True)
            except (ValidationError, ValueError, TypeError):
                continue
            if location is not None and city not in str(public.get("location", "")).casefold():
                continue
            public_symptoms = public.get("symptoms") or {}
            reported = " ".join(public_symptoms.get("confirmed", []) + public_symptoms.get("inferred", []))
            problem_text = post["title"][:1000] + " " + reported
            public_terms = set(re.findall(r"[a-z0-9]{3,}", problem_text.casefold())) - stopwords
            symptom_overlap = symptom_terms & public_terms
            description_overlap = (description_terms - symptom_terms) & public_terms
            outcome_terms = set(re.findall(r"[a-z0-9]{3,}", public.get("work_performed", "").casefold())) - stopwords
            outcome_overlap = query_terms & outcome_terms
            if not (symptom_overlap or description_overlap or outcome_overlap):
                continue
            score = 6 * len(symptom_overlap) + 2 * len(description_overlap) + len(outcome_overlap)
            reasons = []
            for overlap, label in (
                (symptom_overlap, "Saved symptom keywords"),
                (description_overlap, "Reported problem keywords"),
                (outcome_overlap, "Keywords in owner-reported work"),
            ):
                if overlap:
                    reasons.append(label + ": " + ", ".join(sorted(overlap)))
            vehicle = {}
            for key, weight in (("make", 2), ("model", 3)):
                if key in public:
                    vehicle[key] = public[key]
                    if public[key].casefold() == getattr(issue.used_car, key).strip().casefold():
                        score += weight
                        reasons.append("Matching public vehicle " + key + ".")
            match = {
                "post_id": str(post["id"]), "problem_summary": post["title"],
                "symptoms": public_symptoms, "vehicle": vehicle,
                "repair": {
                    key: public[key]
                    for key in ("method", "work_performed", "cost", "insurance_settlement")
                    if key in public
                },
                "reasons": reasons, "keyword_score": score,
                **({"location": public["location"]} if "location" in public else {}),
                "provenance": "community_owner_experience",
            }
            ranked.append((-score, str(post["id"]), match))
        ranked.sort()
        matches = [item[2] for item in ranked[:limit]]
        return tool_result(
            "ok" if matches else "no_results",
            data={"matches": matches, "result_count": len(matches),
                  **({"location": {"requested": location.strip(), "local_matches_found": bool(matches)}}
                     if location is not None else {}),
                  "limitations": [
                "Community owner experiences are anecdotes, not verified mechanical diagnoses.",
                "Keyword overlap does not establish the same fault or vehicle compatibility.",
                "These results do not establish that a vehicle is safe to drive, especially with "
                "brake or steering trouble, fuel leaks, smoke/fire, severe overheating or sudden power loss.",
                "Ranking considers at most the 500 newest approved published Repair snapshots; "
                "preliminary AI analysis is not used as observed evidence.",
            ]},
            ids={"issue": {"type": "repair", "id": str(issue.id)},
                 "post_ids": [match["post_id"] for match in matches]},
            provenance="published_repair_posts",
        )
    except (ValidationError, ValueError, TypeError):
        return error_result("Invalid saved repair diagnosis data.")
    except DatabaseError:
        return error_result("Repair community search is unavailable.")
