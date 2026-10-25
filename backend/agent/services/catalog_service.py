"""Read-only catalog reference lookup; no used-car valuation calculations."""

from rest_framework.exceptions import ValidationError

from common.validators import validate_model_year
from vehicles.models import NewCar


def get_catalog_reference(make, model, year, trim=None):
    """Return one unambiguous stored MSRP reference or an explicit empty state.

    Names are trimmed and matched case-insensitively. Year must be a Python
    integer accepted by the shared vehicle year validator. Invalid arguments
    raise ValueError before any query. Multiple rows are always ambiguous,
    even if their MSRP values agree. Monetary values remain Decimal objects.
    """
    for label, value in (("make", make), ("model", model)):
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > 100:
            raise ValueError(f"{label} must be a nonblank string of at most 100 characters.")
    if isinstance(year, bool) or not isinstance(year, int):
        raise ValueError("year must be an integer.")
    try:
        validate_model_year(year)
    except ValidationError as exc:
        raise ValueError("year is outside the supported vehicle model-year range.") from exc
    if trim is not None:
        if not isinstance(trim, str) or not trim.strip() or len(trim.strip()) > 100:
            raise ValueError("trim must be a nonblank string of at most 100 characters.")

    queryset = NewCar.objects.filter(
        make__iexact=make.strip(), model__iexact=model.strip(), year=year
    )
    if trim is not None:
        queryset = queryset.filter(trim__iexact=trim.strip())
    matches = list(queryset.values("id", "make", "model", "year", "trim", "msrp")[:2])
    result = {
        "status": "no_results",
        "msrp_reference": None,
        "limitations": [
            "Stored manufacturer/catalog MSRP reference only; not a current used-car value, "
            "confirmed dealer price, or verified inventory.",
            "Catalog accuracy and freshness are not independently verified by this lookup.",
        ],
    }
    if not matches:
        result["limitations"].append("No catalog entry matches the supplied vehicle details.")
        return result
    if len(matches) > 1:
        result["status"] = "ambiguous"
        result["limitations"].append(
            "Multiple catalog entries match; no MSRP was selected. "
            "Specify trim if omitted, or resolve duplicate catalog entries."
        )
        return result

    entry = matches[0]
    msrp = entry["msrp"]
    result["msrp_reference"] = {
        "catalog_id": str(entry["id"]),
        "make": entry["make"],
        "model": entry["model"],
        "year": entry["year"],
        "trim": entry["trim"],
        "msrp": msrp,
        "price_basis": "catalog_msrp",
    }
    if msrp is None or not msrp.is_finite() or msrp < 0:
        result["status"] = "insufficient_data"
        result["msrp_reference"]["msrp"] = None
        result["limitations"].append("The matching catalog entry has no valid MSRP available.")
    else:
        result["status"] = "completed"
    return result
