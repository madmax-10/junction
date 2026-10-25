"""Shared field checks for vehicles, issues, and posts."""

from datetime import date
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework import serializers

MIN_YEAR = 1900
PREFERENCE_KEYS = {
    "preferred_makes",
    "preferred_models",
    "minimum_year",
    "maximum_mileage",
    "vehicle_type",
    "fuel_type",
    "location",
}
CONDITION_KEYS = {"mechanical", "exterior", "interior", "maintenance_history"}
CONTACT_KEYS = {"phone", "email", "link"}
SYMPTOM_KEYS = {"confirmed", "inferred"}
ANALYSIS_KEYS = {"possibilities", "notes"}
MECHANIC_RESOLUTION_KEYS = {"method", "mechanic_name", "location", "work_performed", "cost"}
SELF_RESOLUTION_KEYS = {"method", "instructions", "parts_used", "cost"}


def maximum_year():
    return date.today().year + 1


def validate_model_year(value):
    if value < MIN_YEAR or value > maximum_year():
        raise serializers.ValidationError(
            f"Year must be between {MIN_YEAR} and {maximum_year()}."
        )
    return value


def _rekey(key, exc):
    raise serializers.ValidationError({key: exc.detail})


def _optional_string(source, key, max_length):
    if key not in source or source[key] in (None, ""):
        return None
    value = source[key]
    if not isinstance(value, str):
        raise serializers.ValidationError({key: "Must be a string."})
    value = value.strip()
    if not value:
        return None
    if len(value) > max_length:
        raise serializers.ValidationError({key: f"Must be {max_length} characters or fewer."})
    return value


def _require_string(source, key, max_length):
    value = _optional_string(source, key, max_length)
    if not value:
        raise serializers.ValidationError({key: "This field is required."})
    return value


def _string_list(source, key, *, item_max=100, max_items=20):
    if key not in source or source[key] is None:
        return None
    value = source[key]
    if not isinstance(value, list):
        raise serializers.ValidationError({key: "Must be a list of strings."})
    if len(value) > max_items:
        raise serializers.ValidationError({key: f"Must contain {max_items} items or fewer."})
    cleaned = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise serializers.ValidationError({key: "Items must be non-empty strings."})
        item = item.strip()
        if len(item) > item_max:
            raise serializers.ValidationError(
                {key: f"Items must be {item_max} characters or fewer."}
            )
        cleaned.append(item)
    return cleaned


def _reject_unknown(data, allowed):
    if not isinstance(data, dict):
        raise serializers.ValidationError("Expected an object.")
    unknown = sorted(set(data) - set(allowed))
    if unknown:
        raise serializers.ValidationError(f"Unknown fields: {', '.join(unknown)}.")


def money_to_json(value):
    amount = Decimal(str(value)).quantize(Decimal("0.01"))
    if amount == amount.to_integral():
        return int(amount)
    return float(amount)


def _money(source, key):
    if key not in source or source[key] is None:
        return None
    value = source[key]
    if isinstance(value, bool):
        raise serializers.ValidationError({key: "Must be a number."})
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise serializers.ValidationError({key: "Must be a number."})
    if amount < 0:
        raise serializers.ValidationError({key: "Cannot be negative."})
    return money_to_json(amount)


def _whole_number(source, key, *, minimum=0, maximum=None, year=False):
    if key not in source or source[key] is None:
        return None
    value = source[key]
    if isinstance(value, bool) or not isinstance(value, int):
        raise serializers.ValidationError({key: "Must be a whole number."})
    if year:
        try:
            validate_model_year(value)
        except serializers.ValidationError as exc:
            _rekey(key, exc)
        return value
    if value < minimum:
        raise serializers.ValidationError({key: "Cannot be negative."})
    if maximum is not None and value > maximum:
        raise serializers.ValidationError({key: f"Must be {maximum} or less."})
    return value


def normalize_preferences(value):
    if value is None:
        return None
    _reject_unknown(value, PREFERENCE_KEYS)
    cleaned = {}
    makes = _string_list(value, "preferred_makes")
    models = _string_list(value, "preferred_models")
    if makes:
        cleaned["preferred_makes"] = makes
    if models:
        cleaned["preferred_models"] = models
    minimum_year = _whole_number(value, "minimum_year", year=True)
    maximum_mileage = _whole_number(value, "maximum_mileage")
    if minimum_year is not None:
        cleaned["minimum_year"] = minimum_year
    if maximum_mileage is not None:
        cleaned["maximum_mileage"] = maximum_mileage
    if "vehicle_type" in value and value["vehicle_type"] is not None:
        vehicle_type = value["vehicle_type"]
        if vehicle_type not in {"new", "used"}:
            raise serializers.ValidationError({"vehicle_type": "Must be new or used."})
        cleaned["vehicle_type"] = vehicle_type
    fuel_type = _optional_string(value, "fuel_type", 50)
    location = _optional_string(value, "location", 255)
    if fuel_type:
        cleaned["fuel_type"] = fuel_type
    if location:
        cleaned["location"] = location
    return cleaned


def normalize_condition_details(value):
    if value is None:
        return None
    _reject_unknown(value, CONDITION_KEYS)
    cleaned = {}
    for key in CONDITION_KEYS:
        text = _optional_string(value, key, 1000)
        if text:
            cleaned[key] = text
    return cleaned or None


def normalize_contact(value):
    if value is None:
        return None
    _reject_unknown(value, CONTACT_KEYS)
    cleaned = {}
    phone = _optional_string(value, "phone", 50)
    email = _optional_string(value, "email", 255)
    link = _optional_string(value, "link", 500)
    if phone:
        cleaned["phone"] = phone
    if email:
        try:
            validate_email(email)
        except DjangoValidationError:
            raise serializers.ValidationError({"email": "Enter a valid email address."})
        cleaned["email"] = email
    if link:
        if not link.startswith(("http://", "https://")):
            raise serializers.ValidationError({"link": "Link must start with http:// or https://."})
        cleaned["link"] = link
    return cleaned or None


def normalize_symptoms(value):
    if value is None:
        return None
    _reject_unknown(value, SYMPTOM_KEYS)
    cleaned = {}
    for key in ("confirmed", "inferred"):
        items = _string_list(value, key, item_max=300)
        if items:
            cleaned[key] = items
    return cleaned or None


def normalize_ai_analysis(value):
    if value is None:
        return None
    _reject_unknown(value, ANALYSIS_KEYS)
    cleaned = {}
    if "possibilities" in value and value["possibilities"] is not None:
        possibilities = value["possibilities"]
        if not isinstance(possibilities, list):
            raise serializers.ValidationError({"possibilities": "Must be a list."})
        if len(possibilities) > 20:
            raise serializers.ValidationError({"possibilities": "Must contain 20 items or fewer."})
        normalized = []
        for item in possibilities:
            if not isinstance(item, dict):
                raise serializers.ValidationError({"possibilities": "Each item must be an object."})
            unknown = sorted(set(item) - {"cause", "uncertainty"})
            if unknown:
                raise serializers.ValidationError(
                    {"possibilities": f"Unknown fields: {', '.join(unknown)}."}
                )
            cause = _require_string(item, "cause", 300)
            uncertainty = _require_string(item, "uncertainty", 300)
            normalized.append({"cause": cause, "uncertainty": uncertainty})
        if normalized:
            cleaned["possibilities"] = normalized
    notes = _optional_string(value, "notes", 2000)
    if notes:
        cleaned["notes"] = notes
    return cleaned or None


def normalize_resolution_details(value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Expected an object.")
    method = value.get("method")
    if method not in {"mechanic", "self"}:
        raise serializers.ValidationError({"method": "Must be mechanic or self."})
    allowed = MECHANIC_RESOLUTION_KEYS if method == "mechanic" else SELF_RESOLUTION_KEYS
    _reject_unknown(value, allowed)
    cleaned = {"method": method}
    if method == "mechanic":
        for key, limit in (
            ("mechanic_name", 100),
            ("location", 255),
            ("work_performed", 1000),
        ):
            text = _optional_string(value, key, limit)
            if text:
                cleaned[key] = text
    else:
        instructions = _optional_string(value, "instructions", 2000)
        if instructions:
            cleaned["instructions"] = instructions
        parts = _string_list(value, "parts_used")
        if parts:
            cleaned["parts_used"] = parts
    cost = _money(value, "cost")
    if cost is not None:
        cleaned["cost"] = cost
    return cleaned
