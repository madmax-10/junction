from io import BytesIO
from pathlib import Path
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from posts.models import Post

PASSWORD = "Sup3r-Secret-Pass"
MEDIA_ROOT = tempfile.mkdtemp()


def results(response):
    return response.data["results"]


def image_upload(fmt="PNG", name="car.png"):
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(buffer, format=fmt)
    content_type = "image/png" if fmt == "PNG" else "image/jpeg"
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=content_type)


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class IssueApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password=PASSWORD, name="Ada")
        cls.other = User.objects.create_user(email="bea@example.com", password=PASSWORD, name="Bea")

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client.force_authenticate(self.user)
        self.car = self.client.post(
            "/api/cars/used/",
            {"make": "Honda", "model": "Civic", "year": 2018, "mileage": 40000},
            format="json",
        ).data
        self.client.force_authenticate(self.other)
        self.other_car = self.client.post(
            "/api/cars/used/",
            {"make": "Toyota", "model": "Camry", "year": 2019, "mileage": 10000},
            format="json",
        ).data
        self.client.force_authenticate(self.user)

    def test_buy_issue_budget_rules_and_filters(self):
        low = self.client.post(
            "/api/issues/buy/",
            {
                "description": "Commuter car",
                "min_budget": "1000.00",
                "max_budget": "5000.00",
                "preferences": {"preferred_makes": ["Honda"], "vehicle_type": "used"},
            },
            format="json",
        )
        high = self.client.post(
            "/api/issues/buy/",
            {"description": "Newer car", "min_budget": "10000.00", "max_budget": "20000.00"},
            format="json",
        )
        self.assertEqual(low.status_code, status.HTTP_201_CREATED)
        self.assertEqual(low.data["status"], "open")
        self.assertEqual(low.data["user"], self.user.id)

        invalid = self.client.post(
            "/api/issues/buy/",
            {"description": "Backwards", "min_budget": "8000.00", "max_budget": "1000.00"},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        unknown = self.client.post(
            "/api/issues/buy/",
            {"description": "Extra", "preferences": {"color": "red"}},
            format="json",
        )
        self.assertEqual(unknown.status_code, status.HTTP_400_BAD_REQUEST)

        filtered = self.client.get("/api/issues/buy/", {"min_budget": 4000, "max_budget": 12000})
        self.assertEqual(
            {row["id"] for row in results(filtered)},
            {low.data["id"], high.data["id"]},
        )
        above = self.client.get("/api/issues/buy/", {"min_budget": 6000})
        self.assertEqual([row["id"] for row in results(above)], [high.data["id"]])

        closed = self.client.patch(
            f"/api/issues/buy/{low.data['id']}/",
            {"status": "closed"},
            format="json",
        )
        self.assertEqual(closed.data["status"], "closed")
        open_only = self.client.get("/api/issues/buy/", {"status": "open"})
        self.assertEqual([row["id"] for row in results(open_only)], [high.data["id"]])

        self.client.force_authenticate(self.other)
        self.assertEqual(results(self.client.get("/api/issues/buy/")), [])
        self.assertEqual(
            self.client.get(f"/api/issues/buy/{low.data['id']}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_sell_and_repair_require_an_owned_car(self):
        denied = self.client.post(
            "/api/issues/sell/",
            {"description": "Not mine", "used_car": self.other_car["id"], "asking_price": "1000.00"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_400_BAD_REQUEST)

        sell = self.client.post(
            "/api/issues/sell/",
            {
                "description": "Garage kept",
                "used_car": self.car["id"],
                "asking_price": "9000.00",
                "location": "Austin, TX",
                "condition_details": {"mechanical": "good"},
                "contact_info": {"email": "ada@example.com"},
            },
            format="json",
        )
        self.assertEqual(sell.status_code, status.HTTP_201_CREATED)
        self.assertEqual(sell.data["contact_info"]["email"], "ada@example.com")

        repair_denied = self.client.post(
            "/api/issues/repair/",
            {"description": "No start", "used_car": self.other_car["id"]},
            format="json",
        )
        self.assertEqual(repair_denied.status_code, status.HTTP_400_BAD_REQUEST)

        pricey = self.client.post(
            "/api/issues/sell/",
            {
                "description": "Higher",
                "used_car": self.car["id"],
                "asking_price": "15000.00",
                "location": "Dallas, TX",
            },
            format="json",
        )
        filtered = self.client.get(
            "/api/issues/sell/",
            {"used_car": self.car["id"], "location": "austin", "asking_price_max": 10000},
        )
        self.assertEqual([row["id"] for row in results(filtered)], [sell.data["id"]])
        self.assertNotEqual(pricey.data["id"], sell.data["id"])

        blocked = self.client.delete(f"/api/cars/used/{self.car['id']}/")
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)

    def test_repair_resolution_filters_photos_and_delete_archives_posts(self):
        repair = self.client.post(
            "/api/issues/repair/",
            {
                "description": "Car will not start",
                "used_car": self.car["id"],
                "symptoms": {"confirmed": ["no crank"], "inferred": ["weak battery"]},
                "ai_analysis": {
                    "possibilities": [{"cause": "battery", "uncertainty": "possible"}],
                },
            },
            format="json",
        )
        self.assertEqual(repair.status_code, status.HTTP_201_CREATED)
        issue_id = repair.data["id"]

        other = self.client.post(
            "/api/issues/repair/",
            {"description": "Brake noise", "used_car": self.car["id"]},
            format="json",
        )
        self.assertEqual(
            [row["id"] for row in results(self.client.get("/api/issues/repair/", {"status": "open"}))],
            [other.data["id"], issue_id],
        )

        resolved = self.client.patch(
            f"/api/issues/repair/{issue_id}/resolution/",
            {
                "status": "resolved",
                "resolution_details": {
                    "method": "mechanic",
                    "mechanic_name": "ABC Auto",
                    "location": "Austin, TX",
                    "work_performed": "Replaced the battery",
                    "cost": 180,
                },
            },
            format="json",
        )
        self.assertEqual(resolved.status_code, status.HTTP_200_OK)
        self.assertEqual(resolved.data["status"], "resolved")
        self.assertIsNotNone(resolved.data["resolved_at"])
        self.assertEqual(resolved.data["resolution_details"]["cost"], 180)

        unsure = self.client.patch(
            f"/api/issues/repair/{issue_id}/resolution/",
            {"status": "unsure", "resolution_details": {"method": "self", "instructions": "Still checking"}},
            format="json",
        )
        self.assertIsNone(unsure.data["resolved_at"])
        self.assertEqual(unsure.data["status"], "unsure")

        uploaded = self.client.post(
            f"/api/issues/repair/{issue_id}/photos/",
            {"file": image_upload()},
            format="multipart",
        )
        self.assertEqual(uploaded.status_code, status.HTTP_201_CREATED)
        filename = uploaded.data["filename"]
        self.assertTrue(filename.startswith(f"{issue_id}_"))
        listed = self.client.get(f"/api/issues/repair/{issue_id}/photos/")
        self.assertEqual(listed.data["photos"][0]["filename"], filename)
        photo = self.client.get(f"/api/issues/repair/{issue_id}/photos/{filename}/")
        self.assertEqual(photo.status_code, status.HTTP_200_OK)

        rejected = self.client.post(
            f"/api/issues/repair/{issue_id}/photos/",
            {"file": SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.other)
        self.assertEqual(
            self.client.get(f"/api/issues/repair/{issue_id}/photos/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.client.force_authenticate(self.user)
        draft = self.client.post(
            "/api/posts/generate/",
            {"issue_type": "repair", "issue_id": issue_id},
            format="json",
        )
        self.assertEqual(draft.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("ai_analysis", draft.data["post_data"])
        self.assertTrue(draft.data["post_data"]["owner_reported"])

        deleted = self.client.delete(f"/api/issues/repair/{issue_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        post = Post.objects.get(pk=draft.data["id"])
        self.assertEqual(post.status, Post.Status.ARCHIVED)
        self.assertFalse((Path(MEDIA_ROOT) / "issues" / "repair" / str(issue_id)).exists())
