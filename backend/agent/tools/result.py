"""The {status, data, ids, provenance, error} envelope every agent tool returns.

See backend/agent/contracts.md for the frozen shapes.
"""

from collections.abc import Mapping
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

STATUSES = {
    "ok",
    "no_results",
    "insufficient_data",
    "vision_unavailable",
    "search_unavailable",
    "error",
}


def to_jsonable(value):
    """Recursively convert Decimal, UUID and dates to strings; reject other non-JSON types.

    Decimals become plain decimal strings ("12000.015", never "1.2E+4" or a float),
    so money keeps its exact value across the client-held history.
    """
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        raise TypeError("Floats are not allowed in tool results; use Decimal for money.")
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise TypeError("Non-finite Decimal cannot be serialized.")
        return format(value, "f")
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Mapping):
        converted = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("Mapping keys must be strings.")
            converted[key] = to_jsonable(item)
        return converted
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    raise TypeError(f"{type(value).__name__} is not JSON-serializable.")


def tool_result(status, data=None, ids=None, provenance=None, error=None):
    """Build a JSON-safe tool response.

    ``ids`` maps names to record ids, e.g. {"used_car_id": ..., "post_ids": [...]}.
    ``provenance`` names where the data came from, e.g. "published_sell_posts".
    ``error`` is a short message for the coordinator, set only when status is "error".
    """
    if status not in STATUSES:
        raise ValueError(f"Unknown tool status: {status!r}.")
    if (status == "error") != bool(error):
        raise ValueError("error is required for status 'error' and only allowed there.")
    return {
        "status": status,
        "data": to_jsonable(data),
        "ids": to_jsonable(ids or {}),
        "provenance": provenance,
        "error": error,
    }


def error_result(message, provenance=None):
    return tool_result("error", provenance=provenance, error=message)
