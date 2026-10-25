"""Synthetic isolated vehicle fixtures; real authentication and ownership checks."""

import json
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.seller_vehicle_service import get_vehicle_details
from issues.models import BuyIssue, RepairIssue, SellIssue
from posts.models import Post
from vehicles.models import UsedCar


class SellerVehicleServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="seller-vehicle@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2021,
                                         trim="SE", mileage=45000, condition="Owner reports worn upholstery")
        cls.foreign = UsedCar.objects.create(owner=cls.other, make="PRIVATE make", model="PRIVATE model", year=2020, mileage=20000)

    def test_success_fields_and_shared_envelope(self):
        result = get_vehicle_details(self.car.pk, user=self.user)
        self.assertEqual(result, {
            "status": "ok", "data": {"id": str(self.car.pk), "make": "Toyota", "model": "Camry",
                                       "year": 2021, "trim": "SE", "mileage": 45000, "condition": "Owner reports worn upholstery"},
            "ids": {"used_car_id": str(self.car.pk)}, "provenance": "own_used_cars", "error": None,
        })
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_saved_uuid_string_supported(self):
        self.assertEqual(get_vehicle_details(str(self.car.pk), user=self.user)["status"], "ok")

    def test_missing_anonymous_and_untrusted_identity(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, str(self.user.pk),
                     SimpleNamespace(state={"user_id": str(self.user.pk)}), User(email="unsaved@example.com")):
            with self.subTest(user=repr(user)):
                result = get_vehicle_details(self.car.pk, user=user)
                self.assertEqual(result["error"], "Authentication is required.")
                self.assertIsNone(result["data"])
                self.assertEqual(result["ids"], {})
        self.assertEqual(get_vehicle_details(self.car.pk)["error"], "Authentication is required.")

    def test_inactive_stale_user(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(get_vehicle_details(self.car.pk, user=self.user)["error"], "Authentication is required.")

    def test_deleted_user(self):
        user = User.objects.create_user(email="deleted-seller@example.com", name="Deleted")
        User.objects.filter(pk=user.pk).delete()
        self.assertEqual(get_vehicle_details(self.car.pk, user=user)["error"], "Authentication is required.")

    def test_private_missing_and_malformed_identifiers_share_generic_error(self):
        results = [get_vehicle_details(key, user=self.user)
                   for key in (self.foreign.pk, uuid4(), "bad", "", None, True, False, 1, 1.0, [], {}, object())]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Car not found.")
            self.assertEqual(result["provenance"], "own_used_cars")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(results))

    def test_staff_has_no_ownership_override(self):
        self.assertEqual(get_vehicle_details(self.car.pk, user=self.other)["error"], "Car not found.")

    def test_owner_transfer_is_observed(self):
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(get_vehicle_details(self.car.pk, user=self.user)["error"], "Car not found.")
        self.assertEqual(get_vehicle_details(self.car.pk, user=self.other)["status"], "ok")

    def test_blank_optional_fields_and_zero_mileage_preserved(self):
        car = UsedCar.objects.create(owner=self.user, make="Toyota", model="Corolla", year=2022, mileage=0)
        result = get_vehicle_details(car.pk, user=self.user)
        self.assertEqual(result["data"]["trim"], "")
        self.assertEqual(result["data"]["condition"], "")
        self.assertEqual(result["data"]["mileage"], 0)

    def test_only_actual_allowlisted_fields_no_fabrication(self):
        result = get_vehicle_details(self.car.pk, user=self.user)
        self.assertEqual(set(result["data"]), {"id", "make", "model", "year", "trim", "mileage", "condition"})
        for field in ("vin", "msrp", "asking_price", "accident_history", "owner_id", "created_at", "contact"):
            self.assertNotIn(field, result["data"])

    def test_no_unrelated_private_data_or_queries(self):
        BuyIssue.objects.create(user=self.user, description="PRIVATE buying")
        RepairIssue.objects.create(user=self.user, used_car=self.car, description="PRIVATE repair", ai_analysis={"notes": "PRIVATE hypothesis"})
        SellIssue.objects.create(user=self.user, used_car=self.car, description="PRIVATE sale", contact_info={"email": "PRIVATE@example.com"})
        with CaptureQueriesContext(connection) as queries:
            result = get_vehicle_details(self.car.pk, user=self.user)
        self.assertEqual(len(queries), 2)
        text = json.dumps(result)
        self.assertNotIn("PRIVATE", text)
        self.assertNotIn(str(self.user.pk), text)
        self.assertNotIn(str(self.foreign.pk), text)
        for query in queries:
            self.assertFalse(any(table in query["sql"] for table in ('"buy_issues"', '"repair_issues"', '"sell_issues"', '"posts"')))

    def test_no_database_writes_no_issue_or_post_creation(self):
        before = (list(UsedCar.objects.values()), list(User.objects.values()))
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(get_vehicle_details(self.car.pk, user=self.user)["status"], "ok")
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(before, (list(UsedCar.objects.values()), list(User.objects.values())))
        self.assertFalse(SellIssue.objects.exists())
        self.assertFalse(Post.objects.exists())

    def test_failed_auth_and_lookup_do_not_write(self):
        before = list(UsedCar.objects.values())
        with CaptureQueriesContext(connection) as queries:
            get_vehicle_details(self.car.pk)
            get_vehicle_details(self.foreign.pk, user=self.user)
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertEqual(before, list(UsedCar.objects.values()))

    def test_no_external_or_model_requests(self):
        with patch("socket.socket.connect", side_effect=AssertionError("No external requests")) as network:
            with patch("google.adk.models.google_llm.Gemini.generate_content_async") as model:
                self.assertEqual(get_vehicle_details(self.car.pk, user=self.user)["status"], "ok")
            model.assert_not_called()
        network.assert_not_called()

    def test_database_error_is_generic(self):
        with patch.object(UsedCar.objects, "filter", side_effect=DatabaseError("PRIVATE SQL")):
            result = get_vehicle_details(self.car.pk, user=self.user)
        self.assertEqual(result["error"], "Unable to retrieve vehicle details.")
        self.assertIsNone(result["data"])
        self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_no_truncation_or_invented_toyota_only_constraint(self):
        condition = "Owner observation. " * 1000
        car = UsedCar.objects.create(owner=self.user, make="Honda", model="Civic", year=2020, mileage=10000, condition=condition)
        result = get_vehicle_details(car.pk, user=self.user)
        self.assertEqual(result["data"]["condition"], condition)
        self.assertEqual(result["data"]["make"], "Honda")
