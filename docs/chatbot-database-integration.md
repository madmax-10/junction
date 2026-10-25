# Chatbot/database integration — partial delivery

## Baseline and scope

Branch: `feature/chatbot-database-integration`, based on latest fetched `origin/dev`
at `09e8b7b` (`Added marketplace`). The working tree was clean before branching.
All five specialists, services, Coordinator, and Post Agent are present in that
baseline. No teammate branches were merged or cherry-picked. Existing JSON
contract work is already in dev history, including `149cc73` and `26f8ad7`.

**This is not a complete frontend-to-database integration.** The backend is wired
and tested; the frontend phase is stopped at its missing authentication dependency.

## Backend architecture

`POST /api/chat/turns/` authenticates using existing DRF JWT authentication and
passes the authenticated request to the existing runner. The runner registers
the real Valuation, Buyer, Seller, Repair, and Post factories. Missing factory
dependencies raise visibly rather than silently selecting stubs. The Coordinator
still uses AgentTool delegation, not transfers or specialist-to-specialist calls.

The request-local `authenticated_tools` plugin uses the existing
`get_or_create_authenticated_session` bridge before tool execution. Installed
ADK AgentTool creates a fresh in-memory child session for each specialist; the
bridge validates the request JWT and creates a fresh signed binding for that
actual child session. Copying a parent signature alone cannot authorize a child.
No model-controlled user ID or client history can create an authenticated binding.
Existing service-level active-user and ownership checks remain unchanged.

The existing ephemeral session architecture is preserved. The chat contract has
no conversation/session identifier: each request replays the client-held history
into a new in-memory session. No persistent session API has been invented.

## Unchanged request and response contract

Request, with `Authorization: Bearer <access token>`:

```json
{"events":[{"id":"user-1","kind":"message","role":"user","author":"user","text":"My car needs help"}]}
```

Response: `{"events": [...new events only]}`. The client must append **all**
events, not only messages, before sending the next user message. Message events
are presentation; `tool_call` and `tool_response` events retain machine-readable
results separately. Tool responses contain the existing envelope:

```json
{"status":"ok","data":{},"ids":{},"provenance":"own_used_cars","error":null}
```

The existing serializer converts UUIDs, Decimal values, and dates/datetimes to
strings; floats are rejected by the tool-result contract. No entire private
model is serialized. Function-tool results remain separate from the specialist's
LLM-authored summary. An AgentTool final summary is not independent database
evidence; consumers should use the inner specialist function-tool events.
Replayed client history is untrusted context, not authenticated evidence.

## Verified database fixture example

`test_seller_owned_vehicle_and_foreign_denial_through_actual_routing` creates a
real UsedCar in Django's isolated SQLite test database, with UUID
`11111111-1111-4111-8111-111111111111`, Toyota Camry, year 2024, mileage 40000.
The HTTP test uses a real access JWT, the real Coordinator, real Seller Agent,
and actual owned ORM query. Only model replies are scripted. The resulting inner
`tool_response` includes these asserted fields:

```json
{
  "status": "ok",
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "make": "Toyota",
    "model": "Camry",
    "year": 2024,
    "mileage": 40000
  },
  "ids": {"used_car_id": "11111111-1111-4111-8111-111111111111"},
  "provenance": "own_used_cars",
  "error": null
}
```

This is a field projection of a test-fixture response, not production data; the
allowlisted vehicle response also contains trim and condition. User B's request
for the same vehicle returns an error with null data.

Additional real routed operations verify:

- Seller creates a private SellIssue and preserves `"12345.67"` as a decimal
  string in HTTP JSON. The value is fixture input, not generated price advice.
- Repair creates an owned RepairIssue, returns its genuine ID, and denies the
  other user without creating another record.
- Buyer creates a private BuyIssue with its genuine ID and owner.
- Valuation retrieves three selected published Sell snapshots and returns their
  IDs plus fixture-derived median `"12000.00"`. Empty comparable selection
  preserves `insufficient_data` with null median.
- Private issue creation does not create public Posts. Responses do not expose
  the signed authentication binding or the other user's email.

## Frontend dependency and remaining work

The baseline [AuthProvider](../frontend/src/features/auth/AuthProvider.tsx) holds
only an in-memory display user. [SignInPage](../frontend/src/features/auth/SignInPage.tsx)
uses a timer to simulate sign-in, including social identities. There is no
frontend API client, access/refresh token storage, JWT refresh convention, or
authenticated API request helper to reuse.

The task explicitly says to reuse existing JWT handling, not invent an
authentication mechanism, and stop an affected phase when a prerequisite is
missing. Therefore frontend code is unchanged. The existing ChatProvider still
uses mock replies and story matching; structured events are not yet available
to UI consumers. It must not be represented as a production-connected chatbot.

Remaining dependency: implement/establish real frontend authentication using
the existing Django login/register/refresh/me endpoints. Then connect ChatProvider
to the event contract, retain full structured history, expose tool responses,
and test loading/errors, unauthorized sessions, duplicate prevention, stale
responses, reset/unmount behavior, and browser-level workflows. No arbitrary
local-storage token name or fake authentication workaround was added here.

## Verification

Required interpreter: `/Users/sanishshrestha/.venvs/hacktx/bin/python`.
From the backend directory:

```sh
PYTHONPATH=/Users/sanishshrestha/Documents/hackTexas1 /Users/sanishshrestha/.venvs/hacktx/bin/python manage.py test agent --noinput
```

Result: **646 tests passed**, system checks clean. This includes existing agent
service tests, Coordinator/routing, JWT bridge, API validation/authentication,
JSON serialization/date/Decimal tests, Post Agent regressions, plus seven new
registration and database integration tests. The repository root in PYTHONPATH
is required by the existing valuation-service test's `backend.agent` import;
without it, discovery reports that pre-existing import error.

All ORM tests use Django's isolated test database, not application or shared
production records. No migrations were run against user data. LLM responses
are scripted, not live Gemini evidence. No paid Gemini or Google Places API was
called. External mechanic results are not asserted as ORM-backed evidence.

Frontend `npm run build` could not run: npm is not installed/available even
outside the sandbox. No frontend tests, TypeScript check, build, or browser E2E
success is claimed. Existing ADK experimental-schema and app-name warnings
remain. No agent algorithms, models, migrations, or authentication semantics
were rewritten.
