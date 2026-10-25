"""Isolated synthetic catalog fixtures, not actual manufacturer pricing."""

from datetime import date
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.catalog_service import get_catalog_reference
from vehicles.models import NewCar


class CatalogReferenceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            email="catalog-fixture@example.com", name="Catalog fixture", is_staff=True
        )

    def create_car(self, **overrides):
        data = {
            "owner": self.owner, "make": "Toyota", "model": "Camry",
            "year": 2024, "trim": "SE", "msrp": Decimal("30123.45"),
        }
        data.update(overrides)
        return NewCar.objects.create(**data)

    def test_valid_toyota_model_and_year(self):
        car = self.create_car()
        result = get_catalog_reference("Toyota", "Camry", 2024)
        self.assertEqual(result["status"], "completed")
        reference = result["msrp_reference"]
        self.assertEqual(reference["catalog_id"], str(car.id))
        self.assertEqual((reference["make"], reference["model"], reference["year"]),
                         ("Toyota", "Camry", 2024))
        self.assertEqual(reference["price_basis"], "catalog_msrp")

    def test_stored_msrp_precision_is_preserved(self):
        self.create_car()
        reference = get_catalog_reference("Toyota", "Camry", 2024)["msrp_reference"]
        self.assertIsInstance(reference["msrp"], Decimal)
        self.assertEqual(reference["msrp"], Decimal("30123.45"))

    def test_case_insensitive_make_model_and_trim_with_input_whitespace(self):
        self.create_car()
        result = get_catalog_reference(" toyota ", " CAMRY ", 2024, " se ")
        self.assertEqual(result["status"], "completed")

    def test_matching_trim_selects_only_that_variant(self):
        car = self.create_car()
        self.create_car(trim="XLE", msrp=Decimal("35123.45"))
        result = get_catalog_reference("Toyota", "Camry", 2024, "SE")
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["msrp_reference"]["catalog_id"], str(car.id))

    def test_wrong_trim_does_not_fall_back(self):
        self.create_car()
        result = get_catalog_reference("Toyota", "Camry", 2024, "LE")
        self.assertEqual(result["status"], "no_results")
        self.assertIsNone(result["msrp_reference"])

    def test_wrong_make_or_model_is_not_a_partial_match(self):
        self.create_car()
        for make, model in (("Honda", "Camry"), ("Toyota", "Corolla"), ("Toy", "Cam")):
            with self.subTest(make=make, model=model):
                result = get_catalog_reference(make, model, 2024)
                self.assertEqual(result["status"], "no_results")
                self.assertIsNone(result["msrp_reference"])

    def test_wrong_year_does_not_use_an_adjacent_year(self):
        self.create_car()
        result = get_catalog_reference("Toyota", "Camry", 2023)
        self.assertEqual(result["status"], "no_results")
        self.assertIsNone(result["msrp_reference"])

    def test_missing_msrp_returns_insufficient_data(self):
        car = self.create_car(msrp=None)
        result = get_catalog_reference("Toyota", "Camry", 2024)
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["msrp_reference"]["catalog_id"], str(car.id))
        self.assertIsNone(result["msrp_reference"]["msrp"])

    def test_multiple_variants_without_trim_are_ambiguous(self):
        self.create_car()
        self.create_car(trim="XLE", msrp=None)
        result = get_catalog_reference("Toyota", "Camry", 2024)
        self.assertEqual(result["status"], "ambiguous")
        self.assertIsNone(result["msrp_reference"])

    def test_duplicate_exact_matches_are_ambiguous_even_with_equal_prices(self):
        self.create_car()
        self.create_car()
        result = get_catalog_reference("Toyota", "Camry", 2024, "SE")
        self.assertEqual(result["status"], "ambiguous")
        self.assertIsNone(result["msrp_reference"])

    def test_empty_catalog_returns_no_results(self):
        result = get_catalog_reference("Toyota", "Camry", 2024)
        self.assertEqual(result["status"], "no_results")
        self.assertIsNone(result["msrp_reference"])

    def test_invalid_inputs_raise_value_error_without_queries(self):
        for make, model, year, trim in (
            ("", "Camry", 2024, None), ("Toyota", " ", 2024, None),
            (None, "Camry", 2024, None), ("Toyota", [], 2024, None),
            ("T" * 101, "Camry", 2024, None),
            ("Toyota", "Camry", True, None), ("Toyota", "Camry", None, None),
            ("Toyota", "Camry", "2024", None), ("Toyota", "Camry", 2024.5, None),
            ("Toyota", "Camry", Decimal("2024"), None),
            ("Toyota", "Camry", 1899, None),
            ("Toyota", "Camry", date.today().year + 2, None),
            ("Toyota", "Camry", 2024, ""), ("Toyota", "Camry", 2024, 1),
            ("Toyota", "Camry", 2024, "X" * 101),
        ):
            with self.subTest(make=make, model=model, year=year, trim=trim):
                with self.assertNumQueries(0), self.assertRaises(ValueError):
                    get_catalog_reference(make, model, year, trim)

    def test_lookup_performs_only_one_select_and_no_writes(self):
        self.create_car()
        before = list(NewCar.objects.values())
        with CaptureQueriesContext(connection) as queries:
            result = get_catalog_reference("Toyota", "Camry", 2024)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(len(queries), 1)
        self.assertTrue(queries[0]["sql"].lstrip().upper().startswith("SELECT"))
        self.assertEqual(list(NewCar.objects.values()), before)

    def test_zero_msrp_is_not_treated_as_missing(self):
        self.create_car(msrp=Decimal("0.00"))
        result = get_catalog_reference("Toyota", "Camry", 2024)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["msrp_reference"]["msrp"], Decimal("0.00"))
