# Car Owner Hub — Six-Agent Architecture

## Overview

Car Owner Hub is an AI-powered automotive marketplace and community web application. Users buy or sell vehicles, get resale value estimates, troubleshoot car problems, find nearby mechanics, and share experiences through community posts, all through natural-language conversation.

Google ADK orchestrates six agents. Agent 1 is the coordinator and the only agent that talks to the user; it delegates to five specialists: Vehicle Valuation, Buyer Recommendation, Seller Recommendation, Community Post Generation, and Repair & Mechanic Recommendation. Agents choose tools; a Django + DRF backend on PostgreSQL runs the queries, filtering, ranking and writes.

Every tool reads and writes the seven application models: `users`, `new_cars`, `used_cars`, `buy_issues`, `sell_issues`, `repair_issues` and `posts`. Each user intent becomes an issue record, and everything other users can see is a published `post` with an approved `post_data` snapshot. Buyers and sellers connect independently through the contact details they chose to publish.

| Concern | How the architecture handles it |
| --- | --- |
| Marketplace inventory (used) | Published `posts` with `issue_type = sell`; `used_cars` stay private |
| New vehicles | `new_cars` catalog (admin-owned; MSRP is a reference price, not dealer stock) |
| Buyer discovery by sellers | Published `posts` with `issue_type = buy`; `buy_issues` stay private |
| Seller / buyer contact | Only fields the owner approved into `post_data.contact` at publication |
| Valuation evidence | Asking prices in published sell posts + `new_cars.msrp`, always labelled as asking prices |
| Repair cost | Owner-reported `cost` in published repair posts, labelled anecdotal |
| Mechanics | Mechanics named in published repair posts first; nearby repair centers from SerpApi (Google Maps) as the alternative |
| Conversation memory | Client-held event history (messages, tool calls, tool responses). Issue rows still store durable facts (`symptoms`, `ai_analysis`, `resolution_details`) |
| Post types | `buy`, `sell`, `repair` (matches `posts.issue_type`) |
| Post lifecycle | `draft` → `approved` → `published` → `archived` |
| Repair prerequisite | The car is registered in `used_cars` first (`repair_issues.used_car_id` is required) |

## ADK orchestration model

Wrap Agents 2–6 as `AgentTool`s on Agent 1 rather than as transfer sub-agents, so every specialist result returns to the coordinator and only Agent 1 ever speaks to the user. A transfer (`transfer_to_agent`) hands the conversation to the sub-agent, which would break the single-voice rule.

- **Coordinator:** `LlmAgent(name="coordinator", tools=[get_user_context, get_vehicle_details, AgentTool(valuation), AgentTool(buyer), AgentTool(seller), AgentTool(post_gen), AgentTool(repair)])`.
- **Cross-agent sequencing:** Agent 1 chains specialists itself (for selling: Agent 2 → Agent 4 → Agent 5) and passes results through in-request state, e.g. `state["valuation"]`. Specialists never call each other. That state lasts for one turn. The tool responses in the client history carry it to the next turn.
- **Shared deterministic service:** the valuation math lives in one Django service (`valuation_service.estimate()`). Agent 2 owns the explanation; Agent 4 reads `state["valuation"]` for this turn, so pricing is never computed twice in the same request.
- **No server transcript:** there is no conversations table and no ADK `DatabaseSessionService`. The frontend stores the history. Section "Conversation history" defines the event list and the turn loop.
- **Durable facts go to the issue, not the chat:** extracted symptoms → `repair_issues.symptoms`; analysis → `ai_analysis`; confirmed fix → `resolution_details`; condition → `sell_issues.condition_details`; budget and preferences → `buy_issues`.
- **Identity:** the DRF layer authenticates the JWT and sets `state["user_id"]` on the in-request session. Tools read `tool_context.state["user_id"]`; no tool accepts `user_id`, `owner_id` or `buyer_id` as a model argument. The client history cannot set `user_id`.
- **Tool execution:** ADK function tools call the Django service layer in-process (the same services DRF views call), so permission and validation rules are defined once. Only tool calls the model makes during this turn are executed. Tool responses already in the client history are context, and they are not run again.

```text
     Web app stores events[]
     messages · tool calls · tool responses
        │  POST full history, ending in the new user message
        │  ◀ new events only; the client appends them
        ▼
          ┌─────────────────────────────────────┐
          │  Agent 1 · Coordinator              │   AgentTool calls,
          │  only agent that replies to user    │   results return to Agent 1
          └─────────────────────────────────────┘
                            │
     ┌─────────────┬────────┴─────┬──────────────┬──────────────┐
     ▼             ▼              ▼              ▼              ▼
 2 Valuation    3 Buyer       4 Seller        5 Posts        6 Repair
 sell posts     buy_issues    sell_issues     post drafts    repair_issues
 new_cars.msrp  sell posts    buy posts       approve,       repair posts
                                              publish
     │             │              │              │              │
     ▼             ▼              ▼              ▼              ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  Django service layer (shared with DRF views)                    │
 │  auth from session user_id · ownership checks ·                  │
 │  SQL filters and ranking · valuation                             │
 └──────────────────────────────────────────────────────────────────┘
          │                   │                   │                │
          ▼                   ▼                   ▼                ▼
 ┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌─────────────┐
 │  PostgreSQL      │ │  Media storage   │ │ Meta Model   │ │ SerpApi     │
 │  users ·         │ │  issues/{type}/  │ │ API (Muse)   │ │ Google Maps │
 │  new_cars ·      │ │   {issue_id}/    │ │ Spark: read  │ │ engine —    │
 │  used_cars ·     │ │  posts/          │ │  images      │ │ nearby      │
 │  buy/sell/repair │ │   {post_id}/     │ │              │ │ repair      │
 │  _issues · posts │ │                  │ │              │ │ centers     │
 └──────────────────┘ └──────────────────┘ └──────────────┘ └─────────────┘
```

Specialists never reach the user or each other; every read and write passes through the same Django services the REST API uses. PostgreSQL stores the seven application models. It does not store the chat transcript.

## Conversation history

The frontend owns the context. It stores one ordered list, `events`, for the conversation. The list holds user messages, Agent 1 messages, tool calls, and tool responses. The backend does not save this list. On each turn it appends the events it just produced and returns only that delta. The frontend appends the delta, and later appends the next user message.

```text
frontend events
    │  append user message
    ▼
POST /api/chat/turns/   { events }     last event is the new user message
    │
    ▼
backend runs Agent 1 for this request only
    appends assistant messages, tool calls, and tool responses
    │
    ▼
{ events: new events only }
    │
    ▼
frontend appends those events
    │
    ▼
user types again → frontend appends that message → repeat
```

**Event shape.** `id` is unique in the list. The frontend assigns ids for user messages. The backend assigns ids for events it creates.

| `kind` | Fields | Who writes it |
| --- | --- | --- |
| `message` | `role` (`user` or `assistant`), `author` (`user` or `coordinator`), `text` | Frontend appends `role: user`. Backend appends Agent 1 text with `role: assistant` and `author: coordinator` |
| `tool_call` | `author`, `name`, `call_id`, `args` | Backend, when an agent invokes a tool during this turn |
| `tool_response` | `author`, `name`, `call_id`, `response` | Backend, paired to that `call_id` after the tool returns |

`author` on a tool event is the agent that issued the call: `coordinator`, `valuation`, `buyer`, `seller`, `post_gen`, or `repair`. Coordinator tool names include `get_user_context`, `get_vehicle_details`, `register_used_car`, and the five specialist `AgentTool`s. Specialist events use the function-tool names (`search_comparable_posts`, `analyze_vehicle_photo`, `find_nearby_mechanics`, and the rest). A specialist `AgentTool` call and the function tools inside it are both stored, in execution order, so the next turn can see what was asked and what came back.

`response` uses the tool result contract `{status, data, ids, provenance, error}`. The chat UI renders `message` events. Tool events stay in the stored list and are not a second voice.

**One turn on the server.**

1. Reject the request unless it is authenticated, the list is non-empty, and the last event is a user `message`.
2. Build an in-memory ADK session and replay `events` as the model context. Discard the session when the response is sent.
3. Set `state["user_id"]` from the JWT. Ignore any user id inside the history.
4. Rehydrate the other state keys from the latest matching tool responses already in the list: `active_used_car_id`, `active_issue` (`{type, id}`), `draft_post_id`, `valuation`, `last_search_results`. Agent 4 can then read a valuation from an earlier turn without calling Agent 2 again. Agent 1 calls Agent 2 again when the car or the condition has changed.
5. Run Agent 1. Execute only the tool calls the model makes now. Append each call, its response, and the coordinator's assistant message, in order.
6. Return `{ "events": [ ...new events ] }`. Write issue and post rows as the tools require. Do not write `events`.

The history is untrusted context. A previous tool response does not authorize a later write. Ownership checks use `state["user_id"]`. Image bytes stay in media storage; the history stores the tool's findings, not the file. Clearing the frontend list drops the chat wording and the tool trace. Issue rows and image folders remain, and a later turn can resume them through `get_user_context`.

## Muse integration

Muse Spark (`muse-spark-1.2`) is called from inside ADK function tools through the Meta Model API (OpenAI-compatible, base URL `https://api.meta.ai/v1`, key in `MODEL_API_KEY`). ADK still orchestrates every agent; Muse Spark adds image understanding.

| Muse model | Role in the app | Used by |
| --- | --- | --- |
| Muse Spark (`muse-spark-1.2`) | Reads images: warning lights, leaks, damage, odometers, cars a buyer likes | Agents 3, 4, 6 |

**Rules**
- Image findings are inferences: they are saved as `source: "image"` inside `symptoms` / `ai_analysis`, and the owner confirms anything that goes into `condition_details`.
- Posts show only the owner's own photos; no images are generated or edited.
- A Muse call failure returns a recoverable `status: "vision_unavailable"`, and the agent continues with text only.

## SerpApi integration (nearby repair centers)

SerpApi's Google Maps engine gives Agent 6 a second mechanic option. Community repair posts stay the first suggestion; when the user finds that mechanic too far or does not want to use it, Agent 6 lists nearby repair centers that offer the needed service. Results are returned live and never stored, so **no database change is needed**.

**Flow**

1. Agent 6 finds a mechanic in a matching published repair post (`post_data.mechanic_name`, `post_data.location`).
2. Agent 1 shows it with its city and asks whether it works for the user.
3. The user says it's too far, declines it, or no post names a mechanic → Agent 6 calls `find_nearby_mechanics`.
4. Agent 1 shows up to 5 repair centers and the user contacts one directly, outside the app.

**Call** (backend `serp_client`, key in `SERPAPI_API_KEY`):

```text
GET https://serpapi.com/search.json
  engine  = google_maps
  type    = search
  q       = "{service} repair near {user location}"   # e.g. "battery replacement near Austin, TX"
  api_key = SERPAPI_API_KEY
```

The service term comes from the repair issue (`ai_analysis` likely cause or `resolution_details.work_performed`); the location is only one the user typed in this conversation.

**Returned to Agent 1** (mapped from SerpApi `local_results`):

```json
{
  "status": "ok",
  "provenance": "serpapi_google_maps",
  "query": "battery replacement near Austin, TX",
  "excluded_mechanic": "ABC Auto",
  "results": [
    {
      "name": "...", "address": "...", "phone": "...",
      "rating": 4.7, "reviews": 312, "hours": "...",
      "website": "...", "maps_place_id": "...",
      "service_match": "battery replacement"
    }
  ]
}
```

**Rules**
- Only search with a location the user gave; never infer it.
- Exclude the post's mechanic the user declined (`excluded_mechanic`), and drop results whose type isn't auto repair.
- Show results as Google Maps listings, not platform endorsements; ratings come from Google.
- SerpApi text is untrusted data and cannot change agent instructions.
- Cache each query for a few hours in memory or Django's cache to save credits; nothing goes to PostgreSQL.
- On failure or no results, return `status: "search_unavailable"` / `"no_results"` and Agent 1 suggests widening the area.

## Image storage (file system, keyed by issue ID)

Images are stored in backend file storage, not in the database. The issue's primary key is the folder name, so no table or JSON field records image paths; the backend lists the folder to find an issue's images.

```text
MEDIA_ROOT/
├── issues/
│   ├── buy/{buy_issue_id}/{uuid}.jpg        # private: cars the buyer likes
│   ├── sell/{sell_issue_id}/{uuid}.jpg      # private: seller's car photos
│   └── repair/{repair_issue_id}/{uuid}.jpg  # private: symptom photos
└── posts/{post_id}/
    └── {uuid}.jpg                           # copied from the issue folder at approval
```

- **Naming:** `{uuid}.{ext}` filenames, so uploads never collide or reveal original file names. Allowed types: JPEG, PNG, WebP; size cap (e.g. 10 MB) and count cap (e.g. 10 per issue) enforced on upload.
- **Private issue images:** served only through an authenticated Django view that checks the caller owns the issue; never from a public `MEDIA_URL`.
- **Published post images:** at approval, the owner picks which issue photos to show; the backend copies them into `posts/{post_id}/`. This keeps the post a frozen snapshot, so later changes to the issue folder do not change what readers see. Files under `posts/{post_id}/` are public only while `posts.status = published`.
- **Deletes:** deleting an issue deletes its folder in the same service call; archiving a post hides its folder from public access.
- **Service:** one `issue_media_service` with `save(issue_type, issue_id, file)`, `list(issue_type, issue_id)`, `copy_to_post(issue_type, issue_id, post_id, filenames)` and `delete_folder(...)`. Swapping the local disk for object storage later (same key layout) needs no agent changes.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/issues/{type}/{id}/images/` | Upload an image to the owned issue's folder |
| `GET /api/issues/{type}/{id}/images/` | List the owned issue's images |
| `GET /api/issues/{type}/{id}/images/{filename}` | Serve one private image (owner only) |
| `DELETE /api/issues/{type}/{id}/images/{filename}` | Remove one image |
| `GET /api/posts/{id}/images/` | List images of a published post (public) |

## Agent 1 — Coordinator (Intent & Recommendation)

Agent 1 resolves which car and which issue the user means, recommends the best next step, delegates, and is the only agent that replies to the user.

| Tool | Reads / writes | Purpose |
| --- | --- | --- |
| `get_user_context()` | Reads `users`, own `used_cars`, own open `buy_issues` / `sell_issues` / `repair_issues`, own draft `posts` | Resolve "my Civic" to a `used_cars.id`; resume an open issue instead of creating a duplicate |
| `get_vehicle_details(used_car_id)` | Reads one owned `used_cars` row | Make, model, year, trim, mileage, condition |
| `register_used_car(make, model, year, mileage, trim?, condition?)` | Writes `used_cars` (owner = session user) | Required before any Sell or Repair issue; confirm details with the user first |
| `AgentTool(...)` × 5 | — | Delegate to Agents 2–6 |

**Intent → issue mapping**

| User intent | Issue created | Specialist(s) |
| --- | --- | --- |
| Buy a car | `buy_issues` | Agent 3 |
| Sell a car | `sell_issues` (needs `used_car_id`) | Agent 2 → Agent 4 → Agent 5 |
| Price check only | None | Agent 2 |
| Car problem | `repair_issues` (needs `used_car_id`) | Agent 6 |
| Share an outcome or request | Post on an existing issue | Agent 5 |

**Workflow:** message → `get_user_context()` → resolve or register the car → confirm the intent → delegate → compare specialist results → recommend one option with its evidence and limits, or ask a clarifying question.

**Example:** "My car won't start; should I repair or sell it?" → Agent 6 creates the repair issue and lists likely causes and cost evidence; Agent 2 values the car; Agent 1 sets repair cost against value and recommends one path.

## Agent 2 — Vehicle Valuation

Agent 2 returns an indicative asking-price range built only from published sell posts and the `new_cars` reference MSRP; with the current schema it cannot claim sold-price evidence.

| Tool | Reads / writes | Purpose |
| --- | --- | --- |
| `get_vehicle_details(used_car_id)` | Reads owned `used_cars` | Subject vehicle attributes |
| `search_comparable_posts(make, model, year_range, mileage_range, location?)` | Reads `posts` where `issue_type = 'sell'` and `status = 'published'`, filtering on `post_data` (JSONB) | Comparable asking prices with post IDs |
| `get_catalog_reference(make, model, year, trim?)` | Reads `new_cars.msrp` | Original reference price for depreciation context |
| `calculate_value_range(used_car_id, comparable_ids)` | Deterministic Django service; writes `state["valuation"]` for this turn and returns it as a `tool_response` | Range, median, sample size, data-quality flag |

**Output contract:** `{status, low, median, high, sample_size, price_basis: "asking", comparable_post_ids, msrp_reference, limitations}`. Below a minimum sample (e.g. 3 comparables) return `status: "insufficient_data"` with whatever MSRP context exists, never a fabricated range.

**Constraints:** the LLM never invents prices or does the arithmetic; the range comes from the comparables' distribution, not a fixed ±10% band. Index `post_data` keys used for filtering (GIN index or extracted columns) so the search stays in SQL.

## Agent 3 — Buyer Recommendation

Agent 3 saves the buyer's needs as a `buy_issues` record, then matches them against published sell posts (used) and the `new_cars` catalog (new), showing only contact fields sellers approved.

| Tool | Reads / writes | Purpose |
| --- | --- | --- |
| `create_or_update_buy_issue(description, min_budget?, max_budget?, preferences)` | Writes own `buy_issues` | Persist budget and `preferences` JSON (makes, models, `minimum_year`, `maximum_mileage`, `vehicle_type`, `fuel_type`, `location`) |
| `search_and_rank_used(buy_issue_id, limit=5)` | Reads `posts` (`sell`, `published`) | Hard filters in SQL before `LIMIT` (price ≤ `max_budget`, year, mileage, make), then soft-preference scoring with a reason per match |
| `search_new_catalog(buy_issue_id, limit=5)` | Reads `new_cars` | Only when `vehicle_type` is `new` or unset; label results as catalog entries with reference MSRP, not dealer stock |
| `identify_car_from_photo(buy_issue_id)` | Muse Spark reads `issues/buy/{buy_issue_id}/`; updates `buy_issues.preferences` after the buyer confirms | "I want a car like this" → make, model, body type |
| `get_post_contact(post_id)` | Reads `post_data.contact` of a published sell post | Seller-approved phone, email or link only |

**Workflow:** buyer describes needs → Agent 1 confirms budget and must-haves → issue saved → search and rank → Agent 1 presents top matches with reasons → buyer contacts the seller outside the app. Optionally, Agent 5 turns the buy issue into a public buy post so sellers can find the buyer.

**Empty state:** no matching posts → return `status: "no_results"` plus which constraint eliminated the most candidates, so Agent 1 can suggest relaxing it.

## Agent 4 — Seller Recommendation

Agent 4 creates the `sell_issues` record for an owned car, recommends an asking price from Agent 2's stored valuation, and finds buyers only among published buy posts.

| Tool | Reads / writes | Purpose |
| --- | --- | --- |
| `get_vehicle_details(used_car_id)` | Reads owned `used_cars` | Seller's car |
| `create_or_update_sell_issue(used_car_id, description, asking_price?, condition_details?, known_damage?, location?, contact_info?)` | Writes own `sell_issues`; server checks `used_cars.owner_id` = session user | Capture disclosures and private contact preferences |
| `assess_car_photos(sell_issue_id)` | Muse Spark reads `issues/sell/{sell_issue_id}/`; suggestions only, saved to `condition_details` after the seller confirms | Visible condition, damage, odometer reading |
| `recommend_asking_price(sell_issue_id)` | Reads `state["valuation"]`, set this turn by Agent 2 or rehydrated from the client history | Suggested price with evidence; the seller sets the final `asking_price` |
| `find_and_rank_buyers(sell_issue_id, limit=5)` | Reads `posts` (`buy`, `published`), matching `post_data` budget and preferences | Ranked buyer posts with match reasons |
| `get_post_contact(post_id)` | Reads `post_data.contact` of a published buy post | Buyer-approved contact only |

**Workflow:** seller names the car → Agent 1 resolves or registers it → sell issue created → Agent 1 runs Agent 2 → Agent 4 recommends a price and lists matching buyer posts → Agent 1 hands off to Agent 5 for the sale-post draft → seller approves.

**Dependency:** buyers are discoverable only if they published a buy post. Private `buy_issues` are never searched across users, and the agent never invents interested buyers.

## Agent 5 — Community Post Generation

Agent 5 turns one issue into a private `posts` draft (`issue_type` + `issue_id`) and publishes it only after the owner approves the exact public snapshot.

| Tool | Reads / writes | Purpose |
| --- | --- | --- |
| `get_issue_context(issue_type, issue_id)` | Reads the owned issue + its `used_cars` row | Source facts: description, preferences, condition, symptoms, `resolution_details` |
| `save_post_draft(issue_type, issue_id, title, content, post_data)` | Writes `posts` (`status = draft`); service validates the type/ID pair and ownership | Agent writes the text; backend validates the `post_data` schema per type |
| `update_post_draft(post_id, title?, content?, post_data?)` | Updates own draft | Apply the owner's edits |
| `select_post_images(post_id, filenames)` | Copies chosen files from the issue folder to `posts/{post_id}/` | Owner picks which photos go public |
| `approve_and_publish_post(post_id)` | Sets `approved_at`, then `status = published`, in one transaction | Only after explicit approval in the current turn; idempotent |

**`post_data` per type**

| `issue_type` | Snapshot contents |
| --- | --- |
| `sell` | Make, model, year, trim, mileage, asking price, approved condition and damage disclosures, location, approved `contact` fields |
| `buy` | Budget range, desired makes/models/year/mileage, location, approved `contact` fields |
| `repair` | Vehicle, symptoms, `method`, work performed, cost, mechanic name (only if the owner agrees), `owner_reported: true` |

**Rules:** an AI hypothesis in `ai_analysis` never appears as the confirmed fix; only `resolution_details` does. Self-service steps are labelled as owner-reported and unverified. `discussion` posts are not supported by the current schema.

## Agent 6 — Repair & Mechanic Recommendation

Agent 6 opens a `repair_issues` record on a registered car, learns from published repair posts, and records the owner-reported outcome that later feeds Agent 5.

| Tool | Reads / writes | Purpose |
| --- | --- | --- |
| `create_repair_issue(used_car_id, description)` | Writes own `repair_issues` (`status = open`) | Start the case |
| `save_diagnosis(repair_issue_id, symptoms, ai_analysis)` | Updates own issue | Store extracted symptoms (inferred vs confirmed) and the possibilities with uncertainty |
| `analyze_vehicle_photo(repair_issue_id)` | Muse Spark reads `issues/repair/{repair_issue_id}/`; adds findings to `symptoms` / `ai_analysis` with `source: "image"` | Warning lights, leaks, tire wear, engine-bay photos |
| `search_similar_repairs(repair_issue_id, limit=5)` | Reads `posts` (`repair`, `published`) by make, model, year and symptom terms; pgvector on `content` optional | Similar community cases, flagged as anecdotes |
| `estimate_repair_cost(repair_type, make, model)` | Aggregates `post_data.cost` from published repair posts | Owner-reported cost range with sample size; `insufficient_data` when thin |
| `get_post_mechanics(repair_issue_id)` | Reads `post_data` of published repair posts with similar repairs | Mechanics other owners used for this repair, with name, location and owner-reported cost |
| `find_nearby_mechanics(location, service, exclude_name?, limit=5)` | SerpApi Google Maps search (live, not stored) | Alternative when the post's mechanic is far or declined: repair centers near the user that offer the service, with name, address, phone, rating, hours |
| `record_resolution(repair_issue_id, status, resolution_details)` | Updates `status`, `resolution_details`, `resolved_at` | Mechanic or self-service outcome, as the owner reports it |

**Workflow:** symptoms → targeted questions (cranks, clicks, silent?) → `save_diagnosis` → similar repairs and cost evidence → mechanic from posts → if too far or declined, nearby repair centers from SerpApi → later, the user reports the outcome → `record_resolution` → Agent 1 offers a repair post via Agent 5.

**Safety:** brake failure, smoke, fuel leaks and overheating get immediate stop-driving guidance, not DIY steps. No guaranteed diagnosis or cost.

## Tool → model → endpoint mapping

Every write tool maps to an existing planned DRF endpoint, so the chat and the web UI share one service layer; read-only search tools need three new internal service functions.

| Agent tool | Model | DRF endpoint / service |
| --- | --- | --- |
| `register_used_car` | `used_cars` | `POST /api/cars/used/` |
| `get_vehicle_details` | `used_cars` | `GET /api/cars/used/{id}/` (owner-scoped) |
| `get_catalog_reference`, `search_new_catalog` | `new_cars` | `GET /api/cars/new/` |
| `create_or_update_buy_issue` | `buy_issues` | `POST`/`PATCH /api/issues/buy/` |
| `create_or_update_sell_issue` | `sell_issues` | `POST`/`PATCH /api/issues/sell/` |
| `create_repair_issue`, `save_diagnosis` | `repair_issues` | `POST`/`PATCH /api/issues/repair/` |
| `record_resolution` | `repair_issues` | `PATCH /api/issues/repair/{id}/resolution/` |
| `save_post_draft` | `posts` | `POST /api/posts/generate/` |
| `update_post_draft` | `posts` | `PATCH /api/posts/{id}/` |
| `approve_and_publish_post` | `posts` | `POST /api/posts/{id}/approve/` |
| `search_comparable_posts`, `search_and_rank_used`, `find_and_rank_buyers`, `search_similar_repairs`, `estimate_repair_cost` | `posts` (published only) | New service: `post_search_service` (filters `post_data` in SQL) |
| `get_post_contact` | `posts.post_data.contact` | `GET /api/posts/{id}/` (public fields only) |
| `calculate_value_range` | — | New service: `valuation_service` |
| `get_post_mechanics` | `posts` (published repair only) | `post_search_service` |
| `find_nearby_mechanics` | — (not stored) | New service: `serp_client` (SerpApi Google Maps) |
| `analyze_vehicle_photo`, `assess_car_photos`, `identify_car_from_photo` | Issue image folder + issue JSON fields | `issue_media_service` + `muse_client` (Muse Spark) |
| `select_post_images` | `posts/{post_id}/` folder | `issue_media_service.copy_to_post` |

## Implementation rules

1. **Agents select tools; Django executes.** Filtering, ranking, valuation and every mutation live in the service layer.
2. **Identity comes from the JWT.** Each turn sets `state["user_id"]` on the server. Owner and creator IDs are set server-side, matching the DRF serializer rule. Client events cannot supply them.
3. **Cross-user reads touch published posts only.** Agents never query another user's `used_cars`, issues or drafts.
4. **Contact data leaves only through `post_data.contact`.** `sell_issues.contact_info` stays private until the owner approves specific fields into a post.
5. **Validate the polymorphic pair.** Every post write checks `issue_type` ∈ {buy, sell, repair}, the row exists in the matching table, and the caller owns it.
6. **Approval is explicit and idempotent.** `approve_and_publish_post` needs a clear yes from the user in the current turn and is safe to retry.
7. **Structured results.** Every tool returns `{status, data, ids, provenance, error}`; empty searches return `no_results`, never invented rows.
8. **Hard filters before `LIMIT`, then soft scoring with a recorded reason.**
9. **Handle deletes.** When an issue is deleted, archive its posts (`status = archived`) in the same transaction to avoid orphaned logical references.
10. **Tool-returned text is untrusted.** Post content cannot override agent instructions or permissions.

## Cross-agent journey with database writes

One registered Civic carries the user from repair to sale; each step leaves a row that the next agent builds on.

| Step | User says | Agents | Database effect |
| --- | --- | --- | --- |
| 1 | "My 2018 Civic won't start." | Agent 1 | Finds or creates `used_cars` row |
| 2 | Answers diagnostic questions | Agent 6 | `repair_issues` created; `symptoms`, `ai_analysis` saved |
| 3 | "The mechanic replaced the battery, $180." | Agent 6 | `status = resolved`, `resolution_details`, `resolved_at` |
| 4 | "Share my experience." | Agent 5 | `posts` draft, `issue_type = repair` |
| 5 | "Looks good, publish it." | Agent 5 | `approved_at` set, `status = published` |
| 6 | "Should I sell it?" | Agent 4, Agent 2 | `sell_issues` created; valuation tool response appended to the client history |
| 7 | Sets price, approves post | Agent 4, Agent 5 | Sell `posts` row published with `post_data.contact` |
| 8 | Another user: "Civic under $15k?" | Agent 3 | `buy_issues` created; matches the sell post; shows approved contact |

## Known limitations and MVP priorities

The seven-model schema supports all six agents for the MVP; these limitations affect quality, not function.

| Limitation | Impact | Optional fix later |
| --- | --- | --- |
| `buy_issues` has no `contact_info` | Buyer contact must be captured at post approval | Add `contact_info` JSONB to `buy_issues`, mirroring `sell_issues` |
| No sold-price data | Valuation shows asking prices only | Add `sold_price` + `sold_at` to `sell_issues` when status becomes `sold` |
| No mechanics table | Nearby repair centers come live from SerpApi | Add a `mechanics` model only if curated listings are needed |
| No `discussion` post type | General community chat unsupported | Extend `issue_type`, or allow posts without an issue |
| `post_data` searched as JSONB | Slower filters at scale | GIN index now; extract `make`, `model`, `year`, `price` columns later |
| Repair requires a registered car | Quick anonymous troubleshooting blocked | Make `used_car_id` nullable on `repair_issues` |
| Chat history lives on the client | A cleared browser store drops messages and tool traces | Issue rows and image folders still resume through `get_user_context`. Server-side transcript storage is out of the MVP |

**Hackathon MVP order**

1. Agent 1 + `register_used_car` + client-held `events` (messages, tool calls, tool responses) with server-set `user_id` on each turn.
2. Agent 6 → Agent 5 repair flow end to end (create, diagnose, resolve, draft, approve, publish).
3. Agent 4 + Agent 5 sell flow, with Agent 2 returning `insufficient_data` honestly on thin seed data.
4. Agent 3 search against seeded published sell posts and `new_cars`.
5. Seed 20–30 published sell and repair posts so search, valuation and cost tools return real rows.
