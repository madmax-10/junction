"""Agent 5 wiring with a scripted fake model. Run with: python manage.py test agent"""

import json

from django.test import SimpleTestCase, TestCase
from google.adk.tools import AgentTool, FunctionTool

from accounts.models import User
from agent.agents.coordinator import build_coordinator
from agent.agents.post_gen import build_post_gen_agent
from agent.agents.stubs import SPECIALIST_DESCRIPTIONS
from agent.config import AGENT_MODEL
from agent.prompts.post_gen import POST_GEN_INSTRUCTION
from agent.runner import run_turn
from agent.tests.fakes import call, say, scripted
from agent.tests.test_post_tools import make_sell
from posts.models import Post

TOOL_NAMES = {
    "get_issue_context",
    "save_post_draft",
    "update_post_draft",
    "select_post_images",
    "approve_and_publish_post",
}


def user_message(text, event_id="u-1"):
    return {"id": event_id, "kind": "message", "role": "user", "author": "user", "text": text}


class BuildPostGenAgentTests(SimpleTestCase):
    def test_name_description_and_instruction(self):
        agent = build_post_gen_agent(scripted())
        self.assertEqual(agent.name, "post_gen")
        self.assertEqual(agent.description, SPECIALIST_DESCRIPTIONS["post_gen"])
        self.assertEqual(agent.instruction, POST_GEN_INSTRUCTION)

    def test_defaults_to_the_configured_model(self):
        self.assertEqual(build_post_gen_agent().model, AGENT_MODEL)

    def test_has_exactly_the_five_tools_and_hides_tool_context(self):
        agent = build_post_gen_agent(scripted())
        self.assertEqual({tool.__name__ for tool in agent.tools}, TOOL_NAMES)
        for tool in agent.tools:
            with self.subTest(tool=tool.__name__):
                declaration = FunctionTool(tool)._get_declaration()
                schema = json.dumps(declaration.model_dump(mode="json", exclude_none=True))
                self.assertNotIn("tool_context", schema)
                self.assertNotIn("user_id", schema)

    def test_cannot_hand_the_conversation_to_another_agent(self):
        agent = build_post_gen_agent(scripted())
        self.assertTrue(agent.disallow_transfer_to_parent)
        self.assertTrue(agent.disallow_transfer_to_peers)

    def test_coordinator_accepts_it_in_place_of_the_stub(self):
        agent = build_post_gen_agent(scripted())
        coordinator = build_coordinator({"post_gen": agent}, model=scripted())
        wrapped = [t for t in coordinator.tools if isinstance(t, AgentTool) and t.agent.name == "post_gen"]
        self.assertEqual(len(wrapped), 1)
        self.assertIs(wrapped[0].agent, agent)


class PostGenTurnTests(TestCase):
    """The agent run for real inside the coordinator, with fake models for both."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password="pw-12345678", name="Ada")
        cls.issue = make_sell(cls.user)

    def run_turn(self, events, coordinator_model, post_gen_model):
        agent = build_post_gen_agent(post_gen_model)
        return run_turn(
            str(self.user.id), events, model=coordinator_model, specialists={"post_gen": agent}
        )

    def test_draft_then_publish_across_two_turns(self):
        # Turn 1: the owner asks for a post. The specialist reads the issue and saves a draft.
        first = self.run_turn(
            [user_message("Make a sale post for my Civic")],
            scripted(call("post_gen", request=f"Draft a sell post for issue {self.issue.id}."), say("Here is your draft.")),
            scripted(
                call("get_issue_context", issue_type="sell", issue_id=str(self.issue.id)),
                call(
                    "save_post_draft",
                    issue_type="sell",
                    issue_id=str(self.issue.id),
                    title="Selling my 2018 Honda Civic",
                    content="Time to say goodbye to my Civic",
                ),
                say("Drafted."),
            ),
        )
        draft = Post.objects.get()
        self.assertEqual(draft.status, "draft")
        self.assertEqual(
            [(e["author"], e["name"]) for e in first if e["kind"] == "tool_call"],
            [("coordinator", "post_gen"), ("post_gen", "get_issue_context"), ("post_gen", "save_post_draft")],
        )

        # Turn 2: the owner says yes. The draft id is rebuilt from the history, so publishing is allowed.
        history = [user_message("Make a sale post for my Civic")] + first + [user_message("Looks good, publish it", "u-2")]
        second = self.run_turn(
            history,
            scripted(call("post_gen", request=f"The owner approved post {draft.id}. Publish it."), say("It's live.")),
            scripted(call("approve_and_publish_post", post_id=str(draft.id)), say("Published.")),
        )
        draft.refresh_from_db()
        self.assertEqual(draft.status, "published")
        publish = next(e for e in second if e["kind"] == "tool_response" and e["name"] == "approve_and_publish_post")
        self.assertEqual(publish["author"], "post_gen")
        self.assertEqual(publish["response"]["data"]["status"], "published")

    def test_publishing_is_refused_when_the_draft_was_never_shown(self):
        draft = Post.objects.create(
            issue_id=self.issue.id, issue_type="sell", title="t", content="c", post_data={}
        )
        new = self.run_turn(
            [user_message("Publish my post")],
            scripted(call("post_gen", request=f"Publish post {draft.id}."), say("I couldn't publish it.")),
            scripted(call("approve_and_publish_post", post_id=str(draft.id)), say("Refused.")),
        )
        draft.refresh_from_db()
        self.assertEqual(draft.status, "draft")
        refusal = next(e for e in new if e["kind"] == "tool_response" and e["name"] == "approve_and_publish_post")
        self.assertEqual(refusal["response"]["status"], "error")


class DefaultWiringTests(TestCase):
    """run_turn uses the real post_gen agent unless a test replaces it."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password="pw-12345678", name="Ada")
        cls.issue = make_sell(cls.user)

    def test_post_gen_is_the_real_agent_by_default(self):
        # One fake model plays the coordinator and the default post_gen agent in turn.
        model = scripted(
            call("post_gen", request=f"Show the context for sell issue {self.issue.id}."),
            call("get_issue_context", issue_type="sell", issue_id=str(self.issue.id)),
            say("Context read."),
            say("Done."),
        )
        new = run_turn(str(self.user.id), [user_message("Make a post")], model=model)

        self.assertIn(("post_gen", "get_issue_context"), [(e["author"], e["name"]) for e in new if e["kind"] == "tool_call"])
        reply = next(e for e in new if e["kind"] == "tool_response" and e["name"] == "post_gen")
        self.assertNotEqual(reply["response"]["provenance"], "stub")

    def test_a_specialist_passed_in_replaces_the_default(self):
        replacement = build_post_gen_agent(scripted(say("Replaced.")))
        model = scripted(call("post_gen", request="Anything."), say("Done."))
        new = run_turn(str(self.user.id), [user_message("Make a post")], model=model, specialists={"post_gen": replacement})

        reply = next(e for e in new if e["kind"] == "tool_response" and e["name"] == "post_gen")
        self.assertEqual(reply["response"]["data"], {"text": "Replaced."})
