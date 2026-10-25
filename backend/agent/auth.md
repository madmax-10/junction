# Shared Django JWT → ADK authentication bridge

## Interface and agreed identity key

Implemented in [`agent/auth.py`](./auth.py), for reuse by Valuation, Buyer,
Seller, and Repair. No specialist, Coordinator, URL, or authentication settings
were changed. The state key remains **`user_id`**, matching the existing
[`agent contracts`](./contracts.md).

```python
await get_or_create_authenticated_session(
    request, *, session_service, app_name, session_id=None
)  # -> real ADK Session

get_authenticated_user(tool_context)  # -> current active Django User
```

Neither helper is an LLM tool. Register only specialist wrappers with ADK, never
these authentication helpers. They accept no model-generated user or owner ID.

## Request-side authentication and session ownership

The async session helper explicitly invokes the project's existing Simple JWT
`JWTAuthentication` on the Django/DRF request. It verifies the bearer access
token and loads the active user through Django. An existing `request.user`,
cookie session, request body, conversation text, or history-provided identity
cannot substitute for an access token. JWT ORM work is moved off the event loop
using Django's existing `asgiref.sync.sync_to_async(thread_sensitive=True)`.

With no session ID, the helper creates an ADK session owned by the JWT user.
With a session ID, it queries ADK using **app name + authenticated user ID +
session ID**. Foreign, missing, malformed, or other-app session IDs fail with
the same `NotFound("Session not found.")`; there is no automatic fallback that
creates or overwrites a client-chosen ID. Every resume verifies a fresh JWT.

The server owns the `InMemorySessionService` and app name. They must not be
accepted as arbitrary chat input. Run ADK with the same service and the returned
session's `user_id` and `id`; never take `Runner.run_async(user_id=...)` from the
client.

## Trusted ToolContext identity

The bridge writes `state["user_id"]` from the JWT using ADK's supported
`append_event` / `EventActions.state_delta` interface, not by mutating a detached
session copy. It also writes a private `_auth_binding` covering the user ID,
session ID, and app name. The signature uses a random process-local server key,
not the repository's development Django secret. No JWT or signing key is put in
the session or prompt.

`get_authenticated_user()` requires a real ADK `ToolContext` and checks:

1. A valid bridge signature is present.
2. The signed user/session/app exactly match ADK's invocation/session identity.
3. The public state `user_id` matches the ADK session owner.
4. The Django user still exists and is active.

A changed state identity, raw unbound session, tampered signature, or signature
copied to another session fails before a user lookup. Missing trust raises a
generic DRF `PermissionDenied`, without returning private records. Existing
ownership checks in the Django business services remain mandatory.

The private binding is not a bearer credential usable across sessions, and must
not be restored from client-held history. Tools must use this helper rather
than treating an arbitrary `state["user_id"]` as proof of authentication. State
itself is mutable; changing it cannot grant additional privileges because the
helper rejects inconsistencies.

## Later server/Coordinator integration

Server code can prepare a session and invoke the runner with:

```python
session = await get_or_create_authenticated_session(
    request, session_service=runner.session_service, app_name=runner.app_name,
    session_id=validated_session_id,  # None creates a new session
)
# runner.run_async(user_id=session.user_id, session_id=session.id, ...)
```

An async specialist wrapper can reuse the authenticated user safely:

```python
user = await sync_to_async(get_authenticated_user, thread_sensitive=True)(tool_context)
result = await sync_to_async(calculate_value_range, thread_sensitive=True)(
    used_car_id, comparable_ids, user=user
)
```

These are integration examples, not a newly implemented Coordinator or Agent 2
wrapper. Expected authentication exceptions should be mapped to the existing
generic tool error envelope by that future wrapper, not exposed as stack traces.

## Architecture and remaining boundaries

The approved architecture uses a new in-memory session per request, client-held
event history, and no persistent ADK transcript or session tables. Use a
request-scoped `InMemorySessionService` for that flow and discard it afterward.
Resuming is supported only while the supplied service still holds a session;
this interface does not promise cross-request, cross-worker, or restart resume.
The process-local binding key deliberately has the same ephemeral lifetime.

The latest request asks for create/resume; that does not silently change the
team's storage policy. If persistent cross-worker sessions are later approved,
session storage and binding-key lifecycle need a separate design.

This task adds only the shared service boundary. There is still no chat HTTP
endpoint, Coordinator registration, event replay, or model invocation here.
Client history must remain untrusted text/context: do not replay old tool calls
as actions or apply client event state deltas to session state. The bridge does
not copy any request-body state or history into ADK. Future history hydration
must exclude both `user_id` and `_auth_binding`; this helper should run before
tools execute and the protected identity must not be overwritten afterward.

No app database records are created or changed by the bridge. Tools recheck
current account activity, but JWT expiry/revocation is checked at turn entry,
not continuously during a running turn. Never expose ADK session creation,
mutation, or the server signing key directly to clients.

## Verification

Tests use real signed JWTs, real ADK 2.11.0 sessions/contexts and Django's isolated
test database, without Gemini or external API calls. They cover owner-scoped
create/resume, expired/invalid/missing/refresh tokens, forged request and state
identities, copied bindings, application isolation and account deactivation.

From `backend/`:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_auth -v 1 --noinput
```

Verified: **18 passed, 0 failed** using the existing Python 3.12 environment and
Google ADK 2.11.0. Both shared helpers import successfully after Django setup;
editor diagnostics report no errors. Only this module, its focused test file,
and this document were added; existing services, agents, and authentication
configuration are unchanged. Nothing was staged or committed.
