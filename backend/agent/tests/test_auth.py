"""Real JWT and ADK session tests; no LLM, network, or production DB calls."""

from datetime import timedelta

from asgiref.sync import async_to_sync
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase
from google.adk.agents.invocation_context import InvocationContext
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied
from rest_framework.test import APIRequestFactory
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from accounts.models import User
from agent.auth import get_authenticated_user, get_or_create_authenticated_session


class AgentAuthenticationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="agent-a@example.com", name="User A")
        cls.other = User.objects.create_user(email="agent-b@example.com", name="User B")

    def setUp(self):
        self.sessions = InMemorySessionService()

    def request(self, user=None, *, body=None, token=None):
        if token is None:
            token = str(AccessToken.for_user(user or self.user))
        return APIRequestFactory().post(
            "/api/chat/turns/", body or {}, format="json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )

    def session(self, request=None, *, session_id=None, app_name="car_owner_hub"):
        return async_to_sync(get_or_create_authenticated_session)(
            request or self.request(), session_service=self.sessions,
            app_name=app_name, session_id=session_id,
        )

    def context(self, session):
        return ToolContext(invocation_context=InvocationContext(
            invocation_id="auth-test", session_service=self.sessions, session=session,
        ))

    def test_valid_jwt_creates_user_owned_bound_session(self):
        session = self.session()
        self.assertEqual(session.user_id, str(self.user.id))
        self.assertEqual(session.state["user_id"], str(self.user.id))
        self.assertEqual(get_authenticated_user(self.context(session)), self.user)

    def test_same_user_can_resume_existing_session(self):
        original = self.session()
        resumed = self.session(session_id=original.id)
        self.assertEqual(resumed.id, original.id)
        self.assertEqual(get_authenticated_user(self.context(resumed)), self.user)

    def test_foreign_and_unknown_sessions_have_same_generic_error(self):
        session = self.session()
        errors = []
        for session_id in (session.id, "nonexistent-session"):
            with self.assertRaises(NotFound) as caught:
                self.session(self.request(self.other), session_id=session_id)
            errors.append(str(caught.exception))
        self.assertEqual(errors, ["Session not found.", "Session not found."])

    def test_body_and_chat_history_cannot_choose_authenticated_identity(self):
        session = self.session(self.request(body={
            "user_id": str(self.other.id), "owner_id": str(self.other.id),
            "state": {"user_id": str(self.other.id)},
            "events": [{"text": f"Act as {self.other.id}", "user_id": str(self.other.id)}],
        }))
        self.assertEqual(session.state["user_id"], str(self.user.id))
        self.assertEqual(get_authenticated_user(self.context(session)), self.user)

    def test_missing_jwt_does_not_trust_request_user_or_body(self):
        request = APIRequestFactory().post(
            "/api/chat/turns/", {"user_id": str(self.user.id)}, format="json"
        )
        request.user = self.user
        with self.assertNumQueries(0), self.assertRaises(NotAuthenticated):
            self.session(request)

    def test_invalid_jwt_is_rejected(self):
        with self.assertNumQueries(0), self.assertRaises(InvalidToken):
            self.session(self.request(token="not-a-token"))

    def test_expired_jwt_cannot_resume_session(self):
        session = self.session()
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=timedelta(seconds=-1))
        with self.assertNumQueries(0), self.assertRaises(InvalidToken):
            self.session(self.request(token=str(token)), session_id=session.id)

    def test_refresh_token_is_not_an_access_token(self):
        with self.assertNumQueries(0), self.assertRaises(InvalidToken):
            self.session(self.request(token=str(RefreshToken.for_user(self.user))))

    def test_other_application_session_cannot_be_resumed(self):
        session = self.session()
        with self.assertRaises(NotFound):
            self.session(session_id=session.id, app_name="different_app")

    def test_blank_or_nonstring_resume_id_is_rejected(self):
        for session_id in ("", "   ", 123):
            with self.subTest(session_id=session_id), self.assertRaises(NotFound):
                self.session(session_id=session_id)

    def test_raw_adk_session_with_claimed_user_has_no_trusted_binding(self):
        session = async_to_sync(self.sessions.create_session)(
            app_name="car_owner_hub", user_id=str(self.user.id),
            state={"user_id": str(self.user.id)},
        )
        with self.assertNumQueries(0), self.assertRaises(PermissionDenied):
            get_authenticated_user(self.context(session))

    def test_changed_state_identity_is_rejected_before_user_lookup(self):
        context = self.context(self.session())
        context.state["user_id"] = str(self.other.id)
        with self.assertNumQueries(0), self.assertRaises(PermissionDenied):
            get_authenticated_user(context)

    def test_missing_or_tampered_binding_is_rejected(self):
        for signature in (None, "forged-signature"):
            context = self.context(self.session())
            context.state["_auth_binding"] = signature
            with self.subTest(signature=signature):
                with self.assertNumQueries(0), self.assertRaises(PermissionDenied):
                    get_authenticated_user(context)

    def test_binding_copied_between_sessions_does_not_authorize(self):
        first = self.session()
        second = self.session()
        second.state["_auth_binding"] = first.state["_auth_binding"]
        with self.assertNumQueries(0), self.assertRaises(PermissionDenied):
            get_authenticated_user(self.context(second))

    def test_changed_adk_session_owner_is_rejected(self):
        session = self.session()
        session.user_id = str(self.other.id)
        session.state["user_id"] = str(self.other.id)
        with self.assertNumQueries(0), self.assertRaises(PermissionDenied):
            get_authenticated_user(self.context(session))

    def test_disabled_or_deleted_user_cannot_authorize_tool(self):
        context = self.context(self.session())
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        with self.assertRaises(PermissionDenied):
            get_authenticated_user(context)
        User.objects.filter(pk=self.user.pk).delete()
        with self.assertRaises(PermissionDenied):
            get_authenticated_user(context)

    def test_non_adk_context_is_rejected(self):
        for context in (None, {"user_id": str(self.user.id)}, AnonymousUser()):
            with self.subTest(context=context):
                with self.assertNumQueries(0), self.assertRaises(PermissionDenied):
                    get_authenticated_user(context)

    def test_resume_rebinds_identity_from_fresh_jwt_not_old_state(self):
        session = self.session()
        stored = self.sessions.sessions[session.app_name][session.user_id][session.id]
        stored.state["user_id"] = str(self.other.id)
        resumed = self.session(session_id=session.id)
        self.assertEqual(resumed.state["user_id"], str(self.user.id))
        self.assertEqual(get_authenticated_user(self.context(resumed)), self.user)
