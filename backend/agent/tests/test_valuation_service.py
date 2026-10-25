"""Synthetic calculation fixtures only; no real listings or integrations."""

import unittest
from decimal import Decimal, localcontext

from backend.agent.services.valuation_service import estimate as raw_estimate


def estimate(comparables, msrp_reference=None):
    # Equal weights isolate the arithmetic contract from the provider.
    if isinstance(comparables, (list, tuple)) and all(isinstance(row, dict) for row in comparables):
        weights = {row.get("post_id"): "1" for row in comparables}
    else:
        weights = None
    if not isinstance(comparables, (str, bytes, dict)) and comparables is not None and not isinstance(comparables, int):
        comparables = list(comparables)
        weights = {row.get("post_id"): "1" for row in comparables if isinstance(row, dict)}
    return raw_estimate(comparables, msrp_reference, weights=weights)



class EstimateTests(unittest.TestCase):
    def test_three_comparables_return_weighted_mean_and_deprecated_median(self):
        # These prices and identifiers are invented test fixtures, not evidence.
        records = [
            {"post_id": "fixture-c", "asking_price": "15000.00"},
            {"post_id": "fixture-a", "asking_price": "10000.00"},
            {"post_id": "fixture-b", "asking_price": "12000.00"},
        ]

        result = estimate(records)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["low"], Decimal("10000.00"))
        self.assertIsNone(result["median"])
        self.assertEqual(result["estimated_value"].quantize(Decimal("0.01")), Decimal("12333.33"))
        self.assertEqual(result["high"], Decimal("15000.00"))
        self.assertEqual(result["sample_size"], 3)
        self.assertEqual(result["price_basis"], "asking")
        self.assertEqual(result["comparable_post_ids"], ["fixture-c", "fixture-a", "fixture-b"])
        self.assertIsNone(result["msrp_reference"])
        self.assertTrue(result["limitations"])
        self.assertEqual(
            set(result),
            {"status", "low", "median", "high", "sample_size", "price_basis",
             "comparable_post_ids", "msrp_reference", "limitations", "estimated_value"},
        )

    def test_empty_one_and_two_comparables_have_no_numeric_range(self):
        fixtures = [
            {"post_id": "fixture-a", "asking_price": "10000"},
            {"post_id": "fixture-b", "asking_price": "12000"},
        ]
        for count in (0, 1, 2):
            with self.subTest(count=count):
                result = estimate(fixtures[:count])
                self.assertEqual(result["status"], "insufficient_data")
                self.assertEqual(result["sample_size"], count)
                self.assertEqual(result["comparable_post_ids"], [row["post_id"] for row in fixtures[:count]])
                self.assertIsNone(result["low"])
                self.assertIsNone(result["median"])
                self.assertIsNone(result["high"])
                self.assertEqual(result["price_basis"], "asking")

    def test_duplicate_posts_do_not_meet_minimum_sample_size(self):
        result = estimate([
            {"post_id": "fixture-a", "asking_price": "10000"},
            {"post_id": "fixture-a", "asking_price": Decimal("10000.00")},
            {"post_id": "fixture-b", "asking_price": "12000"},
        ])
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["sample_size"], 2)
        self.assertEqual(result["comparable_post_ids"], ["fixture-a", "fixture-b"])
        self.assertIsNone(result["median"])

    def test_duplicates_do_not_bias_a_completed_range(self):
        result = estimate([
            {"post_id": "fixture-a", "asking_price": "10000"},
            {"post_id": "fixture-a", "asking_price": "10000"},
            {"post_id": "fixture-b", "asking_price": "12000"},
            {"post_id": "fixture-c", "asking_price": "15000"},
        ])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["sample_size"], 3)
        self.assertIsNone(result["median"])

    def test_conflicting_duplicate_prices_are_rejected(self):
        fixtures = [
            {"post_id": "fixture-a", "asking_price": "10000"},
            {"post_id": "fixture-a", "asking_price": "11000"},
        ]
        for records in (fixtures, list(reversed(fixtures))):
            with self.subTest(records=records):
                with self.assertRaises(ValueError):
                    estimate(records)

    def test_invalid_prices_are_rejected(self):
        invalid_prices = [
            None, "", "not a price", "$10,000", "-0.01", -1,
            "NaN", "sNaN", "Infinity", "-Infinity", Decimal("NaN"),
            Decimal("Infinity"), Decimal("-1"), True, False, 10000.5,
            float("nan"), float("inf"), [], {},
        ]
        for price in invalid_prices:
            with self.subTest(price=repr(price)):
                with self.assertRaises(ValueError):
                    estimate([{"post_id": "fixture-a", "asking_price": price}])

    def test_missing_price_is_rejected(self):
        with self.assertRaises(ValueError):
            estimate([{"post_id": "fixture-a"}])

    def test_invalid_record_or_identifier_is_rejected(self):
        for record in (None, [], "not a record", {},
                       {"asking_price": "10"},
                       {"post_id": None, "asking_price": "10"},
                       {"post_id": "", "asking_price": "10"},
                       {"post_id": "   ", "asking_price": "10"},
                       {"post_id": 123, "asking_price": "10"}):
            with self.subTest(record=record):
                with self.assertRaises(ValueError):
                    estimate([record])

    def test_invalid_collection_is_rejected(self):
        for comparables in (None, 42, "records", b"records", {}):
            with self.subTest(comparables=comparables):
                with self.assertRaises(ValueError):
                    estimate(comparables)

    def test_invalid_record_is_not_silently_discarded(self):
        with self.assertRaises(ValueError):
            estimate([
                {"post_id": "fixture-a", "asking_price": "10"},
                {"post_id": "fixture-b", "asking_price": "20"},
                {"post_id": "fixture-c", "asking_price": "30"},
                {"post_id": "fixture-d", "asking_price": "bad"},
            ])

    def test_integer_decimal_and_string_prices_return_decimals(self):
        result = estimate([
            {"post_id": "fixture-a", "asking_price": 0},
            {"post_id": "fixture-b", "asking_price": Decimal("0.10")},
            {"post_id": "fixture-c", "asking_price": "0.20"},
        ])
        self.assertEqual(result["low"], Decimal("0"))
        self.assertEqual(result["estimated_value"], Decimal("0.10"))
        self.assertEqual(result["high"], Decimal("0.20"))
        for key in ("low", "estimated_value", "high"):
            self.assertIsInstance(result[key], Decimal)

    def test_even_sample_uses_mean_without_cent_rounding(self):
        result = estimate([
            {"post_id": "fixture-a", "asking_price": "10000.00"},
            {"post_id": "fixture-b", "asking_price": "12000.01"},
            {"post_id": "fixture-c", "asking_price": "12000.02"},
            {"post_id": "fixture-d", "asking_price": "15000.00"},
        ])
        self.assertIsNone(result["median"])
        self.assertEqual(result["estimated_value"], Decimal("12250.0075"))
        self.assertEqual(result["low"], Decimal("10000.00"))
        self.assertEqual(result["high"], Decimal("15000.00"))

    def test_mean_does_not_inherit_low_decimal_precision(self):
        fixtures = [
            {"post_id": "fixture-a", "asking_price": "10000.00"},
            {"post_id": "fixture-b", "asking_price": "12000.01"},
            {"post_id": "fixture-c", "asking_price": "12000.02"},
            {"post_id": "fixture-d", "asking_price": "15000.00"},
        ]
        with localcontext() as context:
            context.prec = 3
            result = estimate(fixtures)
            self.assertEqual(context.prec, 3)
        self.assertIsNone(result["median"])
        self.assertEqual(result["estimated_value"], Decimal("12250.0075"))

    def test_msrp_is_preserved_but_does_not_change_used_price_range(self):
        fixtures = [
            {"post_id": "fixture-a", "asking_price": "10000"},
            {"post_id": "fixture-b", "asking_price": "12000"},
            {"post_id": "fixture-c", "asking_price": "15000"},
        ]
        reference = {"msrp": "99999.00", "source": "synthetic catalog fixture"}
        without_msrp = estimate(fixtures)
        with_msrp = estimate(fixtures, msrp_reference=reference)
        self.assertEqual(with_msrp["msrp_reference"], reference)
        for key in ("status", "low", "median", "high", "sample_size", "comparable_post_ids"):
            self.assertEqual(with_msrp[key], without_msrp[key])

    def test_msrp_alone_cannot_produce_a_used_price_range(self):
        reference = {"msrp": "30000.00"}
        result = estimate([], msrp_reference=reference)
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["msrp_reference"], reference)
        self.assertIsNone(result["low"])
        self.assertIsNone(result["median"])
        self.assertIsNone(result["high"])

    def test_iterable_input_and_input_records_are_not_modified(self):
        fixtures = [
            {"post_id": "fixture-a", "asking_price": "15000"},
            {"post_id": "fixture-b", "asking_price": "10000"},
            {"post_id": "fixture-c", "asking_price": "12000"},
        ]
        original = [dict(record) for record in fixtures]
        reference = {"msrp": "30000.00"}
        result = estimate(iter(fixtures), msrp_reference=reference)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(fixtures, original)
        self.assertEqual(reference, {"msrp": "30000.00"})


if __name__ == "__main__":
    unittest.main()


class ExplicitWeightSafetyTests(unittest.TestCase):
    def setUp(self):
        self.rows = [{"post_id": str(i), "asking_price": price}
                     for i, price in enumerate(("10000", "12000", "15000"))]

    def test_no_weights_never_falls_back_to_median_or_mean(self):
        result = raw_estimate(self.rows)
        self.assertEqual(result["status"], "insufficient_data")
        for key in ("estimated_value", "median", "low", "high"):
            self.assertIsNone(result[key])

    def test_explicit_weights_produce_non_median_estimate(self):
        result = raw_estimate(self.rows, weights={"0": "0.1", "1": "0.2", "2": "0.7"})
        self.assertEqual(result["estimated_value"], Decimal("13900"))
        self.assertIsNone(result["median"])

    def test_invalid_weight_ids_or_values_raise(self):
        for weights in ({"0": "1", "1": "1"},
                        {"0": "1", "1": "1", "foreign": "1"},
                        {"0": True, "1": "1", "2": "1"},
                        {"0": "NaN", "1": "1", "2": "1"},
                        {"0": "-1", "1": "1", "2": "1"}):
            with self.subTest(weights=weights), self.assertRaises(ValueError):
                raw_estimate(self.rows, weights=weights)

    def test_fewer_than_three_positive_weights_is_insufficient(self):
        result = raw_estimate(self.rows, weights={"0": "1", "1": "1", "2": "0"})
        self.assertEqual(result["status"], "insufficient_data")
        self.assertIsNone(result["estimated_value"])
