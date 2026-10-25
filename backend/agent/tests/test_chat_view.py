"""POST /api/chat/turns/ through the real runner with a scripted fake model."""

from unittest import mock

from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from agent.runner import run_turn
from agent.tests.fakes import call, say, scripted
from vehicles.models import UsedCar

URL = "/api/chat/turns/"


def user_message(text="Hi", event_id="u-1"):
    return {"id": event_id, "kind": "message", "role": "user", "author": "user", "text": text}


class ChatViewTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password="pw-12345678", name="Ada")
        cls.other = User.objects.create_user(email="bea@example.com", password="pw-12345678", name="Bea")

    def use_model(self, model):
        """Make the view use the fake model instead of a real one."""
        patcher = mock.patch("agent.views.run_turn", lambda uid, ev, **kwargs: run_turn(uid, ev, model=model, **kwargs))
        patcher.start()
        self.addCleanup(patcher.stop)

    def post(self, body):
        return self.client.post(URL, body, format="json")


class AuthTests(ChatViewTests):
    def test_login_is_required(self):
        response = self.post({"events": [user_message()]})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_a_bad_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-real-token")
        self.assertEqual(self.post({"events": [user_message()]}).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_only_post_is_allowed(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_a_real_jwt_identifies_the_user(self):
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.use_model(scripted(
            call("register_used_car", make="Honda", model="Civic", year=2018, mileage=1000),
            say("Registered."),
        ))
        self.assertEqual(self.post({"events": [user_message()]}).status_code, status.HTTP_200_OK)
        self.assertEqual(UsedCar.objects.get().owner, self.user)


class RequestValidationTests(ChatViewTests):
    def setUp(self):
        self.client.force_authenticate(self.user)
        self.use_model(scripted(say("never used")))

    def test_missing_or_malformed_body_is_a_clear_400(self):
        for body in ({}, {"events": None}, {"events": "hi"}, {"events": {}}, {"other": 1}):
            with self.subTest(body=body):
                response = self.post(body)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("events", response.json())

    def test_a_list_body_is_rejected(self):
        response = self.post([user_message()])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_history_names_the_rule_it_broke(self):
        response = self.post({"events": []})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("must not be empty", str(response.json()["events"]))

    def test_last_event_must_be_a_user_message(self):
        assistant = {"id": "a-1", "kind": "message", "role": "assistant", "author": "coordinator", "text": "x"}
        response = self.post({"events": [user_message(), assistant]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("last event must be a user message", str(response.json()["events"]))

    def test_duplicate_ids_are_rejected(self):
        response = self.post({"events": [user_message(event_id="same"), user_message(event_id="same")]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("duplicate id", str(response.json()["events"]))


class TurnTests(ChatViewTests):
    def setUp(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.user).access_token}")

    def test_returns_only_the_new_events(self):
        self.use_model(scripted(call("get_user_context"), say("You have no cars yet.")))
        response = self.post({"events": [user_message("What do I have?")]})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        events = response.json()["events"]
        self.assertEqual([e["kind"] for e in events], ["tool_call", "tool_response", "message"])
        self.assertEqual(events[-1]["text"], "You have no cars yet.")
        self.assertNotIn("u-1", [e["id"] for e in events])

    def test_a_user_id_in_the_body_or_history_cannot_change_who_acts(self):
        self.use_model(scripted(
            call("register_used_car", make="Honda", model="Civic", year=2018, mileage=1000),
            say("Registered."),
        ))
        message = user_message("Register a Civic")
        message["user_id"] = str(self.other.id)
        response = self.post({"events": [message], "user_id": str(self.other.id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(UsedCar.objects.get().owner, self.user)

    def test_the_returned_events_can_be_sent_back_with_the_next_message(self):
        self.use_model(scripted(say("Hello!"), say("Still here.")))
        history = [user_message("Hi", "u-1")]
        history += self.post({"events": history}).json()["events"]
        history.append(user_message("You there?", "u-2"))
        response = self.post({"events": history})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["events"][-1]["text"], "Still here.")


class FailureTests(ChatViewTests):
    def setUp(self):
        self.client.force_authenticate(self.user)

    def test_a_model_failure_returns_a_safe_503(self):
        with mock.patch("agent.views.run_turn", side_effect=RuntimeError("secret key abc123 rejected")):
            with self.assertLogs("agent.views", level="ERROR"):
                response = self.post({"events": [user_message()]})
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("unavailable", response.json()["detail"])
        self.assertNotIn("abc123", response.content.decode())
