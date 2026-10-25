# Task 2.5 — Google ADK Vehicle Valuation Agent

## Verified dependencies and scope

Google ADK **2.11.0** is installed in the existing Python 3.12 environment and
declared in the backend requirements. Task 2.4 is committed. The existing shared
[`agent.auth`](../auth.py) bridge is present and was reverified with all **18
authentication tests passing** before this task began. No bridge is duplicated
or modified here.

At task entry, the shared bridge's three files were already untracked work.
They are preserved untouched. This task adds exactly three different files:
[`valuation.py`](./valuation.py), its [test file](../tests/test_valuation_agent.py),
and this document. Thus Git may show six total untracked files until the
pre-existing bridge work is separately preserved/committed. No staging or
committing is performed here.

## What the agent and tool wrapper do

An ADK `LlmAgent` is a genuine model-driven agent configuration: it declares a
model, instructions, and tools available to that model. Creating it does not
run Gemini or make a model request. This specialist exposes only the already
implemented Task 2.4 calculation capability; it has no new search, publication,
or catalog tools and no autonomous execution loop.

A tool wrapper connects ADK's injected context to a deterministic Django
service. It does not calculate prices itself. There are exactly two production
functions in this module:

### `async calculate_value_range(used_car_id, comparable_ids, tool_context)`

The tentative `calculate_value_range_tool` name was adapted to
**`calculate_value_range`** so that ADK tool events match the existing frozen
[`agent contract`](../contracts.md). ADK derives its tool name from the Python
callable name. The Task 2.4 service is imported under a local alias to distinguish
it from this wrapper; the original service is not changed.

- `used_car_id`: a string UUID for the requesting user's registered vehicle.
- `comparable_ids`: a list of selected public post UUID strings.
- `tool_context`: a real `google.adk.tools.ToolContext`, injected by ADK, **not**
  included in the model's tool argument schema.
- Output: Task 2.4's JSON-compatible `{status, data, ids, provenance, error}`
  envelope, unchanged on a successful service call (including `insufficient_data`
  and safe service-level error responses).

The wrapper obtains the active user through the shared `get_authenticated_user`
helper and calls the existing service as:

```python
calculate_value_range_service(used_car_id, comparable_ids, user=user)
```

Both synchronous Django operations run through
`sync_to_async(thread_sensitive=True)` so they do not block ADK's async event
loop or cause Django's async-unsafe ORM error.

### `build_valuation_agent(model)`

Returns an ADK `LlmAgent` named **`valuation`**, using the exact model object/name
supplied by its caller. It registers just the calculation wrapper. It does not
select a new Gemini ID, read API keys, instantiate a runner, or execute a model.
Automatic transfers to parent/peer agents are disabled; later orchestration is
through `AgentTool`, not conversation transfer.

Instructions require all pricing claims to come from the current tool result,
preserve limitations, and distinguish asking prices from verified sales. Missing
IDs must be requested rather than invented. There are no model-driven repair
deductions, percentage adjustments, or personalized appraisal claims.

## Trusted identity flow

```text
JWT-authenticated request
  → existing get_or_create_authenticated_session()
  → ADK session with server-bound user_id and private authentication binding
  → ADK-injected ToolContext
  → existing get_authenticated_user()
  → Task 2.4 service with server-supplied user
  → owner-scoped vehicle query and published-post validation
```

The wrapper does not trust `state["user_id"]` alone. The shared helper verifies
the signed binding against the actual ADK user/session/app and checks account
activity. Missing, unsigned, tampered or wrong-owner context cannot authorize
the calculation. No `user_id`, `owner_id`, or authorization boolean is exposed
as an LLM-generated argument.

## Connection to Tasks 2.1–2.4 and example

The wrapper delegates to [Task 2.4](../services/value_range_service.py), which
revalidates the selected published Sell snapshots through Task 2.2, obtains
separate catalog reference from Task 2.3, and uses Task 2.1's `estimate()` for
Decimal calculations. None of those implementations changes here.

For a trusted user with an owned Toyota Camry and three eligible, selected
published Camry posts asking `10000.00`, `12000.00`, and `15000.00`, the existing
service returns outer `status="ok"` with an inner `completed` valuation,
`low="10000.00"`, `median="12000.00"`, `high="15000.00"`, sample size three,
and `price_basis="asking"`. These prices are **synthetic teaching fixtures**,
not genuine market evidence. MSRP, when available, remains separate context
and never changes the used-car statistics. The wrapper returns the service
envelope without rewriting prices or provenance.

## Errors and insufficient data

- Fewer than three eligible distinct posts retain outer/inner
  `insufficient_data`, null numeric range, eligible IDs and limitations.
- Missing/foreign vehicles retain Task 2.4's identical `Vehicle not found.`
  error with no private details.
- Authentication/permission exceptions produce the generic shared error
  envelope `Trusted authentication context is required.`.
- Expected DRF API exceptions, Django validation errors, invalid-input
  `ValueError`, and database errors produce the generic error
  `Unable to calculate the vehicle value range.`. Exception text and SQL are
  not sent to the model or user.
- Unexpected programmer/runtime exceptions are not broadly swallowed; future
  server-level error handling remains responsible for generic HTTP failures.

## Later Coordinator registration — not implemented here

`AgentTool` lets the Coordinator invoke this specialist and receive its result
without transferring the user-facing conversation. The Coordinator teammate
can later use:

```python
from google.adk.tools.agent_tool import AgentTool
from agent.agents.valuation import build_valuation_agent
from agent.config import AGENT_MODEL

valuation_tool = AgentTool(agent=build_valuation_agent(AGENT_MODEL))
# Add valuation_tool to the Coordinator's tools in the teammate-owned integration.
```

The runner must use the same bridge-prepared session and server-derived user ID.
The returned tool result's `data` can be consumed as the valuation according to
the shared contract. This module does not write state or modify Coordinator
registration. No separate server is created.

## Limitations and verification

This agent cannot discover comparable IDs by itself: they must come from the
existing workflow. All Task 2.4 data-quality limitations still apply, including
the lack of an enforceable synthetic-data publication flag and prior selection
bounds. The range is an observed asking-price distribution, not a confidence
interval or exact personal appraisal. Task 2.1B remains deferred.

The wrapper result is structured; model compliance with the text instructions
is not a substitute for deterministic validation of tool events. No live Gemini
behavior or full Coordinator flow is claimed as tested.

From `backend/`, run:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_valuation_agent -v 1 --noinput
```

Tests construct real ADK agents, `FunctionTool` and `AgentTool`, use the real JWT
bridge with isolated Django fixtures, verify ToolContext is hidden from model
arguments, exercise delegation and ownership/privacy failures, and check
JSON-safe success/insufficient-data results. Model generation is mocked and
asserted not called; the service path issues only SELECT statements.

Verification: **13 focused Task 2.5 tests passed, 0 failed** using the existing
Python 3.12 environment. The **18 shared bridge tests also passed** as the
pre-implementation compatibility gate. Imports, construction, tool registration,
and `AgentTool` wrapping succeeded without model calls. ADK 2.11.0's enabled
JSON-schema declaration mode emits an experimental-feature warning; the schema
test covers both JSON-schema and typed-schema declarations and verifies that
only `used_car_id` and `comparable_ids` are model arguments.

Git scope review found only the three new files for this task plus the same
three pre-existing untracked shared-bridge files. Existing services, shared
authentication, Coordinator, settings, and models were not changed. No files
were staged or committed.
