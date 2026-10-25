# Agent 3, Tasks 3.5A–BCD — ADK Buyer integration

## Purpose and repository checkpoint

The genuine ADK Buyer now exposes all four existing Django capabilities: private
Buy issue create/update, used-car search, new-car catalog matching and approved
public seller contact. The adapters contain no rewritten business logic.

Task 3.5BCD started on `Agent3(Buyer)` with a clean worktree, after Task 3.5A
was committed in `42d4bb4`. Google ADK **2.11.0** is installed. Only existing
[`buyer.py`](./buyer.py), its [focused tests](../tests/test_buyer_agent.py),
and this document are modified. Three new adapters are added and the existing
builder updated; the used-car adapter is preserved unchanged.
Agent 2, shared authentication, Buyer services and Coordinator are unchanged.

## Why a real LlmAgent and a thin adapter

Google ADK's `LlmAgent` configures a genuine model-driven specialist with
instructions and available tools. It is not a fake dictionary or independent
Coordinator. Constructing it does not execute Gemini. The existing Valuation
agent factory is the configuration pattern reused here.

The private services require a trusted server-side Django `user`, so exposing
them directly as LLM functions would be unsafe. Thin async adapters resolve
identity through the shared bridge and run Django work on the appropriate thread.
Public contact follows its existing public-read contract. There are now five
production functions total (three adapters added in BCD, no helper classes):

```python
build_buyer_agent(model) -> LlmAgent

async search_and_rank_used(buy_issue_id: str, tool_context: ToolContext, limit: int = 5) -> dict

async create_or_update_buy_issue(
    description: str, tool_context: ToolContext, buy_issue_id: str | None = empty,
    min_budget: str | int | None = empty, max_budget: str | int | None = empty,
    preferences: dict | None = empty,
) -> dict

async search_new_catalog(buy_issue_id: str, tool_context: ToolContext, limit: int = 5) -> dict

async get_post_contact(post_id: str) -> dict
```

### Agent builder

`build_buyer_agent(model)` returns a real `LlmAgent` named **`buyer`**, matching
the existing author contract. The model is supplied by the caller, just like
`build_valuation_agent(model)`. The normal caller passes existing
[`AGENT_MODEL`](../config.py); no new Gemini ID, API key lookup, runner, or model
request is invented. Exactly four tools are registered once each:

| ADK tool | Existing Django service alias | Identity/access |
| --- | --- | --- |
| `create_or_update_buy_issue` | `agent.services.buy_issue_service.create_or_update_buy_issue` | Shared trusted user; Task 3.1 owns validation, transactions and ownership. |
| `search_and_rank_used` | `agent.services.buyer_search_service.search_and_rank_used` | Shared trusted user; Task 3.2 owns filtering and ranking. |
| `search_new_catalog` | `agent.services.buyer_catalog_service.search_new_catalog` | Shared trusted user; Task 3.3 owns catalog criteria and ranking. |
| `get_post_contact` | `agent.services.post_contact_service.get_post_contact` | Existing public published-Sell-snapshot restriction. |

Imports use explicit `*_service` aliases so adapter names never recurse into
themselves. Automatic transfers to parent and peer agents remain disabled.

Instructions identify Buyer as a Coordinator specialist, require current tool
evidence for facts, prohibit fabricated listings/prices/execution/availability,
preserve synthetic provenance and report `no_results` honestly. Instructions now
cover all four actual tools, clarify MSRP versus dealer offers, and prohibit
publishing, independently contacting sellers or invoking other specialists.
Missing required description/preferences or an ambiguous update target must be
clarified through the Coordinator; the model must not claim execution occurred.

### Search tool adapter

The ADK-facing name remains **`search_and_rank_used`**, matching the existing
service/tool naming contract. The underlying service is imported with a local
alias to distinguish it from the adapter; it is not changed.

- `buy_issue_id`: string UUID of the current buyer's existing private issue.
- `limit`: default 5; the existing service validates integers 1–50.
- `tool_context`: ADK-injected real `ToolContext`. It is excluded from the
  generated model argument schema, as are user IDs and user objects.
- Result: the original service's JSON-compatible
  `{status, data, ids, provenance, error}` envelope, unchanged.

The adapter performs no issue lookup, filtering, ranking, price calculations,
contact lookup, or publication itself. It calls the existing service as:

```python
search_and_rank_used_service(buy_issue_id, limit=limit, user=trusted_user)
```

### Private Buy issue create/update adapter

`description` is required. `buy_issue_id` must be deliberately provided: a known
existing UUID means update; **explicit null means create**. An omitted target
returns a generic error asking for an ID or an explicit create choice, without
calling Task 3.1 or creating a duplicate issue. The agent instruction separately
prohibits using explicit null as a fallback when the user requested an update.

The existing shared envelope has **no `needs_input` status**. This task does not
invent one. Clarification is communicated through the existing error envelope
and the agent's request back to the Coordinator. It also does not infer intent
from free text or silently choose `active_issue` from editable state. As with any
LLM-driven write, the Coordinator still owns confirmation and workflow intent;
an explicitly requested create is not made idempotent by this adapter.

Budgets use JSON integer/decimal-string inputs or null, and preferences use a
supported JSON object or null. The existing DRF `empty` sentinel distinguishes
omission from null. Omitted budget/preferences pass through unchanged to Task
3.1, preserving existing values on update; explicit null clears them. No float
or invalid budget is coerced by the adapter. Existing service validation returns
its original error envelope, with prior state preserved.

ADK 2.11.0/Pydantic omits the non-JSON sentinel default from tool declarations
and emits a non-serializable-default warning. The sentinel is never a model
argument value, response value, or new shared contract field. Tests exercise
actual `FunctionTool.run_async` calls for omitted fields and explicit null,
and verify declarations are JSON-safe and hide identity/context parameters.

The adapter passes the explicit target and all supported fields to Task 3.1
with the server-resolved `user`. It never chooses an issue, sets owner fields,
updates records directly, or publishes. Ownership remains enforced by Task 3.1.

### New-car catalog adapter

`search_new_catalog(buy_issue_id, tool_context, limit=5)` resolves the trusted
user and passes the exact issue ID and limit to Task 3.3. Genuine stored catalog
records, distinct variants, nullable MSRP, no-results behavior, supported filters,
ranking, limit validation and `new_cars_catalog` provenance remain service-owned.
MSRP is a manufacturer/catalog reference, not verified dealer inventory, a
confirmed offer or a guaranteed final purchase price. No lookup or price logic
is duplicated in the adapter.

### Public contact adapter

`get_post_contact(post_id)` delegates to Task 3.4 on the Django thread. It does
not take `ToolContext` or require a buyer to own a seller's post: the underlying
public service follows the existing Post API's `AllowAny` published-read policy.
This is **not an authentication fallback for private operations**. The chatbot
still uses its normal authenticated request boundary.

Task 3.4 exclusively reads schema-valid `post_data.contact` from published Sell
snapshots and returns only approved allowlisted phone/email/link values. Missing,
unpublished, non-Sell or contactless records keep the same safe `no_results`
behavior. It does not read private User profiles, SellIssue contact_info or
registered cars. The same shared service remains available for future Seller
reuse within its published-Sell-only contract.

## Trusted identity and runtime flow

```text
JWT-authenticated server request
    ↓ shared get_or_create_authenticated_session()
server-bound ADK session (user_id + signed identity/session/app binding)
    ↓ Coordinator later invokes AgentTool(buyer)
ADK injects ToolContext into private Buyer adapters
    ↓ shared get_authenticated_user(tool_context)
current active Django User
    ↓ sync_to_async(..., thread_sensitive=True)
Private operation selects one existing service:
    Task 3.1 → validated private issue create/update (the only write capability)
    Task 3.2 → published Sell snapshots → hard filters → deterministic ranking
    Task 3.3 → stored NewCar rows → reference MSRP filters → deterministic ranking
Public operation:
    Task 3.4 → published Sell snapshot → allowlisted approved contact
    ↓ unchanged shared result envelope
Buyer/Coordinator receives post IDs, reasons, prices, provenance and limitations
```

Both the shared synchronous user lookup and synchronous business services run via
`sync_to_async(thread_sensitive=True)`, following Valuation's established async
ORM convention. This avoids running Django ORM directly on ADK's event loop.

The adapter does **not** authorize from editable `state["user_id"]` alone.
[`get_authenticated_user()`](../auth.py) validates the existing server signature
against the real ADK session/user/app and current account activity. Missing,
unsigned or altered contexts cannot reach private services. The shared
session helper ignores identity claims in the request body/history. No fallback
user, ownership flag or model-generated ID is accepted as identity.

Tasks 3.1–3.3 independently enforce issue ownership on every call. A valid context
for Buyer A cannot update or search Buyer B's issue. The same safe missing-issue response
is preserved instead of revealing private requirements or whether a foreign
issue exists.

## Results, errors and privacy

The issue tool returns the current owner's persisted private request only.
Search results retain the service's approved public vehicle/catalog projection,
asking prices or MSRP, match reasons, IDs and explicit synthetic/demo provenance.
The explicit contact tool can return only approved public contact, never private
seller profiles, private UsedCar records or private Sell issues. Existing data-quality and availability limitations
remain intact, including the distinction between asking prices and actual sales.

The adapter preserves `no_results`, an empty recommendation list and result
count; it never substitutes generated fallback cars. Structured service error
results also pass through unchanged. Authentication/permission exceptions become
the generic shared error `Trusted authentication context is required.`.
Expected DRF API exceptions, Django validation errors, `ValueError` or database
errors become a generic operation-specific message (save issue, used search,
catalog search or public contact) without raw SQL, private
input or stack traces. Unexpected programming errors are not broadly swallowed;
future server-level HTTP error handling still needs to remain generic.

Only the issue tool can cause a validated private Buy issue write through Task
3.1. Search and contact remain read-only. This module never reads secrets into
results, writes session state, publishes, or initiates external requests. Model text compliance with
instructions is not itself runtime validation: the Coordinator should consume
the actual structured tool evidence, not treat unsupported model prose or
client-held history as verified execution.

## Later Coordinator registration — example only

```python
from google.adk.tools.agent_tool import AgentTool
from agent.agents.buyer import build_buyer_agent
from agent.config import AGENT_MODEL

buyer_tool = AgentTool(agent=build_buyer_agent(AGENT_MODEL))
# The Coordinator teammate may later add buyer_tool to the Coordinator's tools.
```

`AgentTool` lets the specialist return to the Coordinator without transferring
the user-facing conversation. The Coordinator owns workflow, trusted session
preparation, state restoration and cross-agent handoffs. Its runner must use the
existing bridge-prepared session and server-derived user ID. This task changes
no registration, API endpoint or autonomous loop.

## Difference from Valuation and deferred Buyer work

Valuation exposes an owned vehicle's preliminary asking-price calculation;
Buyer exposes private Buy issue persistence, public listing search, catalog
recommendations and public contact. Both agents use the
same factory/async-wrapper/bridge/result patterns, but no Agent 2 code or
business logic is copied or changed.

All four service adapters are implemented; actual Coordinator registration,
HTTP chat wiring and full multi-agent runtime orchestration remain deferred.
The underlying services retain their existing
unsupported-criteria, SQLite/PostgreSQL, provenance and ranking limitations.
No live model conversation or full multi-agent request is claimed as tested.

## Focused verification

Tests construct real `LlmAgent`, `FunctionTool`, `AgentTool`, ADK sessions and
`ToolContext` objects. Real access tokens and the actual shared bridge are used
for identity; only service/external boundaries are mocked where needed. Isolated
fixtures verify actual search success, no results, ownership, synthetic flags,
privacy, default/custom limits, forged identities, safe errors and read-only SQL.

From `backend/`, use the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_buyer_agent agent.tests.test_buy_issue_service agent.tests.test_buyer_search_service agent.tests.test_buyer_catalog_service agent.tests.test_post_contact_service agent.tests.test_auth -v 1 --noinput
```

Model generation and external network connections are asserted not called.
No real Gemini, SerpApi or other paid requests are made.

Historical foundation verification: **19 focused Task 3.5A tests, 23 Task 3.2 regressions and
18 authentication-bridge regressions passed (60 total), 0 failed** with the
existing Python 3.12.15 environment. Django reported no system-check issues.
Imports, agent construction, sole-tool registration and `AgentTool` wrapping
succeeded. ADK's enabled JSON-schema declaration feature emits an experimental
warning; tests accept the installed JSON-schema representation as well as the
typed-schema representation and verify that trusted context is not a model arg.

Current BCD verification: **35 Buyer ADK tests plus 107 service/authentication
regressions passed (142 total), 0 failed**, using the existing Python 3.12.15
environment. Tests include all previous used-search scenarios, four real ADK
registrations without duplicates, real bridge identity propagation, absent or
forged identity denial, private create/update, omission versus explicit clearing,
unknown update targets, invalid budgets, unauthorized updates, catalog MSRP and
no-results output, actual owner-approved contact, missing/draft contact privacy,
service delegation/error preservation and read-only SQL for search/contact.

The only expected writes are owned private Buy issue operations explicitly
tested through Task 3.1. External network and model generation remain uncalled.
Editor diagnostics report no errors. Git review is limited to these three
existing task files; services, shared authentication and teammate-owned agents
remain unchanged. No files were staged or committed and no packages installed.
