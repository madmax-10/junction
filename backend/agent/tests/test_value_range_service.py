"""Synthetic fixtures isolated in Django's test database; not market evidence."""

import json
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.value_range_service import calculate_value_range
from agent.services.valuation_service import estimate
from posts.models import Post
from django.utils import timezone
from vehicles.models import NewCar, UsedCar


class ValueRangeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="owner@example.com", name="Owner")
        cls.other = User.objects.create_user(email="other@example.com", name="Other")
        cls.car = UsedCar.objects.create(
            owner=cls.user, make="Toyota", model="Camry", year=2024,
            mileage=40000, trim="SE", condition="PRIVATE condition",
        )

    def weighting_fixture(self, subject, comparables):
        return {"weights": [{"post_id": row["post_id"], "weight": "1", "reason": "Matching make/model fixture"} for row in comparables]}

    def setUp(self):
        mock = patch("agent.services.ai_valuation_service.gemini_weights", side_effect=self.weighting_fixture)
        mock.start()
        self.addCleanup(mock.stop)

    def create_post(self, *, status=Post.Status.PUBLISHED,
                    issue_type=Post.IssueType.SELL, **changes):
        data = {
            "make": "Toyota", "model": "Camry", "year": 2024,
            "mileage": 40000, "asking_price": "12000.00",
        }
        data.update(changes)
        return Post.objects.create(
            approved_at=timezone.now(), issue_id=uuid4(), issue_type=issue_type, status=status,
            title="Synthetic fixture", content="PRIVATE text not returned", post_data=data,
        )

    def three_posts(self):
        return [self.create_post(asking_price=price) for price in ("10000.00", "12000.00", "15000.00")]

    def test_owned_vehicle_and_exact_estimate_integration(self):
        posts = self.three_posts()
        with patch("agent.services.value_range_service.estimate", wraps=estimate) as calculation:
            result = calculate_value_range(self.car.id, [p.id for p in posts], user=self.user)
        calculation.assert_called_once()
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["status"], "completed")
        self.assertEqual(result["data"]["sample_size"], 3)
        self.assertEqual([result["data"][k] for k in ("low", "median", "high")],
                         ["10000.00", None, "15000.00"])
        self.assertEqual(result["ids"]["post_ids"], [str(p.id) for p in posts])
        self.assertEqual(result["data"]["price_basis"], "asking")

    def test_msrp_is_separate_and_cannot_change_range(self):
        posts = self.three_posts()
        catalog = NewCar.objects.create(
            owner=self.user, make="Toyota", model="Camry", year=2024,
            trim="SE", msrp=Decimal("99999.99"),
        )
        result = calculate_value_range(self.car.id, [p.id for p in posts], user=self.user)
        self.assertEqual(result["data"]["msrp_reference"]["catalog_id"], str(catalog.id))
        self.assertEqual(result["data"]["msrp_reference"]["msrp"], "99999.99")
        self.assertIsNone(result["data"]["median"])
        self.assertTrue(Decimal(result["data"]["estimated_value"]) > Decimal("12000"))

    def test_nonexistent_foreign_and_malformed_vehicles_have_identical_errors(self):
        results = [
            calculate_value_range(uuid4(), [], user=self.user),
            calculate_value_range(self.car.id, [], user=self.other),
            calculate_value_range("malformed", [], user=self.user),
        ]
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[1], results[2])
        self.assertEqual(results[0]["status"], "error")
        self.assertIsNone(results[0]["data"])
        self.assertEqual(results[0]["ids"], {})

    def test_unauthenticated_or_inactive_user_cannot_query_vehicle(self):
        inactive = User.objects.create_user(email="inactive@example.com", name="Inactive", is_active=False)
        for user in (AnonymousUser(), None, inactive):
            with self.subTest(user=user):
                with self.assertNumQueries(0):
                    result = calculate_value_range(self.car.id, [], user=user)
                self.assertEqual(result["error"], "Vehicle not found.")

    def test_draft_approved_archived_repair_and_buy_posts_are_excluded(self):
        excluded = [self.create_post(status=s) for s in
                    (Post.Status.DRAFT, Post.Status.APPROVED, Post.Status.ARCHIVED)]
        excluded.extend(self.create_post(issue_type=t) for t in (Post.IssueType.BUY, Post.IssueType.REPAIR))
        result = calculate_value_range(self.car.id, [p.id for p in excluded], user=self.user)
        self.assertEqual(result["status"], "insufficient_data")
        self.assertEqual(result["data"]["sample_size"], 0)
        self.assertEqual(result["ids"]["post_ids"], [])

    def test_invalid_snapshots_prices_and_synthetic_posts_are_excluded(self):
        invalid = [
            {"asking_price": None}, {"asking_price": "bad"}, {"asking_price": -1},
            {"asking_price": "NaN"}, {"asking_price": "Infinity"}, {"asking_price": True},
            {"synthetic": True}, {"is_synthetic": True}, {"year": None},
            {"year": "2024"}, {"mileage": None}, {"mileage": -1},
        ]
        posts = [self.create_post(**changes) for changes in invalid]
        result = calculate_value_range(self.car.id, [p.id for p in posts], user=self.user)
        self.assertEqual(result["data"]["sample_size"], 0)
        self.assertIsNone(result["data"]["median"])

    def test_other_make_or_model_and_unselected_posts_are_not_used(self):
        posts = self.three_posts()
        unrelated = [self.create_post(make="Honda"), self.create_post(model="Corolla")]
        self.create_post(asking_price="999999.99")  # not selected
        result = calculate_value_range(
            self.car.id, [p.id for p in posts + unrelated], user=self.user
        )
        self.assertEqual(result["data"]["sample_size"], 3)
        self.assertEqual(result["data"]["high"], "15000.00")

    def test_duplicate_uuid_forms_count_once(self):
        post = self.create_post()
        result = calculate_value_range(
            self.car.id, [post.id, str(post.id), post.id.hex.upper()], user=self.user
        )
        self.assertEqual(result["data"]["sample_size"], 1)
        self.assertEqual(result["data"]["comparable_post_ids"], [str(post.id)])
        self.assertEqual(result["status"], "insufficient_data")

    def test_empty_one_and_two_comparables_have_no_numeric_range(self):
        posts = self.three_posts()
        for count in (1, 2):
            with self.subTest(count=count):
                result = calculate_value_range(self.car.id, [p.id for p in posts[:count]], user=self.user)
                self.assertEqual(result["status"], "insufficient_data")
                self.assertEqual(result["data"]["sample_size"], count)
                for field in ("low", "median", "high"):
                    self.assertIsNone(result["data"][field])

    def test_missing_and_malformed_post_ids_are_excluded_without_details(self):
        result = calculate_value_range(self.car.id, [uuid4(), "bad", None, True], user=self.user)
        self.assertEqual(result["data"]["sample_size"], 0)
        self.assertNotIn("bad", json.dumps(result))

    def test_invalid_collection_is_rejected(self):
        for value in ("one-id", {}, 1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                calculate_value_range(self.car.id, value, user=self.user)

    def test_no_catalog_match_does_not_block_comparable_valuation(self):
        posts = self.three_posts()
        result = calculate_value_range(self.car.id, [p.id for p in posts], user=self.user)
        self.assertEqual(result["status"], "ok")
        self.assertIsNone(result["data"]["msrp_reference"])
        self.assertTrue(any("No catalog entry" in text for text in result["data"]["limitations"]))

    def test_no_private_fields_or_post_contacts_are_returned(self):
        post = self.create_post(contact={"email": "SECRET@example.com"}, known_damage="PUBLIC damage")
        result = calculate_value_range(self.car.id, [post.id], user=self.user)
        serialized = json.dumps(result)
        for secret in ("SECRET@example.com", "PRIVATE condition", "PRIVATE text", "owner@example.com"):
            self.assertNotIn(secret, serialized)
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})

    def test_no_database_writes(self):
        posts = self.three_posts()
        before = list(Post.objects.values())
        with CaptureQueriesContext(connection) as queries:
            calculate_value_range(self.car.id, [p.id for p in posts], user=self.user)
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(list(Post.objects.values()), before)

    def test_automatic_discovery_and_non_median_weighted_estimate(self):
        posts = self.three_posts()
        def provider(subject, comparables):
            self.assertEqual(subject["condition"], self.car.condition)
            weights = {str(posts[0].id): "0.1", str(posts[1].id): "0.2", str(posts[2].id): "0.7"}
            return {"weights": [{"post_id": row["post_id"], "weight": weights[row["post_id"]], "reason": "Fixture relevance"} for row in comparables]}
        result = calculate_value_range(self.car.id, user=self.user, provider=provider)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(Decimal(result["data"]["estimated_value"]), Decimal("13900"))
        self.assertIsNone(result["data"]["median"])
        data = result["data"]
        self.assertEqual(data["method"], "ai_weighted_asking_mean")
        self.assertEqual(data["formula"], "sum(asking_price * weight) / sum(weight)")
        self.assertEqual(data["weighting_provider"], "injected")
        self.assertIsNone(data["weighting_model"])
        evidence = {row["post_id"]: row for row in data["weight_evidence"]}
        self.assertEqual(set(evidence), {str(post.id) for post in posts})
        self.assertEqual(evidence[str(posts[0].id)], {
            "post_id": str(posts[0].id), "weight": "0.1", "reason": "Fixture relevance",
            "asking_price": "10000.00",
        })
        recomputed = sum(Decimal(row["asking_price"]) * Decimal(row["weight"])
                         for row in evidence.values()) / sum(Decimal(row["weight"]) for row in evidence.values())
        self.assertEqual(recomputed, Decimal(data["estimated_value"]))

    def test_default_provider_metadata_identifies_configured_model(self):
        from agent.config import AGENT_MODEL
        self.three_posts()
        result = calculate_value_range(self.car.id, user=self.user)
        self.assertEqual(result["data"]["weighting_provider"], "gemini")
        self.assertEqual(result["data"]["weighting_model"], AGENT_MODEL)
        self.assertEqual(len(result["data"]["weight_evidence"]), 3)

    def test_provider_failure_never_becomes_successful_estimate(self):
        self.three_posts()
        def failing(subject, comparables):
            raise RuntimeError("PRIVATE provider detail")
        result = calculate_value_range(self.car.id, user=self.user, provider=failing)
        self.assertEqual(result["status"], "insufficient_data")
        self.assertIsNone(result["data"]["estimated_value"])
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(result["data"]["weight_evidence"], [])
        self.assertIsNone(result["data"]["weighting_model"])

    def test_ungrounded_duplicate_and_invalid_provider_weights_are_rejected(self):
        posts = self.three_posts()
        valid = [{"post_id": str(post.id), "weight": "1", "reason": "Fixture"} for post in posts]
        for rows in ([dict(row, post_id=str(uuid4())) for row in valid],
                     [valid[0], valid[0], valid[2]],
                     [dict(row, weight="NaN") for row in valid],
                     [dict(row, weight="-1") for row in valid],
                     [dict(row, weight="0") for row in valid]):
            with self.subTest(rows=rows):
                result = calculate_value_range(self.car.id, user=self.user, provider=lambda subject, comparables: {"weights": rows})
                self.assertEqual(result["status"], "insufficient_data")
                self.assertIsNone(result["data"]["estimated_value"])
