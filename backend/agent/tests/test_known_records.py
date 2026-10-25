import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.exceptions import ValidationError

from accounts.models import User
from agent.services.known_records import extract_known_records
from common.validators import normalize_resolution_details
from issues.models import BuyIssue, RepairIssue
from issues.photos import save_photo
from posts.models import Post
from posts.validation import normalize_post_data
from vehicles.models import UsedCar

MEDIA_ROOT = tempfile.mkdtemp()


def _png():
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(buffer, format="PNG")
    return SimpleUploadedFile("car.png", buffer.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class KnownRecordExtractionTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.user = User.objects.create_user(email="ada@example.com", password="Sup3r-Secret-Pass", name="Ada")
        self.other = User.objects.create_user(email="bea@example.com", password="Sup3r-Secret-Pass", name="Bea")
        self.car = UsedCar.objects.create(
            owner=self.user, make="Honda", model="Civic", year=2019, trim="EX", mileage=42000,
        )
        self.issue = RepairIssue.objects.create(
            user=self.user,
            used_car=self.car,
            description="Trunk will not close.",
            symptoms={"confirmed": ["Trunk will not close"]},
            resolution_details={
                "method": "mechanic",
                "work_performed": "Replaced the bumper cover",
                "cost": 4600,
                "mechanic_name": "Austin Body Shop",
                "insurance_settlement": "The other driver's insurer paid the repair.",
            },
        )
        self.post = Post.objects.create(
            issue_id=self.issue.id,
            issue_type=Post.IssueType.REPAIR,
            title="Bumper repaired",
            content="The shop replaced the bumper cover.",
            post_data={
                "make": "Honda",
                "model": "Civic",
                "year": 2019,
                "owner_reported": True,
                "insurance_settlement": "The other driver's insurer paid the repair.",
            },
            status=Post.Status.PUBLISHED,
        )
        self.other_car = UsedCar.objects.create(
            owner=self.other, make="Toyota", model="Camry", year=2018, mileage=10000,
        )

    def test_extracts_only_the_callers_known_rows(self):
        save_photo(self.issue, _png())
        found = extract_known_records(
            self.user,
            {
                "used_car_id": str(self.car.id),
                "issue": {"type": "repair", "id": str(self.issue.id)},
                "post_id": str(self.post.id),
            },
        )
        self.assertEqual(found["used_car"]["make"], "Honda")
        self.assertEqual(found["used_car"]["mileage"], 42000)
        self.assertNotIn("condition", found["used_car"])
        self.assertEqual(found["issue"]["type"], "repair")
        self.assertEqual(
            found["issue"]["resolution_details"]["insurance_settlement"],
            "The other driver's insurer paid the repair.",
        )
        self.assertEqual(found["issue"]["resolution_details"]["cost"], 4600)
        self.assertEqual(found["post"]["title"], "Bumper repaired")
        self.assertEqual(len(found["photos"]), 1)
        self.assertTrue(found["photos"][0]["path"].startswith(f"issues/repair/{self.issue.id}/"))

        hidden = extract_known_records(
            self.user,
            {"used_car_id": str(self.other_car.id), "issue": {"type": "repair", "id": str(self.issue.id)}},
        )
        self.assertIsNone(hidden["used_car"])
        stolen = extract_known_records(self.other, {"post_id": str(self.post.id)})
        self.assertIsNone(stolen["post"])
        self.assertEqual(stolen["photos"], [])

    def test_buy_issue_returns_budget_numbers(self):
        buy = BuyIssue.objects.create(
            user=self.user,
            description="Need another commuter car.",
            min_budget="5000.00",
            max_budget="12000.50",
            preferences={"vehicle_type": "used", "preferred_makes": ["Honda"]},
        )
        found = extract_known_records(self.user, {"issue": {"type": "buy", "id": str(buy.id)}})
        self.assertEqual(found["issue"]["min_budget"], 5000)
        self.assertEqual(found["issue"]["max_budget"], 12000.5)
        self.assertEqual(found["issue"]["preferences"]["vehicle_type"], "used")
        self.assertIsNone(found["used_car"])

    def test_missing_and_blank_ids_are_skipped(self):
        found = extract_known_records(self.user, {"used_car_id": "", "issue": {"type": "sell"}})
        self.assertEqual(found, {"used_car": None, "issue": None, "post": None, "photos": []})

    def test_repair_solution_accepts_an_insurance_settlement_note(self):
        cleaned = normalize_resolution_details(
            {
                "method": "self",
                "instructions": "Replaced the bumper cover in the driveway.",
                "insurance_settlement": "The insurer reimbursed the parts.",
            }
        )
        self.assertEqual(cleaned["insurance_settlement"], "The insurer reimbursed the parts.")
        post_data = normalize_post_data(
            "repair",
            self.issue.id,
            {"owner_reported": True, "insurance_settlement": "The insurer reimbursed the parts."},
        )
        self.assertEqual(post_data["insurance_settlement"], "The insurer reimbursed the parts.")
        with self.assertRaises(ValidationError):
            normalize_resolution_details(
                {
                    "method": "mechanic",
                    "work_performed": "Replaced the bumper cover.",
                    "insurance_settlement": "x" * 501,
                }
            )
