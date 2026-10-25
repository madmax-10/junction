"""Synthetic, isolated public listings and private requests; no external calls."""

import json
from decimal import Decimal
from unittest.mock import patch
from uuid import UUID, uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.buy_issue_service import create_or_update_buy_issue
from agent.services.buyer_search_service import search_and_rank_used
from issues.models import BuyIssue, SellIssue
from posts.models import Post
from vehicles.models import UsedCar


class BuyerSearchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="search-a@example.com", name="Buyer A")
        cls.other = User.objects.create_user(email="search-b@example.com", name="Seller B")

    def issue(self, **changes):
        data = {"user": self.user, "description": "Need a Toyota", "preferences": {}}
        data.update(changes)
        return BuyIssue.objects.create(**data)

    def post(self, *, status=Post.Status.PUBLISHED, issue_type=Post.IssueType.SELL,
             post_id=None, **changes):
        data = {"make": "Toyota", "model": "Camry", "year": 2020,
                "mileage": 40000, "asking_price": "12000.00", "location": "Austin, TX"}
        data.update(changes)
        return Post.objects.create(
            id=post_id or uuid4(), issue_id=uuid4(), issue_type=issue_type, status=status,
            title="Synthetic test listing", content="Private-looking text should not be returned",
            post_data=data,
        )

    def test_task_31_saved_issue_produces_matching_public_recommendations(self):
        saved = create_or_update_buy_issue(
            "Need a Camry", max_budget="15000.00",
            preferences={"preferred_makes": ["Toyota"], "vehicle_type": "used"}, user=self.user,
        )
        listing = self.post()
        result = search_and_rank_used(saved["data"]["id"], user=self.user)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["result_count"], 1)
        self.assertEqual(result["ids"]["post_ids"], [str(listing.id)])
        self.assertEqual(result["data"]["matches"][0]["asking_price"], "12000.00")
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_foreign_missing_and_malformed_issue_ids_have_same_private_error(self):
        foreign = self.issue(user=self.other, description="SECRET buyer request")
        responses = [search_and_rank_used(target, user=self.user)
                     for target in (foreign.id, uuid4(), "bad", None, True)]
        for result in responses:
            self.assertEqual(result, responses[0])
            self.assertEqual(result["error"], "Buy issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertNotIn("SECRET", json.dumps(responses))

    def test_unauthenticated_or_inactive_identity_cannot_search(self):
        issue = self.issue()
        for user in (None, AnonymousUser(), {"user_id": str(self.user.id)},
                     User(email="unsaved@example.com", name="Unsaved")):
            with self.subTest(user=user):
                self.assertEqual(search_and_rank_used(issue.id, user=user)["status"], "error")
        User.objects.filter(pk=self.user.id).update(is_active=False)
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["status"], "error")

    def test_decimal_budget_bounds_are_inclusive(self):
        issue = self.issue(min_budget=Decimal("10000.01"), max_budget=Decimal("12000.01"))
        low = self.post(asking_price="10000.01")
        high = self.post(asking_price="12000.01")
        self.post(asking_price="10000.00")
        self.post(asking_price="12000.02")
        result = search_and_rank_used(issue.id, user=self.user)
        self.assertEqual(result["ids"]["post_ids"], [str(low.id), str(high.id)])

    def test_make_and_model_choices_are_case_insensitive_exact_and_combined(self):
        issue = self.issue(preferences={"preferred_makes": ["toyota"], "preferred_models": ["CAMRY"]})
        matching = self.post()
        self.post(make="Honda")
        self.post(model="Corolla")
        self.post(model="Camry Hybrid")
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["ids"]["post_ids"], [str(matching.id)])

    def test_year_mileage_and_location_constraints_are_inclusive(self):
        issue = self.issue(preferences={"minimum_year": 2020, "maximum_mileage": 40000, "location": "austin"})
        matching = self.post()
        self.post(year=2019)
        self.post(mileage=40001)
        self.post(location="Dallas, TX")
        self.post(location=None)
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["ids"]["post_ids"], [str(matching.id)])

    def test_combined_hard_constraints_all_apply(self):
        issue = self.issue(min_budget=10000, max_budget=13000, preferences={
            "preferred_makes": ["Toyota"], "preferred_models": ["Camry"],
            "minimum_year": 2020, "maximum_mileage": 50000, "location": "Austin",
        })
        matching = self.post()
        for changes in ({"make": "Honda"}, {"model": "Corolla"}, {"year": 2019},
                        {"mileage": 50001}, {"location": "Dallas"}, {"asking_price": 9999},
                        {"asking_price": 13001}):
            self.post(**changes)
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["ids"]["post_ids"], [str(matching.id)])

    def test_ranking_is_price_then_newer_year_then_lower_mileage(self):
        issue = self.issue()
        expensive = self.post(asking_price=15000, year=2024, mileage=10000)
        older = self.post(asking_price=12000, year=2019, mileage=10000)
        high_mileage = self.post(asking_price=12000, year=2020, mileage=50000)
        low_mileage = self.post(asking_price=12000, year=2020, mileage=30000)
        cheap = self.post(asking_price=10000, year=2018, mileage=90000)
        result = search_and_rank_used(issue.id, user=self.user)
        self.assertEqual(result["ids"]["post_ids"],
                         [str(p.id) for p in (cheap, low_mileage, high_mileage, older, expensive)])

    def test_uuid_is_stable_final_tie_breaker(self):
        issue = self.issue()
        high = self.post(post_id=UUID(int=9))
        low = self.post(post_id=UUID(int=1))
        expected = [str(low.id), str(high.id)]
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["ids"]["post_ids"], expected)
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["ids"]["post_ids"], expected)

    def test_limit_is_applied_after_global_filtering_and_ranking(self):
        issue = self.issue(max_budget=15000)
        self.post(post_id=UUID(int=1), asking_price="invalid")
        self.post(post_id=UUID(int=2), asking_price=14000)
        best = self.post(post_id=UUID(int=999), asking_price=10000)
        result = search_and_rank_used(issue.id, limit=1, user=self.user)
        self.assertEqual(result["ids"]["post_ids"], [str(best.id)])
        self.assertEqual(result["data"]["result_count"], 1)

    def test_invalid_limits_are_rejected_not_coerced(self):
        issue = self.issue()
        for limit in (0, -1, True, False, 1.5, "5", None, 51, 1000000, Decimal("5")):
            with self.subTest(limit=limit):
                self.assertEqual(search_and_rank_used(issue.id, limit=limit, user=self.user)["status"], "error")

    def test_no_matching_vehicles_returns_no_results(self):
        issue = self.issue(preferences={"preferred_makes": ["Honda"]})
        self.post()
        result = search_and_rank_used(issue.id, user=self.user)
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["matches"], [])
        self.assertEqual(result["data"]["result_count"], 0)
        self.assertEqual(result["ids"]["post_ids"], [])

    def test_private_sell_issues_and_private_registered_cars_are_never_inventory(self):
        issue = self.issue()
        car = UsedCar.objects.create(owner=self.other, make="Toyota", model="Camry", year=2020, mileage=40000)
        SellIssue.objects.create(user=self.other, used_car=car, description="PRIVATE sale", asking_price=12000)
        result = search_and_rank_used(issue.id, user=self.user)
        self.assertEqual(result["status"], "no_results")
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_only_published_sell_posts_are_eligible(self):
        issue = self.issue()
        for status in (Post.Status.DRAFT, Post.Status.APPROVED, Post.Status.ARCHIVED):
            self.post(status=status)
        self.post(issue_type=Post.IssueType.BUY)
        self.post(issue_type=Post.IssueType.REPAIR)
        published = self.post()
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["ids"]["post_ids"], [str(published.id)])

    def test_invalid_or_incomplete_public_vehicle_data_and_prices_are_excluded(self):
        issue = self.issue()
        for changes in (
            {"make": None}, {"model": ""}, {"year": None}, {"year": "2020"}, {"year": True},
            {"year": 1899}, {"mileage": None}, {"mileage": -1}, {"mileage": True},
            {"asking_price": None}, {"asking_price": ""}, {"asking_price": "bad"},
            {"asking_price": "NaN"}, {"asking_price": "Infinity"}, {"asking_price": -1},
            {"asking_price": True}, {"asking_price": []}, {"asking_price": "1.001"},
        ):
            self.post(**changes)
        for data in ([], "invalid", {}, {"make": "Toyota"}):
            post = self.post()
            Post.objects.filter(pk=post.id).update(post_data=data)
        valid = self.post(asking_price=12000.25)
        self.assertEqual(search_and_rank_used(issue.id, user=self.user)["ids"]["post_ids"], [str(valid.id)])

    def test_private_contacts_profiles_and_arbitrary_snapshot_fields_are_not_exposed(self):
        issue = self.issue()
        self.post(contact={"email": "SECRET@example.com"}, owner_id=str(self.other.id),
                  private_data="SECRET private vehicle", trim="SE")
        result = search_and_rank_used(issue.id, user=self.user)
        self.assertNotIn("SECRET", json.dumps(result))
        self.assertNotIn("search-b@example.com", json.dumps(result))
        self.assertEqual(result["data"]["matches"][0]["vehicle"]["trim"], "SE")

    def test_search_performs_only_selects_and_preserves_database(self):
        issue = self.issue()
        self.post()
        before = (list(BuyIssue.objects.values()), list(Post.objects.values()))
        with CaptureQueriesContext(connection) as queries:
            result = search_and_rank_used(issue.id, user=self.user)
        self.assertEqual(result["status"], "ok")
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertFalse(any('"sell_issues"' in q["sql"] or '"used_cars"' in q["sql"] for q in queries))
        self.assertEqual((list(BuyIssue.objects.values()), list(Post.objects.values())), before)

    def test_match_reasons_describe_actual_saved_constraints(self):
        issue = self.issue(min_budget=10000, max_budget=15000, preferences={
            "preferred_makes": ["Toyota"], "preferred_models": ["Camry"],
            "minimum_year": 2020, "maximum_mileage": 40000, "location": "Austin",
        })
        self.post()
        reasons = search_and_rank_used(issue.id, user=self.user)["data"]["matches"][0]["reasons"]
        self.assertIn("Make Toyota matches a saved choice.", reasons)
        self.assertIn("Model Camry matches a saved choice.", reasons)
        self.assertIn("Year 2020 meets minimum year 2020.", reasons)
        self.assertIn("Mileage 40000 meets maximum mileage 40000.", reasons)
        self.assertIn("Asking price 12000.00 meets minimum budget 10000.00.", reasons)
        self.assertIn("Asking price 12000.00 meets maximum budget 15000.00.", reasons)
        self.assertIn("Public location contains saved location Austin.", reasons)

    def test_explicit_synthetic_flags_are_preserved_and_not_claimed_genuine(self):
        issue = self.issue()
        synthetic = self.post(synthetic=True)
        demo = self.post(is_synthetic=True)
        unmarked = self.post()
        result = search_and_rank_used(issue.id, user=self.user)
        matches = {item["post_id"]: item for item in result["data"]["matches"]}
        self.assertEqual(matches[str(synthetic.id)]["synthetic_flags"], {"synthetic": True})
        self.assertEqual(matches[str(demo.id)]["synthetic_flags"], {"is_synthetic": True})
        self.assertEqual(matches[str(synthetic.id)]["provenance"], "synthetic_demo")
        self.assertEqual(matches[str(unmarked.id)]["provenance"], "published_sell_post_unverified")

    def test_saved_malformed_or_unsupported_preferences_fail_closed(self):
        for preferences in ([], "Toyota", {"maximum_year": 2025}, {"minimum_year": "2020"},
                            {"maximum_mileage": True}, {"vehicle_type": []},
                            {"fuel_type": "hybrid"}, {"preferred_makes": "Toyota"}):
            with self.subTest(preferences=preferences):
                issue = self.issue(preferences=preferences)
                self.post()
                self.assertEqual(search_and_rank_used(issue.id, user=self.user)["status"], "error")

    def test_new_only_request_does_not_return_used_listings(self):
        issue = self.issue(preferences={"vehicle_type": "new"})
        self.post()
        result = search_and_rank_used(issue.id, user=self.user)
        self.assertEqual(result["status"], "no_results")
        self.assertEqual(result["data"]["result_count"], 0)

    def test_nullable_preferences_and_zero_price_are_valid(self):
        issue = self.issue(preferences=None, min_budget=0, max_budget=0)
        post = self.post(asking_price=0)
        result = search_and_rank_used(issue.id, user=self.user)
        self.assertEqual(result["ids"]["post_ids"], [str(post.id)])
        self.assertEqual(result["data"]["matches"][0]["asking_price"], "0.00")

    def test_database_errors_are_generic(self):
        with patch("agent.services.buyer_search_service.BuyIssue.objects.filter", side_effect=DatabaseError("SECRET SQL")):
            result = search_and_rank_used(uuid4(), user=self.user)
        self.assertEqual(result["error"], "Used-car search is unavailable.")
        self.assertNotIn("SECRET", json.dumps(result))
