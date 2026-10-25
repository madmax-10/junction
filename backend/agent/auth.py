"""JWT-to-ADK authentication boundary shared by all specialist tools.

Only authenticated server code calls the session function. Neither function is
a model tool. In-memory authentication bindings expire with the server process.
"""

from secrets import token_urlsafe

from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model
from django.core import signing
from google.adk.events import Event, EventActions
from google.adk.sessions import InMemorySessionService, Session
from google.adk.tools import ToolContext
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

USER_ID_STATE_KEY = "user_id"
_BINDING_STATE_KEY = "_auth_binding"
_BINDING_SALT = "agent.auth.session.v1"
# A process-local secret matches the lifetime of the in-memory sessions and does
# not rely on the repository's development Django SECRET_KEY for tool trust.
_BINDING_KEY = token_urlsafe(32)


async def get_or_create_authenticated_session(
    request, *, session_service: InMemorySessionService, app_name: str,
    session_id: str | None = None,
) -> Session:
    """Verify a JWT and create/resume only that user's in-memory ADK session.

    The request is a Django/DRF request; body/history/state is never consulted.
    The caller supplies the server-owned session service and app name. An
    explicit missing/foreign session ID fails, rather than creating a new one.
    The returned session's user_id must also be used as Runner.run_async user_id.
    """
    authentication = await sync_to_async(
        JWTAuthentication().authenticate, thread_sensitive=True
    )(request)
    if authentication is None:
        raise NotAuthenticated("A valid access token is required.")
    user, _ = authentication
    if not user.is_authenticated or not user.is_active:
        raise NotAuthenticated("A valid access token is required.")
    user_id = str(user.pk)

    if session_id is None:
        session = await session_service.create_session(
            app_name=app_name, user_id=user_id,
        )
    else:
        if not isinstance(session_id, str) or not session_id.strip():
            raise NotFound("Session not found.")
        session = await session_service.get_session(
            app_name=app_name, user_id=user_id, session_id=session_id,
        )
    if session is None or session.user_id != user_id or session.app_name != app_name:
        raise NotFound("Session not found.")

    binding = {"user_id": user_id, "session_id": session.id, "app_name": app_name}
    await session_service.append_event(
        session=session,
        event=Event(author="system", actions=EventActions(state_delta={
            USER_ID_STATE_KEY: user_id,
            _BINDING_STATE_KEY: signing.dumps(
                binding, key=_BINDING_KEY, salt=_BINDING_SALT,
            ),
        })),
    )
    return session


def get_authenticated_user(tool_context: ToolContext):
    """Return a current active Django user only for a bridge-bound ADK context.

    Checks the signed identity against both state and ADK's session owner.
    This synchronous helper performs ORM work; async tools must call it through
    sync_to_async(thread_sensitive=True), as with other Django services.
    """
    message = "Trusted authentication context is required."
    if not isinstance(tool_context, ToolContext):
        raise PermissionDenied(message)
    signature = tool_context.state.get(_BINDING_STATE_KEY)
    if not isinstance(signature, str):
        raise PermissionDenied(message)
    try:
        binding = signing.loads(
            signature, key=_BINDING_KEY, salt=_BINDING_SALT, fallback_keys=[],
        )
    except signing.BadSignature:
        raise PermissionDenied(message) from None
    session = tool_context.session
    expected = {
        "user_id": tool_context.user_id,
        "session_id": session.id,
        "app_name": session.app_name,
    }
    if binding != expected or tool_context.state.get(USER_ID_STATE_KEY) != session.user_id:
        raise PermissionDenied(message)
    user = get_user_model().objects.filter(pk=session.user_id, is_active=True).first()
    if user is None:
        raise PermissionDenied(message)
    return user
