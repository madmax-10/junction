"""Mocked Muse Spark HTTP contract and ownership tests; no real Meta requests."""

import base64
import json
import shutil
import tempfile
from io import BytesIO
from unittest.mock import patch

import httpx
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase, override_settings
from PIL import Image

from accounts.models import User
from agent.services.image_reading_service import read_image
from issues.models import RepairIssue
from issues.photos import photo_directory
from vehicles.models import UsedCar


def _reply(content, status=200):
    return httpx.Response(status, json={"choices": [{"message": {"content": content}}]},
                          request=httpx.Request("POST", "https://api.meta.ai/v1/chat/completions"))


class ImageReadingServiceTests(TestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        env = patch.dict("os.environ", {"MODEL_API_KEY": "test-key"})
        env.start()
        self.addCleanup(env.stop)
        self.user = User.objects.create_user(email="img@example.com", name="Owner")
        self.other = User.objects.create_user(email="other@example.com", name="Other")
        car = UsedCar.objects.create(owner=self.user, make="Toyota", model="Camry", year=2020, mileage=1)
        self.issue = RepairIssue.objects.create(user=self.user, used_car=car, description="Dash light")
        directory = photo_directory("repair", self.issue.id)
        directory.mkdir(parents=True)
        self.name = f"{self.issue.id}_1.png"
        buffer = BytesIO()
        Image.new("RGB", (4, 4)).save(buffer, "PNG")
        self.bytes = buffer.getvalue()
        (directory / self.name).write_bytes(self.bytes)

    def read(self, image_id=None, purpose="warning_light", user=None, issue_type="repair"):
        return read_image(image_id or self.name, purpose, issue_type, user=user or self.user)

    @patch("agent.services.image_reading_service.httpx.post")
    def test_ok_sends_bearer_and_base64_and_marks_observed_evidence(self, post):
        post.return_value = _reply('{"observations": ["Check engine light is lit"], "confidence": "high"}')
        result = self.read()
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["evidence_type"], "observed_in_image")
        self.assertEqual(result["data"]["observations"], ["Check engine light is lit"])
        self.assertEqual(result["data"]["confidence"], "high")
        kwargs = post.call_args.kwargs
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-key")
        url = kwargs["json"]["messages"][0]["content"][1]["image_url"]["url"]
        self.assertEqual(url, "data:image/png;base64," + base64.b64encode(self.bytes).decode())
        self.assertNotIn("test-key", json.dumps(result))

    @patch("agent.services.image_reading_service.httpx.post")
    def test_other_users_wrong_type_bad_ids_never_reach_provider(self, post):
        cases = [
            self.read(user=self.other),
            self.read(issue_type="sell"),
            self.read(image_id="../../etc/passwd"),
            self.read(image_id=f"{self.issue.id}_9.png"),
            self.read(image_id="https://example.com/a.png"),
            self.read(purpose="diagnose"),
            self.read(user=AnonymousUser()),
        ]
        for result in cases:
            self.assertEqual(result["status"], "error")
        post.assert_not_called()

    @patch("agent.services.image_reading_service.httpx.post")
    def test_missing_key_and_provider_failures_are_vision_unavailable(self, post):
        with patch.dict("os.environ", {"MODEL_API_KEY": ""}):
            self.assertEqual(self.read()["status"], "vision_unavailable")
        post.assert_not_called()
        for response in (_reply("x", 500), _reply("not json"), _reply('{"observations": "no"}')):
            post.return_value = response
            self.assertEqual(self.read()["status"], "vision_unavailable")
        post.side_effect = httpx.ConnectError("boom")
        self.assertEqual(self.read()["status"], "vision_unavailable")

    @patch("agent.services.image_reading_service.httpx.post")
    def test_reply_is_sanitized(self, post):
        post.return_value = _reply(
            '```json\n{"observations": ["a", 5, "", "' + "x" * 500 + '"], "confidence": "certain"}\n```')
        data = self.read()["data"]
        self.assertEqual(data["observations"][0], "a")
        self.assertEqual(len(data["observations"]), 2)
        self.assertEqual(len(data["observations"][1]), 300)
        self.assertEqual(data["confidence"], "low")

    @patch("agent.services.image_reading_service.httpx.post")
    def test_empty_observations_is_no_results(self, post):
        post.return_value = _reply('{"observations": [], "confidence": "low"}')
        self.assertEqual(self.read()["status"], "no_results")


class ChatPhotoTests(ImageReadingServiceTests):
    """Staged chat photos can be read before any issue exists, by their owner only."""

    def stage(self, user):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from issues.photos import save_chat_photo
        return save_chat_photo(user, SimpleUploadedFile("a.png", self.bytes, "image/png"))["filename"]

    @patch("agent.services.image_reading_service.httpx.post")
    def test_owner_reads_staged_photo_without_an_issue(self, post):
        post.return_value = _reply('{"observations": ["Front bumper is detached"], "confidence": "medium"}')
        name = self.stage(self.user)
        result = self.read(image_id=name, purpose="damage", issue_type="sell")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["observations"], ["Front bumper is detached"])

    @patch("agent.services.image_reading_service.httpx.post")
    def test_other_user_cannot_read_staged_photo(self, post):
        name = self.stage(self.user)
        self.assertEqual(self.read(image_id=name, user=self.other)["status"], "error")
        post.assert_not_called()

    def test_chat_upload_endpoint(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post("/api/chat/photos/", {"file": SimpleUploadedFile("a.png", self.bytes, "image/png")},
                               format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertRegex(response.json()["filename"], r"^chat_[0-9a-f]{32}\.png$")
        bad = client.post("/api/chat/photos/", {"file": SimpleUploadedFile("a.txt", b"nope")}, format="multipart")
        self.assertEqual(bad.status_code, 400)
