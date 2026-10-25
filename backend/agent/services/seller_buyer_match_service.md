# Agent 4 — Task 4.4: Published buyer-interest matching

## Purpose and prerequisite

`find_and_rank_buyers()` compares an authenticated owner's vehicle against
existing approved, published Buy Post requirements. It returns public interest
posts, **not buyer identities, private BuyIssues or promises of purchase**.
No external API, model generation, publication, contact lookup or database write
is involved.

Task 4.3's production, test and explanation files were verified committed and
unchanged against `d5b9abd5aa336e48b7f334964166941bb2ba716a` before implementation.
Tasks 4.1–4.3, the actual models, Buyer search, public contact, validators,
publication services and related tests were inspected. Only the three Task 4.4
files were written. No prior service or teammate-owned code is modified.

## Verified public source: Buy Posts really are supported

The [Post model](../../posts/models.py) explicitly supports `buy`, `sell` and
`repair` types. Its statuses are `draft`, `approved`, `published` and `archived`.
The existing [public snapshot validator](../../posts/validation.py) has a Buy
schema with public vehicle preferences and optional budgets/contact/photos.
[generate_post](../../posts/services.py) supports Buy snapshots, and `approve_post`
validates and publishes them with an approval timestamp. This task does not
introduce that capability or assume it merely because Sell Posts exist.

The focused test uses a real private BuyIssue and the existing generate/approve
workflow to establish that its draft is excluded and its published snapshot is
eligible. Production matching never reads that private source issue. A Post's
public content is a separate snapshot; no private source query or identity join
is required to use the approved preference projection.

Current source support is verified in code and tests. This does not claim that
the application's live database contains any interested buyers. Empty public
inventory is normal, and one person may publish multiple interest posts.

## Signature and authorization

```python
find_and_rank_buyers(sell_issue_id, limit=5, *, user=None)
```

`sell_issue_id` accepts a UUID object or UUID string. `limit` must be an integer
from 1 through 10, excluding booleans, floats, numeric strings, null, containers,
zero and negatives. Authentication and issue ownership are checked before
searching public interest or returning input-specific search results.

The user is supplied by trusted server code using JWT-authenticated
`request.user` or the existing [ADK identity bridge](../auth.py). The service
follows Seller's saved/active configured-user checks and current active-account
existence query. It never accepts a model-generated user ID or editable session
claim as authorization. Missing, anonymous, raw-mapping, forged-context,
unsaved, inactive or deleted identities cannot authorize access.

The [SellIssue](../../issues/models.py) lookup filters by issue UUID, authenticated
user and related [UsedCar](../../vehicles/models.py) owner. Both must match;
staff has no bypass. Foreign, missing, malformed and inconsistent references
share `Sell issue not found.` with no data or IDs. Only the authorized issue
ID and car make/model/year/mileage are selected. The owner's selling description,
contacts, price, private history and unrelated records are not needed or queried.

## Public query and field projection

Candidates must have:

- `issue_type=buy`;
- `status=published`;
- non-null `approved_at`, consistent with the actual approval flow.

Draft, approved-but-unpublished, archived, unknown/rejected/withdrawn statuses,
Sell and Repair posts are excluded. Deleted Posts are absent from the table.
The source exists as a repository contract; it is not an inference from private
account activity.

The query reads the Post UUID and only these nested JSON values:

| Public field | Compared against authorized car |
| --- | --- |
| preferred_makes | Exact case-insensitive make membership |
| preferred_models | Exact case-insensitive model membership |
| minimum_year | Car year must meet or exceed the minimum |
| maximum_mileage | Car mileage must not exceed the maximum |
| vehicle_type | Explicit `new` is incompatible; explicit `used` is compatible |

Existing `normalize_preferences` validates selected fields: list/string limits,
nonnegative mileage, actual year bounds and allowed vehicle types remain shared
contracts. A malformed selected field excludes that candidate. Missing optional
values are normalized away. A post with no usable supported requirement is
skipped rather than called a match solely because it was published.

Neither complete `post_data`, title/content, source issue UUID nor contact data
is fetched. Unknown extras, private identifiers or contacts injected into a
snapshot cannot enter the result projection. Private BuyIssues, accounts and
other users' registered vehicles are never a matching source.

## Matching and deterministic ranking

Every declared supported make/model/year/mileage requirement must pass.
An explicit used-vehicle preference alone can produce broad used-car interest;
it does not imply a make or model match. Requirements with new-vehicle preference
are excluded because Seller's car is an existing UsedCar.

Compatible posts rank lexicographically by the presence of an explicit matching
make, then model, then minimum-year, maximum-mileage and used-vehicle requirement.
UUID ascending breaks remaining ties. This favors specificity using a simple
fixed ordering; there is no model-generated score, probability or new pricing
adjustment. Reasons describe exactly which public requirements passed, and the
returned `public_requirements` preserves only the assessed projection.

At most the newest 500 eligible published snapshots are read, ordered by creation
time descending and UUID ascending. Ranking occurs within this bounded set and
the final list is sliced to `limit`. Older relevant posts can be missed; changes
to public records may change results. Identical stored inputs give stable results.

Budgets are deliberately neither read, returned nor compared because the schema
does not establish currency. Task 4.3's unavailable recommendation is not used
as pricing evidence. Fuel and location requirements are not assessed or returned:
the matching projection covers only the five stated attributes, and limitations
explicitly disclose this. Thus a match does not claim full compatibility with
every preference in the original post. No purchase intent, available budget,
buyer identity, current availability or guaranteed transaction is verified.

## Output and empty-versus-unavailable behavior

```python
result = find_and_rank_buyers(issue.id, limit=5, user=request.user)
```

The shared result envelope is used:

```json
{
  "status": "ok",
  "data": {
    "matches": [{
      "post_id": "<published Buy Post UUID>",
      "public_requirements": {"preferred_makes": ["Toyota"], "preferred_models": ["Camry"]},
      "reasons": ["Vehicle make matches an explicitly published preference.", "Vehicle model matches an explicitly published preference."],
      "provenance": "published_buy_post_interest"
    }],
    "result_count": 1,
    "limitations": ["<public-interest, bounded-ranking, unassessed-attributes and no-contact explanations>"]
  },
  "ids": {"issue": {"type": "sell", "id": "<authorized issue UUID>"}, "post_ids": ["<published Buy Post UUID>"]},
  "provenance": "published_buy_posts",
  "error": null
}
```

`result_count` counts returned posts, not distinct people or a count of private
prospective buyers. With no compatible candidates, status is `no_results`, lists
are empty, count is zero, and the same public-source provenance/limitations
remain. No fake records or Sell Posts replace missing Buy interest.

Unsupported-source behavior would require `insufficient_data` under the shared
status vocabulary, which has no generic `unavailable`. That branch is unnecessary
here because the source contract is demonstrably present. No unsupported-source
flag or new publication workflow is invented. If a future schema removes the
source contract, it must be reviewed rather than falling back to private data.
Database failure instead returns a distinct structured error, `Public buyer-interest
search is unavailable.`, so it cannot be confused with an empty successful search.

Authentication failures use `Authentication is required.`; private lookup errors
are generic; bad limits explain the 1–10 requirement. Errors use null data and
empty IDs. Raw SQL, stack traces, contacts and private buyer details are not
returned.

## No contact disclosure and read-only scope

Even owner-approved public contact is outside this operation. The existing
[get_post_contact](./post_contact_service.py) is specifically for published Sell
Posts and is not called or repurposed to disclose Buy Post contact. There are no
emails, phone numbers, JWTs, private user IDs or session details in matches.

The function performs only SELECTs. It neither creates nor updates issues,
vehicles or Posts, never contacts prospective buyers, and invokes no Valuation,
Gemini, Places, SerpApi, agent or network client. No publication or consent state
is changed. The separate existing Post workflow remains responsible for what
gets approved and published.

## Student runtime walkthrough and later integration

```text
Trusted seller + private SellIssue UUID + limit
    -> active saved account SELECT
    -> SellIssue ownership AND associated vehicle-owner SELECT
    -> strict limit validation
    -> bounded published/approved Buy Post preference projection SELECT
    -> shared preference validation
    -> reject incompatible supported requirements
    -> deterministic specificity/UUID order
    -> public match projection and unchanged structured envelope
```

Authentication establishes the seller's identity. Ownership authorizes reading
the selling vehicle. Publication authorizes using a separate public preference
snapshot; it does not authorize opening the buyer's private records. Projection
limits which approved fields can leave the service. This separation is the main
privacy property of the implementation.

Task 4.1 supplies private owned-car context, Task 4.2 persists selling details,
and Task 4.3 preserves safe pricing insufficiency. Task 4.4 adds actual supported
public-interest matching without using private buyers or unsupported prices.
A future Seller ADK adapter should resolve identity through the shared bridge
and use the existing thread-sensitive async wrapper around this synchronous
service. Coordinator wiring, contacting people, richer opt-in matching and
publication changes remain separate tasks. No new opt-in publication capability
is needed for the current already-approved Buy Post projection; budget matching
would require an established shared currency contract.

## Actual tests and verification

From `backend/`, using the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_seller_buyer_match_service agent.tests.test_seller_vehicle_service agent.tests.test_seller_issue_service agent.tests.test_seller_price_service agent.tests.test_buyer_search_service agent.tests.test_post_contact_service agent.tests.test_auth posts.tests -v 1 --noinput
```

**144 passed / 0 failed**, including 21 new matching tests and 123 selected
Seller, Buyer public-search/contact, authentication and Post regressions. Django
system checks and editor diagnostics report no issues. Tests exercise the real
Buy publication flow rather than assuming support from raw fixture records.

Coverage includes identity/ownership, malformed IDs/limits, publication/type
filters, exact make/model matching, year/mileage bounds, missing/invalid public
requirements, used/new selection, stable ranking and limits, ignored budgets,
no contacts or private identity, empty results and database errors. Query capture
proves no private BuyIssue reads, three normal SELECTs, a 500-row candidate limit,
no contact projection and no writes. Snapshots preserve SellIssue/UsedCar/Post
data. External calls, valuation and public-contact lookup are asserted uncalled.

Syntax/import, one-production-function, three-task-file and whitespace checks
are performed independently of unavailable native Git. Existing files and all
unrelated changes are left untouched. Final native Git status/diff/check/stat
review remains for local Terminal because of the known developer-tools limitation.
No dependencies/system tools are installed, and no staging, commits, pushes,
merges, rebases, resets or Git identity changes are performed.
