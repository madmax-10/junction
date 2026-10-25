# Agent 3, Task 3.5A — ADK Buyer foundation

## Purpose and repository checkpoint

This is the first real ADK Buyer integration, limited to **read-only used-car
search**. It connects the existing Task 3.2 service, not the complete Buyer
workflow. Catalog matching, issue writes and public seller contact remain
unconnected even though their Django services already exist.

Work started on `Agent3(Buyer)` with a clean worktree. Task 3.4 was committed
in `688fe19`. Google ADK **2.11.0** was verified through installed-package
metadata and real imports. Only [`buyer.py`](./buyer.py), its
[focused tests](../tests/test_buyer_agent.py), and this document are added.
Agent 2, shared authentication, Buyer services and Coordinator are unchanged.

## Why a real LlmAgent and a thin adapter

Google ADK's `LlmAgent` configures a genuine model-driven specialist with
instructions and available tools. It is not a fake dictionary or independent
Coordinator. Constructing it does not execute Gemini. The existing Valuation
agent factory is the configuration pattern reused here.

Task 3.2 requires a trusted server-side Django `user`, so exposing it directly
as an LLM function would be unsafe. One small async tool adapter is necessary
to obtain that identity through the shared bridge. There are exactly two
production functions:

```python
build_buyer_agent(model) -> LlmAgent

async search_and_rank_used(buy_issue_id: str, tool_context: ToolContext, limit: int = 5) -> dict
```

### Agent builder

`build_buyer_agent(model)` returns a real `LlmAgent` named **`buyer`**, matching
the existing author contract. The model is supplied by the caller, just like
`build_valuation_agent(model)`. The normal caller passes existing
[`AGENT_MODEL`](../config.py); no new Gemini ID, API key lookup, runner, or model
request is invented. The agent registers only `search_and_rank_used` and
disables automatic transfers to parent and peer agents.

Instructions identify Buyer as a Coordinator specialist, require current tool
evidence for facts, prohibit fabricated listings/prices/execution/availability,
preserve synthetic provenance and report `no_results` honestly. They explicitly
state that issue writes, catalog search and seller contact are not connected.
The agent must ask the Coordinator for a missing saved issue reference rather
than pretend it can create an issue or discover a private issue independently.

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

## Trusted identity and runtime flow

```text
JWT-authenticated server request
    ↓ shared get_or_create_authenticated_session()
server-bound ADK session (user_id + signed identity/session/app binding)
    ↓ Coordinator later invokes AgentTool(buyer)
ADK injects ToolContext into the Buyer search adapter
    ↓ shared get_authenticated_user(tool_context)
current active Django User
    ↓ sync_to_async(..., thread_sensitive=True)
Task 3.2: owner-scoped Buy issue → validate saved criteria
    → published Sell snapshots → hard filters → deterministic ranking
    ↓ unchanged shared result envelope
Buyer/Coordinator receives post IDs, reasons, prices, provenance and limitations
```

Both the shared synchronous user lookup and synchronous search service run via
`sync_to_async(thread_sensitive=True)`, following Valuation's established async
ORM convention. This avoids running Django ORM directly on ADK's event loop.

The adapter does **not** authorize from editable `state["user_id"]` alone.
[`get_authenticated_user()`](../auth.py) validates the existing server signature
against the real ADK session/user/app and current account activity. Missing,
unsigned or altered contexts cannot reach the search service. The shared
session helper ignores identity claims in the request body/history. No fallback
user, ownership flag or model-generated ID is accepted as identity.

Task 3.2 independently enforces issue ownership on every call. A valid context
for Buyer A cannot search Buyer B's issue. The same safe missing-issue response
is preserved instead of revealing private requirements or whether a foreign
issue exists.

## Results, errors and privacy

Successful results include only the service's approved public vehicle projection,
asking prices, match reasons, IDs and explicit synthetic/demo provenance.
No seller profiles, private UsedCar records, contact data or private Sell issues
are read by the wrapper. Existing data-quality and availability limitations
remain intact, including the distinction between asking prices and actual sales.

The adapter preserves `no_results`, an empty recommendation list and result
count; it never substitutes generated fallback cars. Structured service error
results also pass through unchanged. Authentication/permission exceptions become
the generic shared error `Trusted authentication context is required.`.
Expected DRF API exceptions, Django validation errors, `ValueError` or database
errors become `Unable to search used-car listings.` without raw SQL, private
input or stack traces. Unexpected programming errors are not broadly swallowed;
future server-level HTTP error handling still needs to remain generic.

This module neither reads secrets into results nor saves session state, changes
records, publishes, or initiates external requests. Model text compliance with
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
Buyer exposes ranked public listings for an owned **Buy issue**. Both use the
same factory/async-wrapper/bridge/result patterns, but no Agent 2 code or
business logic is copied or changed.

Still deferred: connecting Task 3.1 issue creation/update, Task 3.3 new-catalog
matching, Task 3.4 public seller contact, full Buyer orchestration and actual
Coordinator integration. The single connected service retains its existing
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
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_buyer_agent agent.tests.test_buyer_search_service agent.tests.test_auth -v 1 --noinput
```

Model generation and external network connections are asserted not called.
No real Gemini, SerpApi or other paid requests are made.

Actual verification: **19 focused Task 3.5A tests, 23 Task 3.2 regressions and
18 authentication-bridge regressions passed (60 total), 0 failed** with the
existing Python 3.12.15 environment. Django reported no system-check issues.
Imports, agent construction, sole-tool registration and `AgentTool` wrapping
succeeded. ADK's enabled JSON-schema declaration feature emits an experimental
warning; tests accept the installed JSON-schema representation as well as the
typed-schema representation and verify that trusted context is not a model arg.

Editor diagnostics report no errors. Git status/diff review found exactly the
three new Task 3.5A files, with two production functions and no teammate/prior
task changes. Whitespace checks passed, including untracked content review.
No files were staged or committed, and no packages were installed.
