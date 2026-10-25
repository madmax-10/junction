from rest_framework import serializers

from common.validators import (
    PREFERENCE_KEYS,
    _money,
    _optional_string,
    _whole_number,
    normalize_condition_details,
    normalize_contact,
    normalize_preferences,
    normalize_symptoms,
)
from issues.photos import normalize_photo_paths

SELL_KEYS = {
    "make",
    "model",
    "year",
    "trim",
    "mileage",
    "asking_price",
    "condition_details",
    "known_damage",
    "location",
    "contact",
    "photos",
}
BUY_KEYS = {
    "min_budget",
    "max_budget",
    "preferred_makes",
    "preferred_models",
    "minimum_year",
    "maximum_mileage",
    "vehicle_type",
    "fuel_type",
    "location",
    "contact",
    "photos",
}
REPAIR_KEYS = {
    "make",
    "model",
    "year",
    "trim",
    "mileage",
    "symptoms",
    "method",
    "work_performed",
    "cost",
    "mechanic_name",
    "owner_reported",
    "insurance_settlement",
    "location",
    "photos",
}
KEYS_BY_TYPE = {"buy": BUY_KEYS, "sell": SELL_KEYS, "repair": REPAIR_KEYS}
TEXT_FIELDS = {
    "make": 100,
    "model": 100,
    "trim": 100,
    "known_damage": 2000,
    "location": 255,
    "work_performed": 2000,
    "mechanic_name": 100,
    "fuel_type": 50,
    "insurance_settlement": 500,
}


def _nest(key, fn, value):
    try:
        return fn(value)
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({key: exc.detail})


def normalize_post_data(issue_type, issue_id, data, *, publishing=False):
    if not isinstance(data, dict):
        raise serializers.ValidationError("Expected an object.")
    allowed = KEYS_BY_TYPE.get(issue_type)
    if allowed is None:
        raise serializers.ValidationError("Issue type must be buy, sell, or repair.")
    unknown = sorted(set(data) - allowed)
    if unknown:
        raise serializers.ValidationError(f"Unknown fields: {', '.join(unknown)}.")

    cleaned = {}
    if issue_type == "buy":
        preference_input = {key: data[key] for key in PREFERENCE_KEYS if key in data}
        if preference_input:
            cleaned.update(normalize_preferences(preference_input) or {})
    else:
        for key, limit in TEXT_FIELDS.items():
            if key in allowed and key in data:
                text = _optional_string(data, key, limit)
                if text:
                    cleaned[key] = text

    if "year" in data:
        year = _whole_number(data, "year", year=True)
        if year is not None:
            cleaned["year"] = year
    if "mileage" in data:
        mileage = _whole_number(data, "mileage")
        if mileage is not None:
            cleaned["mileage"] = mileage

    for key in ("asking_price", "min_budget", "max_budget", "cost"):
        if key in data:
            amount = _money(data, key)
            if amount is not None:
                cleaned[key] = amount

    if (
        "min_budget" in cleaned
        and "max_budget" in cleaned
        and cleaned["max_budget"] < cleaned["min_budget"]
    ):
        raise serializers.ValidationError(
            {"max_budget": "Maximum budget cannot be less than minimum budget."}
        )

    if "condition_details" in data:
        condition = _nest("condition_details", normalize_condition_details, data["condition_details"])
        if condition:
            cleaned["condition_details"] = condition
    if "contact" in data:
        contact = _nest("contact", normalize_contact, data["contact"])
        if contact:
            cleaned["contact"] = contact
    if "symptoms" in data:
        symptoms = _nest("symptoms", normalize_symptoms, data["symptoms"])
        if symptoms:
            cleaned["symptoms"] = symptoms
    if "photos" in data:
        photos = normalize_photo_paths(issue_type, issue_id, data["photos"])
        if photos:
            cleaned["photos"] = photos
    if "method" in data and data["method"] is not None:
        if data["method"] not in {"mechanic", "self"}:
            raise serializers.ValidationError({"method": "Must be mechanic or self."})
        cleaned["method"] = data["method"]
    if "owner_reported" in data:
        if data["owner_reported"] is not True:
            raise serializers.ValidationError(
                {"owner_reported": "Repair posts must be marked owner_reported."}
            )
        cleaned["owner_reported"] = True
    if publishing and issue_type == "repair" and cleaned.get("owner_reported") is not True:
        raise serializers.ValidationError(
            {"owner_reported": "Repair posts must be marked owner_reported."}
        )
    return cleaned
