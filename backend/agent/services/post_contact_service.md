# Task 3.4 — Shared public seller contact retrieval

## Purpose, inspection and Git checkpoint

[`get_post_contact()`](./post_contact_service.py) returns only the contact fields
in an approved **published Sell-post snapshot**. It does not retrieve private
seller details, send a message, call a business, or create an ADK wrapper.

Before changes, branch `Agent3(Buyer)` was clean and Task 3.3 was committed in
`397a587`. No contact-retrieval service existed: the public Post API exposes
posts, while the shared `normalize_contact` helper validates contact but does
not retrieve it. This task adds one shared retrieval function, one focused test
file, and this document, leaving prior tasks and teammate code unchanged.

## Exact interface and result

```python
get_post_contact(post_id)
```

The identifier must be a UUID object or valid UUID string. Booleans, numeric
objects (including fractional values), arbitrary objects and malformed strings
are rejected before querying. The result uses the existing shared envelope:

```python
{
    "status": "ok",
    "data": {
        "post_id": "<published-sell-post-uuid>",
        "contact": {"email": "public-seller@example.com", "phone": "512-555-0100"},
    },
    "ids": {"post_id": "<published-sell-post-uuid>"},
    "provenance": "published_sell_posts",
    "error": None,
}
```

Every field in `contact` is optional; success requires at least one valid,
nonblank permitted value. Example addresses and numbers are synthetic fixtures.
No raw `post_data`, Django model instance, issue ID or seller identity is returned.

## Verified approval and access contract

The existing [`Post`](../../posts/models.py) has `issue_type`, `status`,
`post_data` and `approved_at`. This function filters with the actual
`Post.IssueType.SELL` and `Post.Status.PUBLISHED` constants. Draft, Approved-but-
unpublished, Archived, Buy and Repair posts are excluded regardless of contact.

[`generate_post()`](../../posts/services.py) builds the draft from the owned
issue, but `_build_sell_snapshot()` deliberately **does not copy private
`SellIssue.contact_info`**. Explicit public contact can be supplied in the draft
snapshot and reviewed/edited by its owner. The existing `approve_post()` checks
ownership, revalidates the snapshot, sets `approved_at`, and publishes atomically.
Draft edits cannot modify published posts. Archiving removes public eligibility.

There is no separate contact-approved flag or per-field approval table. The
**published snapshot is the authoritative approved public disclosure**. The
function follows that existing gate, just like `can_read_post()` and the public
Post views; it does not invent additional flags or a different approval workflow.
It does not separately treat `approved_at` alone as permission to read a draft.

The service cannot prove user intent independently of the trusted publication
workflow or detect arbitrary administrative database edits. That limitation
does not justify consulting private records or bypassing publication checks.

## Actual public contact schema and validation reuse

The shared [`normalize_contact()`](../../common/validators.py), already used by
Post publication validation, is reused unchanged:

| Permitted field | Existing rules |
| --- | --- |
| `phone` | Optional string, trimmed, maximum 50 characters. No additional phone-number parser is invented. |
| `email` | Optional string, trimmed, maximum 255 characters and Django email validation. |
| `link` | Optional string, trimmed, maximum 500 characters, starting with `http://` or `https://`. This is the existing rule, not an independently verified website. |

Unknown fields are rejected, not returned. A missing/null/empty contact yields
no result. A malformed structure, invalid value, or unknown nested key makes the
entire contact unavailable; valid-looking fields from a corrupt object are not
partially exposed. Legitimate approved values are preserved according to the
same normalization applied at publication. No private information fills gaps.
There is no permitted home-address, account ID, authentication or internal
metadata field in this contact schema.

## Runtime flow and privacy

1. Validate the UUID without coercing a boolean, number or arbitrary object.
2. Query the existing `Post` table, restricted to that ID, Sell and Published.
3. Project only `id` and the JSON `post_data__contact` path in SQL.
4. Run the shared contact validator on the projected object.
5. Return the small success envelope or a safe empty result.

There are no User/profile, private SellIssue or private UsedCar lookups and no
owner joins. A seller's private account email or issue phone cannot become a
fallback. The actual User model has no phone field; tests therefore put private
phone information in its real `SellIssue.contact_info` location, not an invented
User attribute. No contact values or stack traces are included in errors.

## Authentication policy and shared-agent reuse

The existing Post list/detail API explicitly allows public reads (`AllowAny`)
of published posts. Consequently this **public-data-only** service accepts no
user argument and does not require the buyer to own the seller's post. This is
not bypassing authentication: private issue operations remain authenticated,
while the current Post contract intentionally makes published disclosures public.
The future chatbot/ADK wrapper should still use the shared JWT bridge at its
request boundary; it must never treat a model-generated user ID as authorization.

Task 3.2 returns published post IDs without contact. The future Buyer workflow
can invoke this service only when the Coordinator needs to present a seller's
approved contact method. A Seller workflow needing **the same public Sell-post
contact** can call the exact same shared function; no duplicate Seller service
or Seller Agent change is needed.

There is a documented scope difference: the architecture also describes Agent
4 retrieving buyer contact from published **Buy** posts. This task explicitly
excludes non-Sell types, so this implementation does **not** satisfy that separate
Buy-post use case. It must not silently broaden access; any future extension
needs a separately reviewed contract. Agent 4 is unchanged here.

## Empty results and errors

- Malformed identifiers: shared `error` envelope, generic `Invalid post identifier.`.
- Missing, deleted, archived, unpublished, non-Sell, contactless or malformed-
  contact records: the same `no_results` envelope, `data=None`, `ids={}`. Private
  record existence is not revealed through per-record reasons or metadata.
- Database failures: generic `Public contact lookup is unavailable.` with null
  data, no IDs, and no raw exception/SQL.

No writes, emails, calls, messages or external requests occur. Contact can be
stale or user-reported; schema validation is not verification of reachability or
ownership of a phone, email, or linked website. Other restrictions/redaction
mechanisms would need to be followed if the team adds them later; none currently
exist beyond approved snapshots and publication status.

## Test strategy and verification

Valid fixtures use real `generate_post`, owner draft editing/validation, and
`approve_post` services. Tests do not insert fake Published rows to bypass
approval. Malformed-contact publication is explicitly tested as rejected. To
exercise defensive handling of a corrupted read, tests mock only the contact
projection after a legitimate publication, rather than publishing invalid data.
The Approved intermediate-state fixture remains unpublished and is tested only
for denial; normal approval currently transitions directly to Published.

Tests cover approved and partial contact, exact normalization, missing/private
fallback denial, all ineligible statuses/types, malformed IDs/JSON, unknown
fields, owner review removing phone, unauthorized approval, shared response
schema, no private joins, read-only SQL and no external calls.

From `backend/`, run with the existing Python 3.12 environment:

```shell
/Users/sanishshrestha/.venvs/hacktx/bin/python -B manage.py test agent.tests.test_post_contact_service agent.tests.test_buyer_search_service -v 1 --noinput
```

SQLite is the current database configuration; no model, index, migration,
authentication setting, Post service or existing Buyer/Valuation code is changed.

Actual results: **20 focused Task 3.4 tests and 23 Task 3.2 regression tests
passed (43 total), 0 failed**, using Python 3.12.15 and the isolated SQLite test
database. Django reported no system-check issues. The service imports correctly
and editor diagnostics report no errors. Git status shows exactly the three new
task files; prior work remains unchanged. Diff/whitespace review passed, including
the untracked-file content, and the production file defines exactly one function.
No files were staged or committed and no dependencies were installed.
