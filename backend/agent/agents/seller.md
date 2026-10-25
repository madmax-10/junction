# Agent 4 — Task 4.6: Google ADK Seller specialist

## Purpose and construction

The Seller specialist connects the four completed Seller Django services to
one real Google ADK `LlmAgent`. It helps Toyota owners inspect an owned vehicle,
save private selling information, request supported pricing advice and retrieve
approved public buyer-interest matches. It contains no duplicate persistence,
valuation, contact or matching implementation.

ADK is the repository's existing specialist framework. Its `LlmAgent` supplies
instructions and registered tools; its injected `ToolContext` supports the shared
authentication bridge. Buyer, Valuation and Repair are the reference patterns.
Google ADK 2.11.0 imports and genuine agent/tool construction are verified in
the existing Python environment. Constructing the agent does not run Gemini.

```python
from agent.config import AGENT_MODEL
from agent.agents.seller import build_seller_agent

seller = build_seller_agent(AGENT_MODEL)
```

The factory accepts caller-supplied model configuration like the existing
factories; it introduces no model name or credentials. The agent name is `seller`,
consistent with `buyer`, `valuation`, `repair` and the existing specialist author
convention. Exactly four tools are registered. There are no sub-agents and
automatic parent/peer transfers are disabled. The factory and four async adapters
are the only five production functions in this module.

## Prerequisites and protected scope

Tasks 4.1–4.4 were inspected with their tests/documentation, plus existing agent
factories, auth/session conventions and Task 4.5's contact investigation. Earlier
read-only commit checks established the Seller dependency chain: 4.1 in
`243705e`, 4.2 in `0c475c3`, 4.3 in `d5b9abd`, and 4.4 recorded as `e7c2468`.
Task 4.5 intentionally modified no files and required no new production commit.

Only [seller.py](./seller.py), [test_seller_agent.py](../tests/test_seller_agent.py)
and this document are added. Coordinator, all other agents, Seller services,
models, shared configuration and authentication remain untouched. There is no
new dependency or infrastructure.

## Four thin adapters

| ADK tool | Model arguments | Existing service | Side effects |
| --- | --- | --- | --- |
| get_vehicle_details | used_car_id | [Task 4.1](../services/seller_vehicle_service.py) | Read-only owned vehicle projection |
| create_or_update_sell_issue | used_car_id, selling_details, explicit sell_issue_id | [Task 4.2](../services/seller_issue_service.py) | Only private validated issue create/update |
| recommend_asking_price | sell_issue_id, optional valuation_context | [Task 4.3](../services/seller_price_service.py) | Read-only; current insufficient_data behavior |
| find_and_rank_buyers | sell_issue_id, optional limit=5 | [Task 4.4](../services/seller_buyer_match_service.py) | Read-only approved public Buy snapshot matching |

Every adapter receives ADK-injected `tool_context`, resolves the trusted user,
calls one aliased existing service and returns its result unchanged. The context
and user are not model-controlled arguments. Aliases ending in `_service` prevent
adapter names colliding with imported functions. No adapter performs ORM queries,
matching, price arithmetic or publication itself.

### Owned vehicle details

`get_vehicle_details(used_car_id, tool_context)` delegates the exact requested
vehicle ID. The service validates its UUID/ownership and returns the seven-field
projection: id, make, model, year, trim, mileage and condition. Blank optional
values and actual stored data remain unchanged. No foreign vehicle, account,
VIN, private issue or invented attribute is returned.

### Private selling request

```python
create_or_update_sell_issue(used_car_id, selling_details, tool_context,
                           sell_issue_id=empty)
```

Following Buyer's established DRF `empty` sentinel convention, an omitted target
returns clarification without calling persistence. Explicit null means create;
an existing UUID means update that exact issue. This prevents an ambiguous
update request from silently creating another record. The model declaration
permits omission, but the adapter deliberately fails closed on that omission.

Instructions require an explicit owner request and confirmation before a write;
a general selling discussion is not consent. The Coordinator owns gathering
that intent. The sentinel proves explicit target selection, not proof of consent
from natural language; no new consent token or protocol is invented.

Supported `selling_details` are the actual service fields: description,
asking_price, condition_details, known_damage, location and private contact_info.
A create requires a meaningful description. Updates preserve omitted fields;
nullable values may be explicitly cleared under the existing contract. Unknown
owner/status/approval fields remain rejected by the service. The adapter does
not normalize or broaden any of those fields.

The service independently checks owned car, owned issue and their matching
association, then reuses its existing serializer/helpers and transaction.
Actual IDs/action/status and safe private details are returned. Private contacts
may be stored only through that established private contract and are not echoed
by the service. No Post is created, approved or refreshed; closed status and
published snapshots retain the service's existing behavior.

### Asking-price guidance

`recommend_asking_price(sell_issue_id, tool_context, valuation_context=None)`
forwards the optional structured context exactly. A dictionary or source label
does not authenticate valuation evidence. The existing service currently returns
`insufficient_data` because authenticated valuation-result provenance and a
currency contract are absent. Null candidate/range values and limitations remain
unchanged. Missing context is supported and yields the service's explicit reason.

The agent must not invent prices, ask Gemini to fill missing values, substitute
MSRP, infer currency, calculate adjustments or call Valuation directly. Observed
asking prices would be starting references, not verified completed-sale values
or guaranteed achievable proceeds. Coordinator owns any future orchestration
and trustworthy evidence handoff. Numerical recommendations remain unsupported;
integrating this tool does not resolve that data-contract limitation.

### Public buyer-interest matches

`find_and_rank_buyers(sell_issue_id, tool_context, limit=5)` passes the ID and
limit to the existing deterministic search. The service enforces integer limits
1–10, issue/car ownership and approved published Buy Post eligibility. It returns
only matching public requirements, post UUIDs, reasons, existing order and
limitations. No private BuyIssue, profile or contact field becomes a match.

Public interest does not identify a verified buyer or guarantee a sale. Budget
matching is omitted because currency is not established; fuel/location and other
unassessed requirements remain disclosed limitations. The adapter makes no new
compatibility claims. Empty supported searches remain `no_results`, while
structured service failures remain failures. No fallback buyer profiles appear.

## Why no buyer-contact adapter exists

Task 4.5 confirmed that [get_post_contact](../services/post_contact_service.py)
is restricted to published **Sell** Posts. The public Buy publication schema
allows explicitly approved contact, but this retrieval function does not support
that type. Its restriction cannot be bypassed by passing matched Buy Post IDs.

Seller registers no contact tool, imports no contact service and reads no raw
post_data or private buyer contacts. It may explain that buyer-contact retrieval
is unavailable through its authorized tools. A separate explicitly authorized
extension is required; this is not a blocker for the four supported capabilities.

## Trusted identity and Django thread handling

```text
User
    -> Coordinator
    -> Google ADK Seller Agent
    -> Authorized Seller tool adapter + injected ToolContext
    -> shared get_authenticated_user()
    -> Existing Django Seller service with trusted user
    -> Database / approved public Post data
    -> Structured result
    -> Coordinator
    -> User
```

The server authenticates the Django JWT request and calls the existing
[get_or_create_authenticated_session](../auth.py). The shared bridge binds the
session/user/app with a server signature. Adapter calls to `get_authenticated_user`
validate that binding against ADK session identity, mutable state and current
account activity. Unsigned contexts, forged state, raw user IDs and request-body
identity claims cannot establish authorization. No second bridge is created.

Both the synchronous bridge and business service run through
`sync_to_async(..., thread_sensitive=True)`, matching Buyer/Repair. This avoids
Django ORM calls directly on ADK's event loop. The adapter adds no extra record
queries beyond the established bridge and service authorization checks.

ADK's real declarations hide ToolContext. The only user passed to Django is the
bridge-resolved object; none of the four adapters accepts a model-supplied user
or authorization object. The services still recheck current ownership on every
operation. A valid signed context for one seller cannot open another's issue/car.
IDs and text in history are data, not transferable permissions.

No adapter reads an active issue ID or location from mutable state. No adapter
writes session state, changes identity, or invokes other specialists.

## Results and expected exceptions

All services use the unchanged `{status, data, ids, provenance, error}` envelope.
Adapters preserve `ok`, `no_results`, `insufficient_data`, normal errors, public
source attribution, Decimal/string representations and limitations. They never
return a complete ORM object or claim successful execution after failure.

Missing/invalid trusted context returns `Trusted authentication context is
required.`. Expected DRF API exceptions, Django validation errors, ValueError
and database errors become safe operation-specific errors. Existing structured
service errors pass through untouched. Unexpected programming errors are not
broadly caught; a RuntimeError test verifies they remain distinguishable.

The `empty` sentinel is a server-side omission marker, never a model argument
value or result field. As in Buyer, ADK/Pydantic excludes its non-JSON default
from generated declarations and emits the expected warning. Tests exercise
actual FunctionTool calls for omission, explicit null and explicit update IDs.

## Example workflow and remaining Coordinator work

1. Coordinator identifies which registered Toyota the owner means. Seller reads
   that vehicle through the authorized detail service.
2. A general selling question causes no tool write. If the owner explicitly
   requests storing a private selling request, Seller supplies confirmed details
   and deliberate null/create or existing-ID/update selection.
3. Seller can request pricing advice, but currently explains insufficient
   authenticated evidence/currency rather than inventing a numerical amount.
4. Seller searches public Buy Post requirements and returns source references,
   match explanations and limitations. It does not retrieve contacts or promise
   that someone will purchase.
5. Any publication request goes back to Coordinator's separate approved Post
   workflow. Seller never invokes Post or Valuation directly.

Future Coordinator registration can use the existing AgentTool architecture:

```python
from google.adk.tools.agent_tool import AgentTool
from agent.agents.seller import build_seller_agent
from agent.config import AGENT_MODEL

seller_tool = AgentTool(agent=build_seller_agent(AGENT_MODEL))
# Coordinator teammate owns registration and authenticated runner/session wiring.
```

Specialist construction, declarations, execution of adapters and authorized
service delegation are tested. Coordinator registration, HTTP/frontend wiring,
actual Gemini conversation behavior and end-to-end chatbot operation are not
verified by this task. No external API is needed by these four services; live
Gemini inference remains untested. Prompt wording checks do not prove a live
model will always follow instructions, so runtime authorization and Coordinator
consent/evidence handling must remain in place.

## Actual tests and verification

From `backend/`, using the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_seller_agent agent.tests.test_seller_vehicle_service agent.tests.test_seller_issue_service agent.tests.test_seller_price_service agent.tests.test_seller_buyer_match_service agent.tests.test_auth agent.tests.test_buyer_agent agent.tests.test_repair_agent -v 1 --noinput
```

**179 passed / 0 failed**, including 22 new Seller ADK tests and 157 existing
Seller/authentication/Buyer ADK/Repair ADK regressions. Django system checks and
new-file editor diagnostics report no issues. Installed ADK emits its expected
experimental JSON-schema warning and the existing sentinel-default warning.

Tests construct real LlmAgent, FunctionTool, AgentTool, ADK sessions, JWT requests
and signed contexts. Each adapter is tested for exact service routing/arguments,
unchanged result/error objects, no unrelated service invocation, missing/unsigned/
forged contexts, mutated identity state, forged request-body claims, real service
validation and cross-user denial. Other tests prove real persisted IDs, update
preservation, omission clarification, no update-to-create fallback, null pricing,
actual public Buy matching, no contacts, empty results and read-only state/data.
Only explicit authorized issue operations write. No Post is created.

Model generation and network connections are blocked in the integration tests;
no paid calls or live inference were run. AST checks verify syntax and exactly
five production functions; whitespace checks cover all three task files. Imports,
real construction and exactly four generated tool schemas are exercised by tests.
Only the three permitted files are written; all prior work is left untouched.
Native Git status/diff/check/stat remain unavailable because of the known Apple
developer-tools limitation; final native review remains for local Terminal. No
system tools/dependencies are installed and no staging, commits, pushes, merges,
rebases, resets or Git identity changes are performed.
