# Agent 6 — Task 6.7: Google ADK Repair specialist

## Purpose and verified prerequisite

The Repair specialist connects all six existing Django Repair services to one
real Google ADK `LlmAgent`. It helps organize Toyota owner reports, retrieve
published experiences, request supported cost information, discover businesses
and record actual owner outcomes. It does not replace the Coordinator or
reimplement authentication, persistence, search, pricing or Places logic.

Google ADK 2.11.0 and `LlmAgent`, `ToolContext` and `FunctionTool` imports were
verified in the existing Python 3.12 environment. Before edits, all three Task
6.6 files matched commit `d21b3bdcefb6febd3ea8ffa649e3e7544cb9b213` through
read-only Git commit/tree/blob inspection. Existing services, model relationships,
the identity bridge, Buyer and Valuation implementations/tests/documentation,
session conventions and model configuration were inspected.

Only [repair.py](./repair.py), its [focused tests](../tests/test_repair_agent.py)
and this document are added. No existing agent, service, model, endpoint,
authentication or shared configuration is edited.

## Why ADK, and construction

ADK provides the project's real model-driven specialist, tool declarations,
injected contexts and `AgentTool` orchestration interface. The existing Buyer
factory is the primary reference; Valuation uses the same configuration and
authentication patterns. This task adds no other framework or model provider.

```python
from agent.config import AGENT_MODEL
from agent.agents.repair import build_repair_agent

repair = build_repair_agent(AGENT_MODEL)
```

The factory accepts the existing caller-supplied model, just like Buyer and
Valuation. The name is `repair`, consistent with their `buyer` and `valuation`
names. It creates exactly one `LlmAgent`, registers exactly six adapters, has no
sub-agents and disables automatic transfers to its parent and peers. Building
the agent makes no Gemini request. There is no hardcoded model or credential.

Instructions cover explicit owner consent for writes, missing information,
actual workflow IDs, private data, untrusted input, honest tool execution,
uncertainty and safety. The specialist returns evidence to the Coordinator;
it never directly invokes Buyer, Seller, Valuation or Post.

## All six adapters and actual service contracts

All adapters are asynchronous, accept an ADK-injected `ToolContext`, and resolve
trusted identity with the shared bridge. Imported services use `*_service`
aliases so adapter names cannot accidentally recurse into themselves.

| ADK tool | Model-supplied inputs | Existing Django service | Operation |
| --- | --- | --- | --- |
| `create_repair_issue` | `used_car_id`, meaningful `description` | [Task 6.1](../services/repair_issue_service.py) | Create one private owned report |
| `save_diagnosis` | `repair_issue_id`, `symptoms`, `ai_analysis` | [Task 6.2](../services/repair_diagnosis_service.py) | Replace two private JSON fields |
| `search_similar_repairs` | `repair_issue_id`, optional `limit=5` | [Task 6.3](../services/repair_search_service.py) | Read approved published Repair snapshots |
| `estimate_repair_cost` | `repair_issue_id` | [Task 6.4](../services/repair_cost_service.py) | Read authorized context; currently insufficient evidence |
| `find_nearby_mechanics` | `repair_issue_id`, `latitude`, `longitude`, optional `radius_meters=10000`, `limit=5` | [Task 6.5](../services/repair_mechanic_service.py) | Authorized real Places API request |
| `record_resolution` | `repair_issue_id`, `resolution_details` payload | [Task 6.6](../services/repair_resolution_service.py) | Record private owner outcome |

The factory plus these six adapters are the only seven production functions.
There is no adapter helper, duplicate algorithm, ORM access or session mutation
in this module. Every adapter returns the service result unchanged. Its only
other responsibilities are trusted identity resolution, async-to-sync routing
and safe expected-exception handling.

### Create an issue

`used_car_id` must be an actual registered vehicle ID from the supported
Coordinator workflow, not a guessed car or ownership claim. `description` is
the owner's meaningful report. The service validates current ownership and
returns the persisted issue ID, description, initial status and references.
The agent has no vehicle registration/listing tool; missing or ambiguous vehicle
information must go back to the Coordinator's existing supported flow. Writes
require an actual request to record the problem, not casual discussion.

### Save preliminary analysis

Symptoms use the existing optional `confirmed` and `inferred` string lists.
Here confirmed describes reported observations, not confirmed mechanical causes.
Analysis uses `possibilities` objects containing `cause` and required
`uncertainty`, plus optional `notes`. Both parameters must be supplied and may
be null under the service's clearing contract; the adapter does not infer or
coerce them. Instructions prohibit clearing stored context unless requested.
The service preserves original description, identity, status and actual outcome.

### Search community experiences

The limit defaults to five; the service enforces 1–10. Results retain approved
public fields, post IDs, deterministic keyword score, matching reasons,
`community_owner_experience` provenance and caution messages. Only published,
approved owner-reported Repair snapshots qualify. A normal `no_results` stays
empty; no private RepairIssue becomes a community substitute. The agent must
describe anecdotes as anecdotes rather than evidence of the same fault.

### Retrieve cost information

The actual service currently returns `insufficient_data` for valid authorized
requests. Public costs cannot establish currency, complete-repair coverage or
comparable procedures, and there is no trusted pricing integration. The adapter
preserves null range values and explanations. Gemini must not fill the gap with
numbers, example prices, partial totals or invented labor rates. The specialist
has the cost tool integrated, but numerical repair-cost estimation remains
unsupported under the existing source contracts.

### Discover nearby businesses

Latitude/longitude must be explicitly supplied or authorized by the user.
Radius and result bounds remain validated by the service. The adapter forwards
the explicit coordinates without consulting profile, state or vehicle location.
No geocoding or GPS collection is introduced. Search coordinates never become
tool-result or session updates through this adapter.

The real service uses Google Places API (New), `car_repair`, a minimal field mask,
a finite timeout and distance preference. It sends no issue descriptions,
analysis or ownership information to Google. Actual provider results, empty
success, network errors and missing `GOOGLE_PLACES_API_KEY` configuration all
pass through. Missing configuration never becomes synthetic businesses. No
appointment, repair capability, affordability, Toyota certification, rating or
driving-time claim is invented.

### Record an owner outcome

The second parameter preserves Task 6.6's existing envelope, not a new flattened
schema:

```json
{
  "status": "unresolved",
  "resolution_details": {
    "method": "mechanic",
    "work_performed": "Owner reports pads replaced but grinding remains"
  }
}
```

Status must explicitly be `resolved`, `unresolved` or `unsure`. Mechanic work
requires meaningful `work_performed`; self work requires `instructions`. The
service owns field constraints, optional expense normalization, identical
no-write repeats, conflict rejection for existing resolved outcomes, transactions
and timestamp behavior. A repair attempt never implicitly becomes resolved.
Original symptoms and preliminary analysis remain unchanged. The result labels
the outcome owner-reported and never independently verified. No Post is created.

## Identity and thread handling

```text
User
    -> Coordinator
    -> Google ADK Repair Agent
    -> ADK Tool Adapter with injected ToolContext
    -> shared get_authenticated_user()
    -> Existing Django Repair Service with trusted user
    -> Authorized database or external API
    -> Structured result
    -> Coordinator
    -> User
```

The server must first authenticate the Django request and prepare the ADK
session through [get_or_create_authenticated_session](../auth.py). That shared
bridge binds the authenticated JWT user to the session/app using a server
signature. `get_authenticated_user` verifies that signature, ADK session identity,
state identity and current active account. Mutable `state["user_id"]` alone is
not trusted. Forged request-body identities, unsigned contexts and altered state
cannot override the signed identity. No second bridge or fallback user exists.

Each adapter calls both the synchronous bridge and its synchronous business
service using `sync_to_async(..., thread_sensitive=True)`, as Buyer/Valuation do.
This keeps Django ORM work off ADK's async event loop while retaining the
established thread-sensitive database convention. The Places service's bounded
synchronous HTTP call also runs on that thread; this integration adds no new
parallel request architecture.

ADK's actual generated declarations exclude `tool_context` from model arguments.
No adapter accepts a `user`, user ID, authentication object or session owner
argument controlled by Gemini. The service still independently checks ownership
on every call, so a valid context does not authorize another user's issue/car.
Adapters do not read an active issue ID or location from mutable session state.

## Results, exceptions and side effects

The unchanged shared result envelope is:

```text
{status, data, ids, provenance, error}
```

`ok`, `no_results`, `insufficient_data`, service errors, source references,
limitations and JSON-safe representations retain their original meaning. There
is no competing Repair adapter result schema. No entire ORM object is exposed.

Missing/invalid trusted identity becomes `Trusted authentication context is
required.`. Expected DRF API exceptions, Django validation failures, `ValueError`
and database errors become safe operation-specific errors. Structured service
errors pass through untouched. Unexpected programming errors, such as
`RuntimeError`, are not broadly swallowed or converted into false success.
Normal server-level error reporting must remain private outside this module.

Only create, diagnosis save and resolution recording can write authorized
private records through their existing services. Search/cost are read-only;
mechanic discovery reads authorization and calls Places without database writes.
The services retain their existing transaction, SQLite locking, duplicate-create,
pricing, public-data and concurrency limitations. Adapter code does not expand
or weaken them.

## Safety, consent and instruction limits

Owner observations, possible AI causes, community anecdotes, genuinely available
verified service records and owner-reported outcomes are distinct categories.
Neither a model hypothesis nor a community experience is a confirmed diagnosis.
The instruction requires clear caution for brake/steering failure, fuel leaks,
smoke/fire, severe overheating and sudden power loss. No low price or nearby
shop establishes that continuing to drive is safe.

Explicit owner consent before writes and location use is an agent instruction
and Coordinator workflow responsibility. These adapters do not introduce a new
consent token or claim that free-text intent has been mechanically verified.
Instructions are not a substitute for the runtime authentication/validation and
ownership checks. The Coordinator should consume structured tool evidence,
preserve error statuses, and not treat unsupported model prose as execution.

No specialist-to-specialist calls, publication, private diagnosis sharing,
identity changes or session-state writes are implemented. Publication remains
a separate explicit Coordinator/Post Agent approval workflow.

## Example specialist workflow and remaining Coordinator work

1. Coordinator identifies the owner's registered Toyota and receives a clear
   request to record reported grinding; Repair calls create and returns the real ID.
2. With consent, Repair organizes actual observations and stores possible causes
   with uncertainty through diagnosis persistence.
3. Repair searches approved public experiences and reports their sources and
   keyword limitations, or honestly reports no matches.
4. Cost lookup returns insufficient evidence and no invented numerical range.
5. If the owner requests businesses and authorizes coordinates, Repair calls
   Places. A configuration error remains an error until the key is configured.
6. When explicitly requested later, Repair records the owner's actual unresolved,
   unsure or resolved outcome and does not publish it.

Teammate-owned Coordinator registration can later use the existing architecture:

```python
from google.adk.tools.agent_tool import AgentTool
from agent.agents.repair import build_repair_agent
from agent.config import AGENT_MODEL

repair_tool = AgentTool(agent=build_repair_agent(AGENT_MODEL))
# Coordinator teammate owns adding this tool and authenticated session wiring.
```

This task verifies the specialist factory, real tool execution, trusted contexts
and actual service delegation. It does **not** register Repair in Coordinator,
change endpoints/frontend, run a Gemini conversation, or verify the full
Coordinator-to-frontend chatbot end to end. Those remain separate integration
work. A real configured Places key, user-authorized coordinates and an authorized
live request are needed to claim live Places connectivity. Mocked success proves
only handling of the tested interface.

## Actual tests and verification

Using the existing environment, from `backend/`:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_repair_agent agent.tests.test_repair_resolution_service agent.tests.test_repair_mechanic_service agent.tests.test_repair_cost_service agent.tests.test_repair_search_service agent.tests.test_repair_issue_service agent.tests.test_repair_diagnosis_service issues.tests agent.tests.test_auth agent.tests.test_buyer_agent -v 1 --noinput
```

**219 passed / 0 failed**: 25 new Repair ADK tests, 159 existing Repair/issue/auth
tests and 35 Buyer ADK tests. Django system checks and new-file editor diagnostics
report no issues. Installed ADK emits the expected experimental JSON-schema warning;
the unchanged Buyer tests also emit the documented DRF sentinel-default warning.

Tests construct actual `LlmAgent`, `FunctionTool`, `AgentTool`, ADK sessions,
JWT-authenticated requests and injected contexts. For each of the six adapters,
tests verify exact service arguments, only the intended service being called,
unchanged service outputs/errors, missing/unsigned/forged identity denial, safe
expected errors, actual service validation and real cross-user ownership checks.
Further tests verify persisted IDs, uncertain analysis, public attribution,
empty results, cost insufficiency, explicit coordinates, Places configuration,
owner outcomes, duplicate/conflict rules, preserved context and read-only state.

Model generation and network connections are blocked in the new integration
tests. The Places HTTP boundary is mocked; no paid APIs or real inference are
run. Instruction tests check required safety/privacy wording, not live-model
compliance. There is no claim of live Gemini or Places connectivity.

AST/function-count and whitespace checks cover the three task files. Test imports
verify module compatibility, and actual declarations verify exactly six tools
with no identity/context arguments in their model schema. Existing tracked files
are compared byte for byte with HEAD through read-only Git objects. Native Git
status/diff/check/stat remain unavailable due to the known Apple developer-tools
limitation; final native review is left to local Terminal. No prior services or
agents are modified, dependencies installed, or files staged/committed/pushed.
