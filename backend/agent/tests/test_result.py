"""Tool result envelope and JSON conversion; no Django or ADK required."""

import json
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

try:  # `manage.py test` runs from backend/; the repo-root unittest command does not
    from agent.services.valuation_service import estimate
    from agent.tools.result import error_result, to_jsonable, tool_result
except ModuleNotFoundError:
    from backend.agent.services.valuation_service import estimate
    from backend.agent.tools.result import error_result, to_jsonable, tool_result


class ToJsonableTests(unittest.TestCase):
    def test_decimal_uuid_and_dates_become_strings(self):
        value = {
            "price": Decimal("12000.015"),
            "big": Decimal("1E+4"),
            "id": UUID("12345678-1234-5678-1234-567812345678"),
            "day": date(2026, 10, 24),
            "at": datetime(2026, 10, 24, 12, 30, tzinfo=timezone.utc),
            "nested": [{"amount": Decimal("0.10")}],
        }
        self.assertEqual(to_jsonable(value), {
            "price": "12000.015",
            "big": "10000",
            "id": "12345678-1234-5678-1234-567812345678",
            "day": "2026-10-24",
            "at": "2026-10-24T12:30:00+00:00",
            "nested": [{"amount": "0.10"}],
        })

    def test_plain_json_values_pass_through(self):
        value = {"a": None, "b": True, "c": 3, "d": "x", "e": (1, 2)}
        self.assertEqual(to_jsonable(value), {"a": None, "b": True, "c": 3, "d": "x", "e": [1, 2]})

    def test_floats_nonfinite_decimals_and_unknown_types_are_rejected(self):
        for bad in (1.5, Decimal("NaN"), Decimal("Infinity"), object(), {1: "x"}, {"s": {1, 2}}):
            with self.subTest(bad=repr(bad)):
                with self.assertRaises(TypeError):
                    to_jsonable(bad)


class ToolResultTests(unittest.TestCase):
    def test_envelope_has_exactly_five_fields(self):
        result = tool_result("ok", data={"x": 1}, ids={"used_car_id": "abc"}, provenance="own_used_cars")
        self.assertEqual(result, {
            "status": "ok",
            "data": {"x": 1},
            "ids": {"used_car_id": "abc"},
            "provenance": "own_used_cars",
            "error": None,
        })

    def test_defaults(self):
        self.assertEqual(tool_result("no_results")["ids"], {})
        self.assertIsNone(tool_result("no_results")["data"])

    def test_unknown_status_is_rejected(self):
        with self.assertRaises(ValueError):
            tool_result("completed")

    def test_error_message_required_only_for_error_status(self):
        with self.assertRaises(ValueError):
            tool_result("error")
        with self.assertRaises(ValueError):
            tool_result("ok", error="nope")
        self.assertEqual(error_result("Car not found.")["error"], "Car not found.")

    def test_valuation_estimate_round_trips_through_json(self):
        # Synthetic fixtures only.
        valuation = estimate([
            {"post_id": "fixture-a", "asking_price": "10000.00"},
            {"post_id": "fixture-b", "asking_price": "12000.01"},
            {"post_id": "fixture-c", "asking_price": "12000.02"},
            {"post_id": "fixture-d", "asking_price": "15000.00"},
        ], weights={key: "1" for key in ("fixture-a", "fixture-b", "fixture-c", "fixture-d")})
        result = tool_result("ok", data=valuation, provenance="published_sell_posts")
        decoded = json.loads(json.dumps(result))
        self.assertIsNone(decoded["data"]["median"])
        self.assertEqual(decoded["data"]["estimated_value"], "12250.0075")
        self.assertEqual(decoded["data"]["low"], "10000.00")
        self.assertEqual(decoded["data"]["price_basis"], "asking")


if __name__ == "__main__":
    unittest.main()
