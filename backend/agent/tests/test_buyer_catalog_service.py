"""Synthetic MSRP/catalog fixtures; not real manufacturer or dealer prices."""

import json
from datetime import date
from decimal import Decimal, InvalidOperation
from unittest.mock import patch
from uuid import UUID, uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.buy_issue_service import create_or_update_buy_issue
from agent.services.buyer_catalog_service import search_new_catalog
from issues.models import BuyIssue
from vehicles.models import NewCar


class BuyerCatalogTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="catalog-buyer@example.com", name="Buyer")
        cls.other = User.objects.create_user(email="other-buyer@example.com", name="Other")
        cls.admin = User.objects.create_user(email="PRIVATE-admin@example.com", name="Catalog admin", is_staff=True)

    def issue(self, **changes):
        data = {"user": self.user, "description": "Need a new Toyota", "preferences": {}}
        data.update(changes)
        return BuyIssue.objects.create(**data)

    def car(self, **changes):
        data = {"owner": self.admin, "make": "Toyota", "model": "Camry", "year": 2024,
                "trim": "SE", "msrp": Decimal("30000.25")}
        data.update(changes)
        return NewCar.objects.create(**data)

    def test_task_31_saved_preferences_find_real_catalog_record(self):
        saved = create_or_update_buy_issue(
            "Need a new Camry", preferences={"preferred_makes": ["Toyota"], "vehicle_type": "new"},
            user=self.user,
        )
        car = self.car()
        result = search_new_catalog(saved["data"]["id"], user=self.user)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["result_count"], 1)
        self.assertEqual(result["ids"]["catalog_ids"], [str(car.id)])

    def test_unauthenticated_unsaved_or_inactive_users_are_rejected(self):
        issue = self.issue()
        for user in (None, AnonymousUser(), {"user_id": str(self.user.id)}, User(email="unsaved@example.com")):
            with self.subTest(user=user):
                self.assertEqual(search_new_catalog(issue.id, user=user)["status"], "error")
        User.objects.filter(pk=self.user.id).update(is_active=False)
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["status"], "error")

    def test_foreign_missing_and_invalid_issues_are_indistinguishable(self):
        foreign = self.issue(user=self.other, description="PRIVATE buyer preferences")
        results = [search_new_catalog(target, user=self.user)
                   for target in (foreign.id, uuid4(), "bad", "", None, True)]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Buy issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})

    def test_manufacturer_filter_is_exact_and_case_insensitive(self):
        issue = self.issue(preferences={"preferred_makes": ["toyota"]})
        car = self.car()
        self.car(make="Honda")
        self.car(make="Toyota Example")
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"], [str(car.id)])

    def test_model_filter_is_exact_and_case_insensitive(self):
        issue = self.issue(preferences={"preferred_models": ["CAMRY"]})
        car = self.car()
        self.car(model="Corolla")
        self.car(model="Camry Hybrid")
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"], [str(car.id)])

    def test_minimum_year_is_inclusive(self):
        issue = self.issue(preferences={"minimum_year": 2024})
        car = self.car()
        self.car(year=2023)
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"], [str(car.id)])

    def test_decimal_reference_budget_bounds_are_inclusive(self):
        issue = self.issue(min_budget=Decimal("30000.25"), max_budget=Decimal("35000.50"))
        low = self.car(msrp=Decimal("30000.25"))
        high = self.car(msrp=Decimal("35000.50"))
        self.car(msrp=Decimal("30000.24"))
        self.car(msrp=Decimal("35000.51"))
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"], [str(low.id), str(high.id)])

    def test_combined_supported_criteria_all_apply(self):
        issue = self.issue(min_budget=30000, max_budget=35000, preferences={
            "preferred_makes": ["Toyota"], "preferred_models": ["Camry"], "minimum_year": 2024,
        })
        car = self.car()
        for changes in ({"make": "Honda"}, {"model": "Corolla"}, {"year": 2023},
                        {"msrp": 29999}, {"msrp": 35001}):
            self.car(**changes)
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"], [str(car.id)])

    def test_distinct_trim_variants_are_preserved_not_collapsed(self):
        issue = self.issue()
        se = self.car(trim="SE", msrp=30000)
        xle = self.car(trim="XLE", msrp=35000)
        result = search_new_catalog(issue.id, user=self.user)
        self.assertEqual(result["ids"]["catalog_ids"], [str(se.id), str(xle.id)])
        self.assertEqual([row["trim"] for row in result["data"]["matches"]], ["SE", "XLE"])

    def test_duplicate_exact_records_keep_distinct_catalog_identity(self):
        issue = self.issue()
        first = self.car()
        second = self.car()
        result = search_new_catalog(issue.id, user=self.user)
        self.assertEqual(set(result["ids"]["catalog_ids"]), {str(first.id), str(second.id)})
        self.assertEqual(result["data"]["result_count"], 2)

    def test_known_price_then_lower_msrp_then_newer_year_order(self):
        issue = self.issue()
        missing = self.car(msrp=None)
        expensive = self.car(msrp=35000)
        older = self.car(msrp=30000, year=2023)
        newer = self.car(msrp=30000, year=2024)
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"],
                         [str(car.id) for car in (newer, older, expensive, missing)])

    def test_stable_uuid_tie_order(self):
        issue = self.issue()
        high = self.car(id=UUID(int=9))
        low = self.car(id=UUID(int=1))
        expected = [str(low.id), str(high.id)]
        for _ in range(2):
            self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"], expected)

    def test_limit_is_after_filtering_and_global_ranking(self):
        issue = self.issue(max_budget=40000)
        self.car(id=UUID(int=1), make="", msrp=1)
        self.car(id=UUID(int=2), msrp=39000)
        best = self.car(id=UUID(int=99), msrp=30000)
        result = search_new_catalog(issue.id, limit=1, user=self.user)
        self.assertEqual(result["ids"]["catalog_ids"], [str(best.id)])

    def test_invalid_limit_values_are_rejected(self):
        issue = self.issue()
        for limit in (0, -1, True, False, 1.5, "5", None, 51, Decimal("5")):
            with self.subTest(limit=limit):
                self.assertEqual(search_new_catalog(issue.id, limit=limit, user=self.user)["status"], "error")

    def test_empty_catalog_returns_structured_no_results(self):
        result = search_new_catalog(self.issue().id, user=self.user)
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["matches"], [])
        self.assertEqual(result["data"]["result_count"], 0)
        self.assertEqual(result["ids"]["catalog_ids"], [])

    def test_no_matching_catalog_returns_no_results(self):
        issue = self.issue(preferences={"preferred_makes": ["Honda"]})
        self.car()
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["status"], "no_results")

    def test_missing_msrp_without_budget_is_explicitly_unpriced(self):
        issue = self.issue()
        car = self.car(msrp=None)
        result = search_new_catalog(issue.id, user=self.user)
        self.assertEqual(result["ids"]["catalog_ids"], [str(car.id)])
        match = result["data"]["matches"][0]
        self.assertIsNone(match["msrp"])
        self.assertTrue(any("MSRP is unavailable" in reason for reason in match["reasons"]))

    def test_missing_msrp_is_excluded_for_either_budget_bound(self):
        self.car(msrp=None)
        for budgets in ({"min_budget": 0}, {"max_budget": 40000}):
            with self.subTest(budgets=budgets):
                issue = self.issue(**budgets)
                self.assertEqual(search_new_catalog(issue.id, user=self.user)["status"], "no_results")

    def test_invalid_catalog_names_and_years_are_excluded(self):
        issue = self.issue()
        self.car(make="")
        self.car(model="   ")
        self.car(year=date.today().year + 2)
        valid = self.car()
        self.assertEqual(search_new_catalog(issue.id, user=self.user)["ids"]["catalog_ids"], [str(valid.id)])

    def test_invalid_native_msrp_values_are_rejected_by_real_serializer(self):
        issue = self.issue()
        # Inject malformed reader rows portably: model DB constraints normally
        # prevent negative numbers and SQLite cannot store numeric NaN safely.
        for price in (Decimal("NaN"), Decimal("Infinity"), Decimal("-1"), "bad"):
            row = {"id": uuid4(), "make": "Toyota", "model": "Camry", "year": 2024,
                   "trim": "SE", "msrp": price}
            with self.subTest(price=repr(price)):
                with patch("django.db.models.query.QuerySet.iterator", return_value=iter([row])):
                    result = search_new_catalog(issue.id, user=self.user)
                self.assertEqual(result["status"], "no_results")

    def test_malformed_saved_preferences_are_not_silently_ignored(self):
        self.car()
        for preferences in ([], "Toyota", {"preferred_makes": "Toyota"},
                            {"minimum_year": "2024"}, {"vehicle_type": []},
                            {"maximum_year": 2025}, {"trim": "SE"}):
            with self.subTest(preferences=preferences):
                issue = self.issue(preferences=preferences)
                self.assertEqual(search_new_catalog(issue.id, user=self.user)["status"], "error")

    def test_unsupported_hard_criteria_fail_closed_without_catalog_lookup(self):
        for preferences in ({"location": "Austin"}, {"fuel_type": "hybrid"}, {"maximum_mileage": 0}):
            issue = self.issue(preferences=preferences)
            with self.subTest(preferences=preferences):
                with CaptureQueriesContext(connection) as queries:
                    result = search_new_catalog(issue.id, user=self.user)
                self.assertEqual(result["status"], "error")
                self.assertFalse(any('"new_cars"' in query["sql"] for query in queries))

    def test_reasons_are_reference_price_checks_not_dealer_offers(self):
        issue = self.issue(min_budget=30000, max_budget=35000, preferences={
            "preferred_makes": ["Toyota"], "preferred_models": ["Camry"], "minimum_year": 2024,
        })
        self.car()
        result = search_new_catalog(issue.id, user=self.user)
        reasons = result["data"]["matches"][0]["reasons"]
        self.assertIn("Make Toyota matches a saved choice.", reasons)
        self.assertIn("Year 2024 meets minimum year 2024.", reasons)
        self.assertIn("MSRP 30000.25 meets minimum reference-price budget 30000.00.", reasons)
        self.assertIn("MSRP 30000.25 meets maximum reference-price budget 35000.00.", reasons)
        self.assertTrue(any("availability are not verified" in reason for reason in reasons))
        self.assertNotIn("available", result["data"]["matches"][0])

    def test_read_only_queries_and_no_private_owner_or_vehicle_data(self):
        issue = self.issue()
        self.car()
        before = (list(BuyIssue.objects.values()), list(NewCar.objects.values()))
        with CaptureQueriesContext(connection) as queries:
            result = search_new_catalog(issue.id, user=self.user)
        self.assertTrue(all(query["sql"].lstrip().upper().startswith("SELECT") for query in queries))
        self.assertFalse(any('"used_cars"' in q["sql"] or '"sell_issues"' in q["sql"] or '"posts"' in q["sql"]
                             for q in queries))
        self.assertEqual((list(BuyIssue.objects.values()), list(NewCar.objects.values())), before)
        self.assertNotIn("PRIVATE-admin@example.com", json.dumps(result))
        self.assertNotIn("owner", result["data"]["matches"][0])

    def test_used_only_request_returns_no_catalog_matches(self):
        issue = self.issue(preferences={"vehicle_type": "used", "maximum_mileage": 40000})
        self.car()
        result = search_new_catalog(issue.id, user=self.user)
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["result_count"], 0)

    def test_nullable_preferences_zero_msrp_and_json_safe_provenance(self):
        issue = self.issue(preferences=None, max_budget=0)
        self.car(msrp=0, trim="")
        result = search_new_catalog(issue.id, user=self.user)
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        match = result["data"]["matches"][0]
        self.assertEqual(match["msrp"], "0.00")
        self.assertEqual(match["price_basis"], "catalog_msrp")
        self.assertEqual(match["provenance"], "new_cars_catalog")
        self.assertEqual(result["provenance"], "new_cars_catalog")
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_database_or_native_decimal_conversion_failure_is_generic(self):
        issue = self.issue()
        for error in (DatabaseError("SECRET SQL"), InvalidOperation("SECRET conversion")):
            with self.subTest(error=type(error).__name__):
                with patch("django.db.models.query.QuerySet.iterator", side_effect=error):
                    result = search_new_catalog(issue.id, user=self.user)
                self.assertEqual(result["error"], "New-car catalog search is unavailable.")
                self.assertNotIn("SECRET", json.dumps(result))

    def test_default_limit_is_five(self):
        issue = self.issue()
        for price in range(30000, 30006):
            self.car(msrp=price)
        result = search_new_catalog(issue.id, user=self.user)
        self.assertEqual(result["data"]["result_count"], 5)
