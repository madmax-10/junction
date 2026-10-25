# Agent 4 — Task 4.3: Safe asking-price advice boundary

## Supported behavior and precise limitation

`recommend_asking_price()` authorizes an owner's private selling issue and returns
an honest `insufficient_data` result. **Numerical asking-price recommendation is
not implemented under the current handoff contract.** This is the fallback
explicitly permitted by Task 4.3 when valuation provenance cannot be established.
There is no fabricated price, MSRP substitute or second valuation algorithm.

Inspection found that Agent 2 returns ordinary dictionaries, with a source label
and vehicle ID but no authenticated result receipt. The shared
[state builder](../state.py) explicitly reconstructs valuation data from untrusted
client history. The existing [authentication bridge](../auth.py) signs identity,
session and app binding; it does not authenticate valuation amounts or their
vehicle association. A `published_sell_posts` label or `verified: true` key is
therefore not evidence of trusted Agent 2 execution. Currency is also not
established in the current valuation output contract.

Creating a new signing scheme, receipt store or Coordinator handoff would change
shared infrastructure outside this three-file task. Independently recalculating
or querying Posts would violate the explicit task boundary. Instead, all supplied
valuation contexts remain unqualified, including dictionaries produced by the
real pure estimator but delivered without an authenticated handoff. Input shape
alone cannot distinguish those dictionaries from model-generated claims.

## Dependency review and prior comparison limitation

Task 4.2's service, tests and Markdown matched commit
`0c475c3c8d89a1dea18cd7336daa79a426974ef4` before edits. Read-only review of its
authentication, owner/car-bound update, allowlists, Decimal validation and atomic
helpers found no critical dependency defect. No prior service was changed.

Task 4.2's incomplete whole-repository comparison meant a referenced Git object
was not available in loose-object storage to the simple inspection script. It
did not indicate a Django correctness failure. The specific dependency files
were independently found committed and unchanged. Native Git remains unavailable
because of the environment's Apple developer-tools limitation; no tools were
installed and unrelated work is not staged, reset or discarded.

## Signature and models

```python
recommend_asking_price(sell_issue_id, valuation_context=None, *, user=None)
```

The issue identifier is a UUID object or UUID string. `valuation_context` may be
the existing Agent 2 envelope or its data dictionary, but neither is considered
trusted merely by being passed here. Missing input gives an explicit missing-
context explanation; any supplied input gives an unestablished-provenance
explanation. Context is not mutated, reserialized, echoed or mined for prices.
Even malformed objects, nonfinite amounts, unsupported currency labels or wrong
vehicle IDs cannot activate a numerical recommendation.

Trusted server callers provide JWT-authenticated `request.user` or a user
resolved by the shared ADK bridge. Raw model/client user IDs or mutable session
claims are not authorization. As in Seller Tasks 4.1/4.2, identity must be the
configured saved active Django user, and current active existence is rechecked.

The [SellIssue model](../../issues/models.py) links `user` and `used_car` and
contains private description, intended asking_price, condition_details,
known_damage, location, contact_info, status and timestamps. Its
[UsedCar](../../vehicles/models.py) links owner and has make/model/year/trim,
mileage and condition. The actual joined lookup requires the issue user and
vehicle owner to match the authenticated user. Only authorized issue and vehicle
IDs are selected because none of the private text or existing price can resolve
the provenance gap. This avoids retrieving context that cannot affect the safe
decision. No condition/mileage adjustment or existing-price fallback occurs.

Staff cannot bypass ownership. Foreign, missing, malformed and inconsistent
references share `Sell issue not found.`. Missing, anonymous, unsaved, inactive,
deleted or untrusted identities fail with `Authentication is required.`.

## Actual Agent 2 contracts inspected

| Existing component | Actual responsibility and relevant output |
| --- | --- |
| [estimate](./valuation_service.py) | Pure Decimal calculations, deduplicated by post ID; at least 3 distinct observations; completed/insufficient_data status; low, median, high, sample_size, price_basis=asking, comparable_post_ids, msrp_reference, limitations |
| [search_comparable_posts](./post_search_service.py) | Filters published Sell snapshots by supplied vehicle ranges; validates prices and excludes explicit synthetic data |
| [get_catalog_reference](./catalog_service.py) | Separate unambiguous stored catalog MSRP reference; not used-car market value |
| [calculate_value_range](./value_range_service.py) | Authorizes an owned car, revalidates selected comparable Posts, invokes estimate and catalog lookup, returns the shared envelope with owned vehicle/public source IDs |
| [Valuation ADK adapter](../agents/valuation.py) | Resolves trusted identity and delegates to calculate_value_range; ordinary structured output, not a signed valuation receipt |

These components were inspected and remain unchanged. This service does not call
them at runtime, invoke the Valuation agent, independently select Posts or copy
their median algorithm. The tests use the real pure estimator to demonstrate
that even an authentic result's plain shape cannot establish origin at this
new boundary.

Agent 2's outer successful envelope is `status: ok`; its inner data status is
`completed`. Insufficient evidence is explicit and lacks range values. Monetary
values remain Decimal internally and become strings through the shared result
builder. No currency is present, and the pure estimator assumes callers already
provided same-unit comparable amounts. MSRP is separately attributed. An
asking-price median is an observation of advertised prices, not a completed-sale
median or guaranteed achievable value.

## Why no candidate is selected yet

With a future established trusted same-vehicle and monetary-unit handoff, the
existing Agent 2 median could be interpreted as a starting asking-price reference
without new adjustment arithmetic. That path is deliberately absent now.
Malformed or inconsistent prices, fewer than three observations, incompatible
vehicle context, missing units/currency and untrusted source claims cannot be
made valid by adding a source label. This function does not relay their amounts,
counts, IDs or private/unpublished content as verified evidence.

No Decimal arithmetic or precision-losing float conversion is performed because
no amounts qualify. The existing intended asking price is never used or changed.
There are no premiums, geographic factors, accident deductions or negotiation
rules. A future price write requires a separate explicit owner-approved call to
Task 4.2.

## Output example and errors

```python
result = recommend_asking_price(issue.id, valuation_context, user=request.user)
```

The shared envelope uses Agent 2's familiar range/count names for the absence
of qualified observations and adds the requested candidate field:

```json
{
  "status": "insufficient_data",
  "data": {
    "status": "insufficient_data",
    "id": "<authorized sell issue UUID>",
    "used_car_id": "<owned vehicle UUID>",
    "suggested_asking_price": null,
    "low": null,
    "median": null,
    "high": null,
    "sample_size": 0,
    "price_basis": "asking",
    "comparable_post_ids": [],
    "currency": null,
    "limitations": ["<missing/untrusted evidence, currency, asking-versus-sale and no-adjustment explanations>"]
  },
  "ids": {"issue": {"type": "sell", "id": "<authorized issue UUID>"}, "used_car_id": "<owned vehicle UUID>", "post_ids": []},
  "provenance": "own_sell_issues",
  "error": null
}
```

Sample size zero means zero **authenticated qualified observations at this
boundary**, not a claim that the supplied context or database contains no
listings. Null currency and range/candidate values mean no monetary
recommendation. No untrusted public-source IDs are attributed as evidence.

Authentication and private lookup failures use the established error envelope
with null data and empty IDs. Database failures use `Seller pricing advice is
unavailable.`. There are no raw exceptions, account IDs, private contacts,
vehicle specifications, untrusted supplied notes or unrelated private records
in the response. Authorized issue/vehicle references are the only private IDs
needed for continuation.

## Classroom runtime walkthrough

```text
Trusted user + private SellIssue UUID + optional valuation context
    -> verify current saved active account
    -> validate issue UUID type/format
    -> owner-scoped SellIssue AND vehicle-owner SELECT
    -> establish no authenticated valuation-result handoff exists
    -> return insufficient_data, null prices and explicit limitations
    -> owner/Coordinator can address missing trusted evidence separately
```

For Django learners, authentication establishes who the caller is; joined ORM
filters establish which private issue they may reference. That does not prove
the origin of a separate dictionary of valuation numbers. This distinction is
why authorization can succeed while evidence remains insufficient.

The normal path uses two SELECTs. There are no transactions for writes because
the function performs no writes. SellIssue asking_price, vehicle data, Post
snapshots and supplied context remain unchanged. No public Post is created and
no private BuyIssue or other owner's selling request is searched for comparables.

Task 4.1 provides owned-car retrieval and Task 4.2 stores private seller
information. Task 4.3 adds the safe read-only recommendation boundary, not a
fabricated numerical feature. A future Coordinator must supply evidence through
an established authenticated server-owned mechanism before a numerical path
can be supported. A future ADK Seller adapter must also resolve identity with
the existing bridge and call synchronous Django work using the established
thread-sensitive async convention. No such integration is added here.

## Actual tests and verification

From `backend/`, with the existing Python 3.12 environment:

```shell
PYTHONPATH=/Users/sanishshrestha/Documents/hackTexas1 /Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_seller_price_service agent.tests.test_seller_vehicle_service agent.tests.test_seller_issue_service agent.tests.test_valuation_service agent.tests.test_post_search_service agent.tests.test_catalog_service agent.tests.test_value_range_service agent.tests.test_valuation_agent agent.tests.test_auth -v 1 --noinput
```

The repository root on PYTHONPATH is needed by the existing pure Valuation test's
`backend.agent...` import. The first run hit that existing import-path error;
the rerun fixes process configuration only, with no teammate-test edits.

Final result: **145 passed / 0 failed**, including 17 new price-boundary tests
and 128 selected Seller, Agent 2 and authentication regressions. Django system
checks report no issues. The installed ADK emits its expected experimental
JSON-schema declaration warning in the existing Valuation agent tests.

Focused coverage uses real isolated private records and actual estimator shapes.
Tests cover authentication/ownership, generic private errors, malformed/untrusted
contexts, forged source labels, wrong vehicle IDs/currency, insufficient counts,
nonfinite/negative/inconsistent values, no MSRP fallback, read-only SQL, preserved
records, no Post search/agent invocation/network, privacy and deterministic output.
The numerical-success/minimum/median/maximum test scenarios are unsupported at
this handoff and are tested as safe insufficiency rather than fabricated success.

The suite exercises imports, real Agent 2 calculations and ADK regression behavior
without paid API calls. New-file editor diagnostics report no issues. AST checks
verify syntax and one production function; whitespace checks cover the three
permitted files. Prior files are not modified. Native Git status/diff/check/stat
remain unavailable due to the known Apple developer-tools limitation; no tools
are installed and final native Git review remains with local Terminal. No changes
are staged, committed, pushed, merged, rebased or reset.
