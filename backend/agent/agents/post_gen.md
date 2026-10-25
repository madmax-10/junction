# Agent 5 — Community Post Generation (`post_gen`)

## Scope

Agent 5 turns one of the user's issues (`sell`, `buy` or `repair`) into a private
`posts` draft and publishes it only after the owner approves. It follows the
"Agent 5" section of
[`car_owner_hub_agent_architecture.md`](../../../car_owner_hub_agent_architecture.md).
It adds no models, migrations, endpoints or contract changes.

It is a specialist. The coordinator calls it as an `AgentTool`, and its answer
returns to the coordinator, which is the only voice the user hears. Transfers to
the parent and to peer agents are disabled.

| File | Role |
| --- | --- |
| [`post_gen.py`](./post_gen.py) | `build_post_gen_agent(model=None)` returns the `LlmAgent` named `post_gen` |
| [`../prompts/post_gen.py`](../prompts/post_gen.py) | `POST_GEN_INSTRUCTION`: voice rules, the three templates, repair and approval rules |
| [`../tools/post_tools.py`](../tools/post_tools.py) | The five function tools |
| [`../runner.py`](../runner.py) | `default_specialists()` registers the real agent in place of the stub |

## Tools

Each tool wraps an existing posts service or serializer, so the chat and the
REST API share one set of rules. All return the `{status, data, ids, provenance,
error}` envelope from [`contracts.md`](../contracts.md).

| Tool | Calls | Notes |
| --- | --- | --- |
| `get_issue_context(issue_type, issue_id)` | `get_owned_issue` | Returns only the facts the templates use, the issue's photo filenames and its existing posts. Never returns `ai_analysis` or `contact_info` |
| `save_post_draft(issue_type, issue_id, title, content, post_data?)` | `GeneratePostSerializer`, `generate_post` | Creates a `draft`. Returns `ids.post_id`, which restores `draft_post_id`. Refuses a repair with no recorded outcome and a second draft for the same issue |
| `update_post_draft(post_id, title?, content?, post_data?)` | `PostUpdateSerializer`, `update_draft` | `post_data` is merged into the draft and `null` removes a field. With no changes it re-shows the draft |
| `select_post_images(post_id, filenames)` | `update_draft` with `post_data.photos` | Replaces the photo selection and keeps the other fields. Paths are checked by `normalize_photo_paths` |
| `approve_and_publish_post(post_id)` | `approve_post` | Publishes only the draft in `state["draft_post_id"]`. An already published post is returned unchanged |

Money in `post_data` is stored as a JSON number, and tool results reject floats,
so a cost such as `180.5` is returned to the model as the string `"180.5"`.

## Identity flow

```text
JWT-authenticated request (DRF)
  → run_turn(request.user.id, events)
  → state["user_id"] set by the server; draft_post_id rebuilt from the history
  → AgentTool passes the parent's state to post_gen
  → tool reads tool_context.state["user_id"] via _current_user
  → posts services check ownership
```

No tool accepts a user id, owner id or approval flag as an argument, and
`tool_context` is hidden from the model's schema. History events cannot set
`user_id`. The tools use the same `_current_user` helper as the coordinator tools,
because the chat path sets `user_id` in state and does not write the signed
binding that `get_authenticated_user` requires.

## Voice and templates

Posts are written in the first person, as the owner, in a short social-media
style: one hook, the facts, a call to action, at most two emojis and two or three
hashtags. The three templates are in the instruction. Lines whose facts are
missing are left out, and nothing is invented.

Contact appears only if the request says the owner chose it, and goes into
`post_data.contact`. Otherwise the post ends with "DM me here on the app."

## Repair posts and the Option A decision

- The fix comes only from `resolution_details`. `ai_analysis` is never returned or used.
- Every repair post says it is the owner's own unverified experience.
- The "Fixed by" line appears only if the owner agreed to name the mechanic. The
  coordinator is told to ask once: "Want to mention who fixed it and where?"

**Option A:** the shop or mechanic name goes in the existing `mechanic_name`
field (100 characters at most), and the place appears only in the post text.
`post_data` for repairs has no field for a shop name or location, and unknown
keys are rejected, so structured storage would need a schema change.

**Limitation:** Agent 6's mechanic search can match a mechanic by name but cannot
filter published repair posts by city. **Option B** would add `shop_name` and
`location` to `REPAIR_KEYS` in `posts/validation.py`, `shop_name` to
`MECHANIC_RESOLUTION_KEYS` in `common/validators.py`, and copy both in
`_build_repair_snapshot`. That touches the frozen contract, so it needs the team's
agreement and is not done here.

## Approval

Publishing needs two things: the instruction only allows it when the request says
the owner clearly approved this exact draft in their latest message, and the tool
refuses any id other than `state["draft_post_id"]`. A draft returns to state when
it is saved or when `update_post_draft` is called on it, and the state key is
cleared when it is published.

## Limitations

- The agent cannot ask the user anything. The coordinator prompt tells the
  coordinator to put the issue type and id, the contact the user chose, whether
  the mechanic may be named, and the user's approval in the request. If the
  coordinator leaves a choice out, the agent drafts without it and reports what
  is still undecided. Photo choices are not in that list, so the coordinator
  passes them only if it thinks to.
- The prompt is checked for its rules, but no live Gemini run has been done. The
  tests use scripted fake models, so how well a real model follows the templates
  is not verified.
- `get_user_context` lists draft ids but does not restore `draft_post_id`. To
  publish a draft from an earlier conversation, call `update_post_draft` on it
  first.
- A post is a snapshot. Later changes to the issue do not update it.

## Tests

From `backend/`:

```shell
python manage.py test agent.tests.test_post_tools agent.tests.test_post_gen_agent agent.tests.test_post_gen_prompt
```

55 tests cover:
- Authentication failures: missing, unknown and inactive users.
- Drafts for all three types, ownership, and rejected `post_data` keys.
- Merge edits, photo selection, and the publish gate and its idempotency.
- Rebuilding `draft_post_id` in state.
- Agent construction, `AgentTool` and coordinator registration, and the default
  wiring in `run_turn`.
- A draft-then-publish flow across two turns.
- The prompt's rules and templates.

Models are scripted and no network is used.
