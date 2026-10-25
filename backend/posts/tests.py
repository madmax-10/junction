from io import BytesIO
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


def png_upload():
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "green").save(buffer, format="PNG")
    return SimpleUploadedFile("car.png", buffer.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class PostApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password=PASSWORD, name="Ada")
        cls.other = User.objects.create_user(email="bea@example.com", password=PASSWORD, name="Bea")
        cls.staff = User.objects.create_user(
            email="staff@example.com",
            password=PASSWORD,
            name="Staff",
            is_staff=True,
        )

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.client.force_authenticate(self.user)

    def _used_car(self, make, model, year, mileage):
        return self.client.post(
            "/api/cars/used/",
            {"make": make, "model": model, "year": year, "mileage": mileage},
            format="json",
        ).data

    def _publish_sell(self, car, price, location):
        issue = self.client.post(
            "/api/issues/sell/",
            {
                "description": f"{car['make']} for sale",
                "used_car": car["id"],
                "asking_price": price,
                "location": location,
                "contact_info": {"email": "private@example.com"},
            },
            format="json",
        )
        self.assertEqual(issue.status_code, status.HTTP_201_CREATED)
        draft = self.client.post(
            "/api/posts/generate/",
            {"issue_type": "sell", "issue_id": issue.data["id"]},
            format="json",
        )
        self.assertEqual(draft.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("contact", draft.data["post_data"])
        approved = self.client.post(f"/api/posts/{draft.data['id']}/approve/")
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        return issue.data, approved.data

    def test_drafts_stay_private_until_approval_and_filters_apply(self):
        honda = self._used_car("Honda", "Civic", 2018, 40000)
        toyota = self._used_car("Toyota", "Camry", 2020, 20000)
        _, honda_post = self._publish_sell(honda, "9000.00", "Austin, TX")
        _, toyota_post = self._publish_sell(toyota, "15000.00", "Dallas, TX")

        buy = self.client.post(
            "/api/issues/buy/",
            {
                "description": "Want a Honda",
                "max_budget": "12000.00",
                "preferences": {"preferred_makes": ["Honda"], "location": "Austin, TX"},
            },
            format="json",
        )
        buy_draft = self.client.post(
            "/api/posts/generate/",
            {
                "issue_type": "buy",
                "issue_id": buy.data["id"],
                "post_data": {"contact": {"email": "ada@example.com"}},
            },
            format="json",
        )
        self.assertEqual(buy_draft.data["post_data"]["contact"]["email"], "ada@example.com")
        self.assertIn("Honda", buy_draft.data["post_data"]["preferred_makes"])

        self.client.force_authenticate(None)
        public = self.client.get("/api/posts/")
        public_ids = {row["id"] for row in results(public)}
        self.assertEqual(public_ids, {honda_post["id"], toyota_post["id"]})
        hidden = self.client.get(f"/api/posts/{buy_draft.data['id']}/")
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        visible = self.client.get(f"/api/posts/{honda_post['id']}/")
        self.assertEqual(visible.status_code, status.HTTP_200_OK)
        self.assertNotIn("contact", visible.data["post_data"])

        honda_only = self.client.get("/api/posts/", {"make": "hon", "year": 2018, "price_max": 10000})
        self.assertEqual([row["id"] for row in results(honda_only)], [honda_post["id"]])
        austin = self.client.get("/api/posts/", {"location": "austin", "issue_type": "sell"})
        self.assertEqual([row["id"] for row in results(austin)], [honda_post["id"]])
        newer = self.client.get("/api/posts/", {"year_min": 2019, "model": "camry", "price_min": 10000})
        self.assertEqual([row["id"] for row in results(newer)], [toyota_post["id"]])

        self.client.force_authenticate(self.user)
        mine = self.client.get("/api/posts/", {"mine": "true", "status": "draft"})
        self.assertEqual([row["id"] for row in results(mine)], [buy_draft.data["id"]])
        self.client.force_authenticate(self.other)
        self.assertEqual(results(self.client.get("/api/posts/", {"mine": "true"})), [])

    def test_owner_edits_draft_and_approval_is_idempotent(self):
        car = self._used_car("Honda", "Civic", 2018, 30000)
        issue = self.client.post(
            "/api/issues/sell/",
            {"description": "Clean title", "used_car": car["id"], "asking_price": "8000.00"},
            format="json",
        )
        draft = self.client.post(
            "/api/posts/generate/",
            {"issue_type": "sell", "issue_id": issue.data["id"]},
            format="json",
        )
        edited = self.client.patch(
            f"/api/posts/{draft.data['id']}/",
            {
                "title": "Updated title",
                "post_data": {**draft.data["post_data"], "contact": {"phone": "512-555-0100"}},
            },
            format="json",
        )
        self.assertEqual(edited.status_code, status.HTTP_200_OK)
        self.assertEqual(edited.data["title"], "Updated title")
        self.assertEqual(edited.data["post_data"]["contact"]["phone"], "512-555-0100")

        approved = self.client.post(f"/api/posts/{draft.data['id']}/approve/")
        again = self.client.post(f"/api/posts/{draft.data['id']}/approve/")
        self.assertEqual(approved.data["status"], "published")
        self.assertEqual(again.data["approved_at"], approved.data["approved_at"])
        locked = self.client.patch(
            f"/api/posts/{draft.data['id']}/",
            {"title": "Too late"},
            format="json",
        )
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.other)
        self.assertEqual(
            self.client.post(f"/api/posts/{draft.data['id']}/approve/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_delete_removes_drafts_and_archives_published_posts(self):
        car = self._used_car("Honda", "Civic", 2018, 30000)
        _, published = self._publish_sell(car, "7000.00", "Austin, TX")
        issue = self.client.post(
            "/api/issues/buy/",
            {"description": "Another request"},
            format="json",
        )
        draft = self.client.post(
            "/api/posts/generate/",
            {"issue_type": "buy", "issue_id": issue.data["id"]},
            format="json",
        )
        removed = self.client.delete(f"/api/posts/{draft.data['id']}/")
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Post.objects.filter(pk=draft.data["id"]).exists())

        self.client.force_authenticate(self.staff)
        archived = self.client.delete(f"/api/posts/{published['id']}/")
        self.assertEqual(archived.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Post.objects.get(pk=published["id"]).status, Post.Status.ARCHIVED)

    def test_post_photo_access_follows_publication(self):
        car = self._used_car("Honda", "Civic", 2018, 30000)
        issue = self.client.post(
            "/api/issues/sell/",
            {"description": "With photo", "used_car": car["id"], "asking_price": "7500.00"},
            format="json",
        )
        uploaded = self.client.post(
            f"/api/issues/sell/{issue.data['id']}/photos/",
            {"file": png_upload()},
            format="multipart",
        )
        path = uploaded.data["path"]
        filename = uploaded.data["filename"]
        draft = self.client.post(
            "/api/posts/generate/",
            {
                "issue_type": "sell",
                "issue_id": issue.data["id"],
                "post_data": {"photos": [path]},
            },
            format="json",
        )
        self.assertEqual(draft.data["post_data"]["photos"], [path])

        self.client.force_authenticate(None)
        self.assertEqual(
            self.client.get(f"/api/posts/{draft.data['id']}/photos/{filename}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.client.force_authenticate(self.user)
        owner_draft = self.client.get(f"/api/posts/{draft.data['id']}/photos/{filename}/")
        self.assertEqual(owner_draft.status_code, status.HTTP_200_OK)

        self.client.post(f"/api/posts/{draft.data['id']}/approve/")
        self.client.force_authenticate(None)
        public = self.client.get(f"/api/posts/{draft.data['id']}/photos/{filename}/")
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        missing = self.client.get(f"/api/posts/{draft.data['id']}/photos/{issue.data['id']}_9.png/")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.user)
        self.client.delete(f"/api/issues/sell/{issue.data['id']}/photos/{filename}/")
        post = Post.objects.get(pk=draft.data["id"])
        self.assertNotIn("photos", post.post_data)
