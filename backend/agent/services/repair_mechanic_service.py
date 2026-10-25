"""Authorized, read-only Google Places (New) repair-business discovery."""

import math
import os
from decimal import Decimal
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from django.contrib.auth import get_user_model
from django.db import DatabaseError

from agent.tools.result import error_result, tool_result
from issues.models import RepairIssue


def find_nearby_mechanics(repair_issue_id, latitude, longitude, radius_meters=10000, limit=5, *, user=None):
    """Use caller-authorized coordinates; never send private issue context.

    Trusted server code supplies user from request.user or the shared ADK bridge.
    The caller must obtain permission for the location before invoking this service.
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
        if not RepairIssue.objects.filter(pk=issue_id, user=user, used_car__owner=user).exists():
            return error_result("Repair issue not found.")
    except DatabaseError:
        return error_result("Mechanic search is unavailable.")

    for value, minimum, maximum in ((latitude, -90, 90), (longitude, -180, 180), (radius_meters, 1, 50000)):
        if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
            return error_result("Invalid search coordinates or radius.")
        try:
            if not math.isfinite(float(value)) or not minimum <= value <= maximum:
                return error_result("Invalid search coordinates or radius.")
        except (ValueError, OverflowError):
            return error_result("Invalid search coordinates or radius.")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10:
        return error_result("limit must be an integer between 1 and 10.")
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    if not api_key:
        return error_result("Google Places is not configured.")
    try:
        response = httpx.post(
            "https://places.googleapis.com/v1/places:searchNearby",
            headers={
                "Content-Type": "application/json", "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location",
            },
            json={
                "includedTypes": ["car_repair"], "maxResultCount": limit, "rankPreference": "DISTANCE",
                "locationRestriction": {"circle": {
                    "center": {"latitude": float(latitude), "longitude": float(longitude)},
                    "radius": float(radius_meters),
                }},
            },
            timeout=10.0, follow_redirects=False,
        )
    except httpx.TimeoutException:
        return error_result("Google Places request timed out.")
    except httpx.RequestError:
        return error_result("Google Places network request failed.")
    if response.status_code in (401, 403):
        return error_result("Google Places authentication or permission failed.")
    if response.status_code == 429:
        return error_result("Google Places rate limit reached.")
    if response.status_code >= 500:
        return error_result("Google Places is temporarily unavailable.")
    if response.status_code != 200:
        return error_result("Google Places request failed.")
    try:
        payload = response.json()
    except ValueError:
        return error_result("Invalid Google Places response.")
    if not isinstance(payload, dict) or "error" in payload or not isinstance(payload.get("places", []), list):
        return error_result("Invalid Google Places response.")
    places = payload.get("places", [])
    mechanics = []
    seen = set()
    for place in places[:limit]:
        if not isinstance(place, dict):
            continue
        place_id = place.get("id")
        display = place.get("displayName")
        name = display.get("text") if isinstance(display, dict) else None
        if not isinstance(place_id, str) or not place_id.strip() or not isinstance(name, str) or not name.strip():
            continue
        if place_id in seen:
            continue
        seen.add(place_id)
        mechanic = {
            "place_id": place_id, "name": name, "source": "Google Places",
            "ranking_explanation": "Nearby results in Google Places DISTANCE preference order; not driving time.",
        }
        address = place.get("formattedAddress")
        if isinstance(address, str) and address.strip():
            mechanic["formatted_address"] = address
        maps_url = place.get("googleMapsUri")
        if isinstance(maps_url, str):
            try:
                parsed = urlsplit(maps_url)
                if parsed.scheme == "https" and parsed.hostname in {"google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"} and not parsed.username and not parsed.password:
                    mechanic["google_maps_url"] = maps_url
            except ValueError:
                pass
        location = place.get("location")
        if isinstance(location, dict):
            lat, lng = location.get("latitude"), location.get("longitude")
            if (
                not isinstance(lat, bool) and isinstance(lat, (int, float))
                and not isinstance(lng, bool) and isinstance(lng, (int, float))
                and -90 <= lat <= 90 and -180 <= lng <= 180
            ):
                mechanic["coordinates"] = {"latitude": Decimal(str(lat)), "longitude": Decimal(str(lng))}
        mechanics.append(mechanic)
    if places and not mechanics:
        return error_result("Invalid Google Places response.")
    return tool_result(
        "ok", data={"mechanics": mechanics, "result_count": len(mechanics), "limitations": [
            "Google Places listings are not independently endorsed or verified as Toyota-certified. "
            "Repair capability, appointment availability and affordability are not established.",
            "This search does not diagnose faults or establish that driving to a business is safe.",
        ]},
        ids={"issue": {"type": "repair", "id": str(issue_id)}, "place_ids": [item["place_id"] for item in mechanics]},
        provenance="google_places",
    )
