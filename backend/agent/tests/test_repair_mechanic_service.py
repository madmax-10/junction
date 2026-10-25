"""Mocked HTTP contract tests; no real Google requests or credentials."""

import json
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import httpx
from django.contrib.auth.models import AnonymousUser
from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from accounts.models import User
from agent.services.repair_mechanic_service import find_nearby_mechanics
from issues.models import RepairIssue
from vehicles.models import UsedCar


class RepairMechanicServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="mechanic@example.com", name="Owner")
        cls.other = User.objects.create_user(email="PRIVATE@example.com", name="Other", is_staff=True)
        cls.car = UsedCar.objects.create(owner=cls.user, make="Toyota", model="Camry", year=2020, mileage=40000)
        cls.issue = RepairIssue.objects.create(user=cls.user, used_car=cls.car, description="PRIVATE brake failure",
                                             symptoms={"confirmed": ["PRIVATE smoke"]}, ai_analysis={"notes": "PRIVATE"})
        cls.foreign = RepairIssue.objects.create(user=cls.other, used_car=cls.car, description="PRIVATE")

    def setUp(self):
        self.env = patch.dict("os.environ", {"GOOGLE_PLACES_API_KEY": "unit-test-placeholder"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.http = patch("agent.services.repair_mechanic_service.httpx.post")
        self.post = self.http.start()
        self.addCleanup(self.http.stop)
        self.post.return_value = httpx.Response(200, json={"places": [{
            "id": "synthetic-test-place", "displayName": {"text": "Synthetic Test Garage"},
            "formattedAddress": "Synthetic test address", "googleMapsUri": "https://maps.google.com/?cid=1",
            "location": {"latitude": 30.26, "longitude": -97.74},
        }]})

    def search(self, **kwargs):
        args = {"repair_issue_id": self.issue.pk, "latitude": 30.2672, "longitude": -97.7431, "user": self.user}
        args.update(kwargs)
        return find_nearby_mechanics(**args)

    def test_success_mapping_and_json_contract(self):
        result = self.search()
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["provenance"], "google_places")
        self.assertEqual(result["data"]["result_count"], 1)
        mechanic = result["data"]["mechanics"][0]
        self.assertEqual(mechanic["place_id"], "synthetic-test-place")
        self.assertEqual(mechanic["name"], "Synthetic Test Garage")
        self.assertEqual(mechanic["formatted_address"], "Synthetic test address")
        self.assertEqual(mechanic["coordinates"], {"latitude": "30.26", "longitude": "-97.74"})
        self.assertEqual(mechanic["source"], "Google Places")
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_exact_endpoint_body_headers_timeout_and_no_retry(self):
        self.search()
        self.post.assert_called_once()
        args, kwargs = self.post.call_args
        self.assertEqual(args, ("https://places.googleapis.com/v1/places:searchNearby",))
        self.assertEqual(kwargs["json"], {
            "includedTypes": ["car_repair"], "maxResultCount": 5, "rankPreference": "DISTANCE",
            "locationRestriction": {"circle": {"center": {"latitude": 30.2672, "longitude": -97.7431}, "radius": 10000.0}},
        })
        self.assertEqual(kwargs["headers"]["Content-Type"], "application/json")
        self.assertEqual(kwargs["headers"]["X-Goog-Api-Key"], "unit-test-placeholder")
        self.assertEqual(kwargs["headers"]["X-Goog-FieldMask"], "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location")
        self.assertEqual(kwargs["timeout"], 10.0)
        self.assertFalse(kwargs["follow_redirects"])

    def test_authentication_required_before_network(self):
        for user in (None, AnonymousUser(), {"user_id": str(self.user.pk)}, User(email="unsaved@example.com")):
            self.assertEqual(self.search(user=user)["error"], "Authentication is required.")
        self.post.assert_not_called()

    def test_stale_inactive_user(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.search()["error"], "Authentication is required.")
        self.post.assert_not_called()

    def test_private_missing_and_invalid_ids_identical(self):
        results = [self.search(repair_issue_id=key) for key in (self.foreign.pk, uuid4(), "bad", "", None, True, 1, [], {})]
        for result in results:
            self.assertEqual(result, results[0])
            self.assertEqual(result["error"], "Repair issue not found.")
            self.assertIsNone(result["data"])
            self.assertEqual(result["ids"], {})
        self.post.assert_not_called()

    def test_vehicle_ownership_rechecked(self):
        UsedCar.objects.filter(pk=self.car.pk).update(owner=self.other)
        self.assertEqual(self.search()["error"], "Repair issue not found.")
        self.post.assert_not_called()

    def test_staff_no_override(self):
        self.assertEqual(self.search(user=self.other)["error"], "Repair issue not found.")
        self.post.assert_not_called()

    def test_uuid_string_supported(self):
        self.assertEqual(self.search(repair_issue_id=str(self.issue.pk))["status"], "ok")

    def test_coordinate_boundaries_and_decimal(self):
        for lat, lng in ((-90, -180), (90, 180), (0, 0), (Decimal("30.2672"), Decimal("-97.7431"))):
            self.assertEqual(self.search(latitude=lat, longitude=lng)["status"], "ok")

    def test_out_of_range_coordinates(self):
        for key, values in (("latitude", (-90.1, 90.1)), ("longitude", (-180.1, 180.1))):
            for value in values:
                self.assertEqual(self.search(**{key: value})["status"], "error")
        self.post.assert_not_called()

    def test_boolean_nonfinite_missing_and_malformed_location(self):
        for key in ("latitude", "longitude"):
            for value in (True, False, float("nan"), float("inf"), Decimal("sNaN"), None, "30", [], 10**1000):
                self.assertEqual(self.search(**{key: value})["status"], "error")
        self.post.assert_not_called()

    def test_radius_validation(self):
        for radius in (0, -1, 50001, True, None, "100", float("nan"), float("inf")):
            self.assertEqual(self.search(radius_meters=radius)["status"], "error")
        self.post.assert_not_called()
        for radius in (1, 50000, Decimal("100.5")):
            self.assertEqual(self.search(radius_meters=radius)["status"], "ok")

    def test_limit_validation(self):
        for limit in (0, -1, 11, True, None, "5", 5.0):
            self.assertEqual(self.search(limit=limit)["status"], "error")
        self.post.assert_not_called()
        self.search(limit=10)
        self.assertEqual(self.post.call_args.kwargs["json"]["maxResultCount"], 10)

    def test_optional_fields_missing(self):
        self.post.return_value = httpx.Response(200, json={"places": [{"id": "test", "displayName": {"text": "Test"}}]})
        mechanic = self.search()["data"]["mechanics"][0]
        self.assertNotIn("coordinates", mechanic)
        self.assertNotIn("formatted_address", mechanic)
        self.assertNotIn("google_maps_url", mechanic)

    def test_empty_response_is_success(self):
        for payload in ({}, {"places": []}):
            self.post.return_value = httpx.Response(200, json=payload)
            result = self.search()
            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["data"]["mechanics"], [])
            self.assertEqual(result["data"]["result_count"], 0)

    def test_missing_configuration(self):
        with patch.dict("os.environ", {"GOOGLE_PLACES_API_KEY": "  "}):
            self.assertEqual(self.search()["error"], "Google Places is not configured.")
        self.post.assert_not_called()

    def test_google_permission_errors(self):
        for status in (401, 403):
            self.post.return_value = httpx.Response(status, text="PRIVATE provider details")
            self.assertEqual(self.search()["error"], "Google Places authentication or permission failed.")

    def test_rate_limit(self):
        self.post.return_value = httpx.Response(429)
        self.assertEqual(self.search()["error"], "Google Places rate limit reached.")
        self.post.assert_called_once()

    def test_temporary_and_other_http_errors(self):
        for status in (500, 503):
            self.post.return_value = httpx.Response(status)
            self.assertEqual(self.search()["error"], "Google Places is temporarily unavailable.")
        for status in (400, 302, 204):
            self.post.return_value = httpx.Response(status)
            self.assertEqual(self.search()["error"], "Google Places request failed.")

    def test_timeout(self):
        self.post.side_effect = httpx.ReadTimeout("PRIVATE key location")
        self.assertEqual(self.search()["error"], "Google Places request timed out.")
        self.post.assert_called_once()

    def test_network_failure(self):
        self.post.side_effect = httpx.ConnectError("PRIVATE key location")
        self.assertEqual(self.search()["error"], "Google Places network request failed.")

    def test_malformed_json_or_envelope(self):
        self.post.return_value = httpx.Response(200, text="not JSON")
        self.assertEqual(self.search()["error"], "Invalid Google Places response.")
        for payload in ([], None, {"places": None}, {"places": {}}, {"error": {}}, {"places": [{}]}):
            self.post.return_value = httpx.Response(200, json=payload)
            self.assertEqual(self.search()["error"], "Invalid Google Places response.")

    def test_bad_optional_fields_omitted_and_invalid_records_skipped(self):
        self.post.return_value = httpx.Response(200, json={"places": [None, {
            "id": "test", "displayName": {"text": "Test"}, "formattedAddress": 1,
            "googleMapsUri": "javascript:alert(1)", "location": {"latitude": True, "longitude": 1},
        }]})
        result = self.search()
        self.assertEqual(result["data"]["result_count"], 1)
        self.assertNotIn("coordinates", result["data"]["mechanics"][0])
        self.assertNotIn("google_maps_url", result["data"]["mechanics"][0])

    def test_google_order_deduplication_and_result_bound(self):
        self.post.return_value = httpx.Response(200, json={"places": [
            {"id": key, "displayName": {"text": key}} for key in ("b", "a", "b", "c")
        ]})
        self.assertEqual(self.search()["ids"]["place_ids"], ["b", "a", "c"])
        self.assertEqual(self.search(limit=1)["ids"]["place_ids"], ["b"])

    def test_no_private_data_sent_and_no_credential_returned(self):
        result = self.search()
        outbound = json.dumps(self.post.call_args.kwargs["json"])
        for private in ("PRIVATE", str(self.issue.pk), str(self.user.pk), str(self.car.pk), "Toyota"):
            self.assertNotIn(private, outbound)
        self.assertNotIn("unit-test-placeholder", json.dumps(result))
        self.assertIn("driving", " ".join(result["data"]["limitations"]))
        self.assertIn("not driving time", result["data"]["mechanics"][0]["ranking_explanation"])

    def test_no_writes_or_private_context_read(self):
        before = (list(RepairIssue.objects.values()), list(UsedCar.objects.values()))
        with CaptureQueriesContext(connection) as queries:
            self.search()
        self.assertTrue(all(q["sql"].lstrip().upper().startswith("SELECT") for q in queries))
        self.assertNotIn('"description"', queries[-1]["sql"])
        self.assertEqual(before, (list(RepairIssue.objects.values()), list(UsedCar.objects.values())))

    def test_database_failure_before_http(self):
        with patch.object(RepairIssue.objects, "filter", side_effect=DatabaseError("PRIVATE")):
            self.assertEqual(self.search()["error"], "Mechanic search is unavailable.")
        self.post.assert_not_called()
