"""Agent 5 tools against the real models. Run with: python manage.py test agent"""

import inspect
import json
import shutil
import tempfile
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

from django.test import TestCase, override_settings
from google.adk.tools import FunctionTool

from accounts.models import User
from agent.state import build_state
from agent.tools import post_tools as tools
from issues.models import BuyIssue, RepairIssue, SellIssue
from issues.photos import photo_directory
from posts.models import Post
from vehicles.models import UsedCar

TOOLS = (
    tools.get_issue_context,
    tools.save_post_draft,
    tools.update_post_draft,
    tools.select_post_images,
    tools.approve_and_publish_post,
)


def context_for(user, **state):
    return SimpleNamespace(state={"user_id": str(user.id), **state})


def make_user(email):
    return User.objects.create_user(email=email, password="pw-12345678", name=email.split("@")[0])


def make_car(owner):
    return UsedCar.objects.create(owner=owner, make="Honda", model="Civic", year=2018, mileage=62000)


def make_sell(user):
    return SellIssue.objects.create(
        user=user,
        used_car=make_car(user),
        description="Selling my Civic",
        asking_price=Decimal("14500.00"),
        condition_details={"mechanical": "New battery"},
        location="Austin, TX",
        contact_info={"email": "private@example.com"},
    )


def make_buy(user):
    return BuyIssue.objects.create(
        user=user,
        description="Want a Camry",
        min_budget=Decimal("12000"),
        max_budget=Decimal("16000"),
        preferences={"preferred_makes": ["Toyota"]},
    )


def make_repair(user, resolved=True):
    return RepairIssue.objects.create(
        user=user,
        used_car=make_car(user),
        description="Won't start",
        symptoms={"confirmed": ["clicking sound"]},
        ai_analysis={"hypothesis": "alternator"},
        resolution_details={
            "method": "mechanic",
            "mechanic_name": "Lone Star Auto Repair",
            "location": "Austin, TX",
            "work_performed": "Replaced the battery",
            "cost": 180.5,
        }
        if resolved
        else None,
    )


class ToolSignatureTests(TestCase):
    def test_no_tool_accepts_a_user_identity_argument(self):
        forbidden = {"user_id", "owner_id", "buyer_id", "user", "owner"}
        for tool in TOOLS:
            with self.subTest(tool=tool.__name__):
                self.assertFalse(forbidden & set(inspect.signature(tool).parameters))

    def test_adk_can_build_a_declaration_without_tool_context(self):
        for tool in TOOLS:
            with self.subTest(tool=tool.__name__):
                declaration = FunctionTool(tool)._get_declaration()
                self.assertEqual(declaration.name, tool.__name__)
                schema = json.dumps(declaration.model_dump(mode="json", exclude_none=True))
                self.assertNotIn("tool_context", schema)
                self.assertNotIn("user_id", schema)


class AuthenticationTests(TestCase):
    def test_missing_unknown_or_inactive_user_is_rejected(self):
        gone = make_user("gone@example.com")
        gone.is_active = False
        gone.save()
        states = ({}, {"user_id": None}, {"user_id": "nope"}, {"user_id": str(uuid.uuid4())}, {"user_id": str(gone.id)})
        some_id = str(uuid.uuid4())
        for state in states:
            context = SimpleNamespace(state=state)
            with self.subTest(state=state):
                for result in (
                    tools.get_issue_context("sell", some_id, context),
                    tools.save_post_draft("sell", some_id, "t", "c", context),
                    tools.update_post_draft(some_id, context),
                    tools.select_post_images(some_id, [], context),
                    tools.approve_and_publish_post(some_id, context),
                ):
                    self.assertEqual(result["status"], "error")
                    self.assertEqual(result["error"], "Not authenticated.")
        self.assertEqual(Post.objects.count(), 0)


class GetIssueContextTests(TestCase):
    def setUp(self):
        self.user = make_user("owner@example.com")
        self.context = context_for(self.user)

    def test_sell_returns_template_facts_but_not_contact(self):
        issue = make_sell(self.user)
        result = tools.get_issue_context("sell", str(issue.id), self.context)
        json.dumps(result)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["car"]["model"], "Civic")
        self.assertEqual(result["data"]["asking_price"], "14500.00")
        self.assertEqual(result["data"]["location"], "Austin, TX")
        self.assertNotIn("private@example.com", json.dumps(result))
        self.assertEqual(result["ids"]["issue"], {"type": "sell", "id": str(issue.id)})
        self.assertEqual(result["ids"]["used_car_id"], str(issue.used_car_id))

    def test_buy_returns_budget_and_preferences(self):
        issue = make_buy(self.user)
        result = tools.get_issue_context("buy", str(issue.id), self.context)
        self.assertEqual(result["data"]["max_budget"], "16000.00")
        self.assertEqual(result["data"]["preferences"], {"preferred_makes": ["Toyota"]})
        self.assertNotIn("used_car_id", result["ids"])

    def test_repair_returns_resolution_but_never_ai_analysis(self):
        issue = make_repair(self.user)
        result = tools.get_issue_context("repair", str(issue.id), self.context)
        json.dumps(result)
        self.assertEqual(result["data"]["resolution_details"]["mechanic_name"], "Lone Star Auto Repair")
        self.assertEqual(result["data"]["resolution_details"]["cost"], "180.5")
        self.assertNotIn("ai_analysis", result["data"])
        self.assertNotIn("alternator", json.dumps(result))

    def test_other_users_missing_and_malformed_issues_look_the_same(self):
        theirs = make_sell(make_user("other@example.com"))
        for issue_type, issue_id in (
            ("sell", str(theirs.id)),
            ("sell", str(uuid.uuid4())),
            ("sell", "not-a-uuid"),
            ("discussion", str(theirs.id)),
        ):
            with self.subTest(issue_type=issue_type, issue_id=issue_id):
                result = tools.get_issue_context(issue_type, issue_id, self.context)
                self.assertEqual(result["status"], "error")
                self.assertEqual(result["error"], "Issue not found.")

    def test_lists_photo_filenames_and_existing_posts(self):
        issue = make_sell(self.user)
        with temp_media():
            add_photo(issue, 1)
            Post.objects.create(
                issue_id=issue.id, issue_type="sell", title="Mine", content="c", post_data={}
            )
            result = tools.get_issue_context("sell", str(issue.id), self.context)
        self.assertEqual(result["data"]["photo_filenames"], [f"{issue.id}_1.png"])
        self.assertEqual(result["data"]["existing_posts"][0]["status"], "draft")


def temp_media():
    """Point MEDIA_ROOT at a throwaway folder for the duration of a `with`."""
    directory = tempfile.mkdtemp()
    manager = override_settings(MEDIA_ROOT=directory)

    class _Media:
        def __enter__(self):
            manager.enable()

        def __exit__(self, *exc):
            manager.disable()
            shutil.rmtree(directory, ignore_errors=True)

    return _Media()


def add_photo(issue, index):
    folder = photo_directory(issue.issue_type, issue.id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{issue.id}_{index}.png").write_bytes(b"png")


class SavePostDraftTests(TestCase):
    def setUp(self):
        self.user = make_user("owner@example.com")
        self.context = context_for(self.user)

    def test_sell_draft_is_private_and_returns_post_id(self):
        issue = make_sell(self.user)
        result = tools.save_post_draft(
            "sell",
            str(issue.id),
            "Selling my 2018 Honda Civic",
            "Time to say goodbye to my Civic",
            self.context,
            {"contact": {"email": "seller@example.com"}},
        )
        json.dumps(result)
        self.assertEqual(result["status"], "ok")
        post = Post.objects.get(pk=result["ids"]["post_id"])
        self.assertEqual(post.status, "draft")
        self.assertIsNone(post.approved_at)
        self.assertEqual(result["data"]["title"], "Selling my 2018 Honda Civic")
        self.assertEqual(post.post_data["contact"], {"email": "seller@example.com"})
        self.assertEqual(post.post_data["asking_price"], 14500)
        self.assertNotIn("private@example.com", json.dumps(post.post_data))

    def test_buy_draft(self):
        issue = make_buy(self.user)
        result = tools.save_post_draft("buy", str(issue.id), "Looking for a Camry", "On the hunt", self.context)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(Post.objects.get().post_data["preferred_makes"], ["Toyota"])

    def test_repair_draft_uses_resolution_and_is_owner_reported(self):
        issue = make_repair(self.user)
        result = tools.save_post_draft("repair", str(issue.id), "Dead battery", "My Civic wouldn't start", self.context)
        json.dumps(result)
        data = Post.objects.get().post_data
        self.assertTrue(data["owner_reported"])
        self.assertEqual(data["mechanic_name"], "Lone Star Auto Repair")
        self.assertEqual(data["location"], "Austin, TX")
        self.assertEqual(data["work_performed"], "Replaced the battery")
        self.assertNotIn("alternator", json.dumps(data))
        self.assertEqual(result["data"]["post_data"]["cost"], "180.5")

    def test_repair_without_outcome_is_refused(self):
        issue = make_repair(self.user, resolved=False)
        result = tools.save_post_draft("repair", str(issue.id), "t", "c", self.context)
        self.assertEqual(result["status"], "error")
        self.assertIn("repair outcome", result["error"])
        self.assertEqual(Post.objects.count(), 0)

    def test_unknown_post_data_keys_are_rejected(self):
        issue = make_sell(self.user)
        result = tools.save_post_draft("sell", str(issue.id), "t", "c", self.context, {"vin": "123"})
        self.assertEqual(result["status"], "error")
        self.assertIn("Unknown fields: vin", result["error"])
        self.assertEqual(Post.objects.count(), 0)

    def test_other_users_issue_is_refused(self):
        theirs = make_sell(make_user("other@example.com"))
        result = tools.save_post_draft("sell", str(theirs.id), "t", "c", self.context)
        self.assertEqual(result["error"], "Issue not found.")
        self.assertEqual(Post.objects.count(), 0)

    def test_second_draft_for_the_same_issue_points_to_the_first(self):
        issue = make_sell(self.user)
        first = tools.save_post_draft("sell", str(issue.id), "t", "c", self.context)
        second = tools.save_post_draft("sell", str(issue.id), "t", "c", self.context)
        self.assertEqual(second["status"], "error")
        self.assertIn(first["ids"]["post_id"], second["error"])
        self.assertEqual(Post.objects.count(), 1)

    def test_state_restores_the_draft_id_from_the_response(self):
        issue = make_sell(self.user)
        result = tools.save_post_draft("sell", str(issue.id), "t", "c", self.context)
        events = [
            {"id": "s-1", "kind": "tool_response", "author": "post_gen", "name": "save_post_draft", "call_id": "c1", "response": result}
        ]
        state = build_state(self.user.id, events)
        self.assertEqual(state["draft_post_id"], result["ids"]["post_id"])


class UpdatePostDraftTests(TestCase):
    def setUp(self):
        self.user = make_user("owner@example.com")
        self.context = context_for(self.user)
        self.issue = make_sell(self.user)
        saved = tools.save_post_draft(
            "sell", str(self.issue.id), "Old title", "Old text", self.context, {"location": "Austin, TX"}
        )
        self.post_id = saved["ids"]["post_id"]

    def test_edits_title_and_content(self):
        result = tools.update_post_draft(self.post_id, self.context, title="New title", content="New text")
        self.assertEqual(result["data"]["title"], "New title")
        post = Post.objects.get(pk=self.post_id)
        self.assertEqual((post.title, post.content), ("New title", "New text"))

    def test_post_data_is_merged_and_null_removes_a_field(self):
        tools.update_post_draft(self.post_id, self.context, post_data={"contact": {"phone": "512-555-0100"}})
        post = Post.objects.get(pk=self.post_id)
        self.assertEqual(post.post_data["contact"], {"phone": "512-555-0100"})
        self.assertEqual(post.post_data["make"], "Honda")
        tools.update_post_draft(self.post_id, self.context, post_data={"location": None})
        self.assertNotIn("location", Post.objects.get(pk=self.post_id).post_data)

    def test_no_changes_just_shows_the_draft(self):
        before = Post.objects.get(pk=self.post_id).updated_at
        result = tools.update_post_draft(self.post_id, self.context)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["content"], "Old text")
        self.assertEqual(result["ids"]["post_id"], self.post_id)
        self.assertEqual(Post.objects.get(pk=self.post_id).updated_at, before)

    def test_invalid_post_data_leaves_the_draft_unchanged(self):
        result = tools.update_post_draft(self.post_id, self.context, post_data={"vin": "1"})
        self.assertEqual(result["status"], "error")
        self.assertNotIn("vin", Post.objects.get(pk=self.post_id).post_data)

    def test_other_users_and_published_posts_are_refused(self):
        stranger = context_for(make_user("other@example.com"))
        self.assertEqual(tools.update_post_draft(self.post_id, stranger, title="x")["error"], "Post not found.")
        tools.approve_and_publish_post(self.post_id, context_for(self.user, draft_post_id=self.post_id))
        result = tools.update_post_draft(self.post_id, self.context, title="x")
        self.assertEqual(result["error"], "Only drafts can be edited.")

    def test_malformed_post_id(self):
        self.assertEqual(tools.update_post_draft("nope", self.context)["error"], "Post not found.")


class SelectPostImagesTests(TestCase):
    def setUp(self):
        self.user = make_user("owner@example.com")
        self.context = context_for(self.user)
        self.issue = make_sell(self.user)
        saved = tools.save_post_draft(
            "sell", str(self.issue.id), "t", "c", self.context, {"contact": {"email": "a@example.com"}}
        )
        self.post_id = saved["ids"]["post_id"]

    def test_selected_photos_are_stored_and_other_fields_kept(self):
        with temp_media():
            add_photo(self.issue, 1)
            add_photo(self.issue, 2)
            result = tools.select_post_images(
                self.post_id, [f"{self.issue.id}_2.png", f"{self.issue.id}_1.png"], self.context
            )
        self.assertEqual(result["status"], "ok")
        data = Post.objects.get(pk=self.post_id).post_data
        self.assertEqual(
            data["photos"],
            [f"issues/sell/{self.issue.id}/{self.issue.id}_2.png", f"issues/sell/{self.issue.id}/{self.issue.id}_1.png"],
        )
        self.assertEqual(data["contact"], {"email": "a@example.com"})

    def test_empty_list_clears_the_selection(self):
        with temp_media():
            add_photo(self.issue, 1)
            tools.select_post_images(self.post_id, [f"{self.issue.id}_1.png"], self.context)
            tools.select_post_images(self.post_id, [], self.context)
        self.assertNotIn("photos", Post.objects.get(pk=self.post_id).post_data)

    def test_missing_foreign_and_traversal_filenames_are_rejected(self):
        other = make_sell(self.user)
        with temp_media():
            add_photo(other, 1)
            for name in (f"{self.issue.id}_9.png", f"{other.id}_1.png", "../x.png", "a/b.png"):
                with self.subTest(name=name):
                    result = tools.select_post_images(self.post_id, [name], self.context)
                    self.assertEqual(result["status"], "error")
        self.assertNotIn("photos", Post.objects.get(pk=self.post_id).post_data)

    def test_other_users_post_is_refused(self):
        stranger = context_for(make_user("other@example.com"))
        self.assertEqual(tools.select_post_images(self.post_id, [], stranger)["error"], "Post not found.")


class ApproveAndPublishTests(TestCase):
    def setUp(self):
        self.user = make_user("owner@example.com")
        self.issue = make_repair(self.user)
        saved = tools.save_post_draft("repair", str(self.issue.id), "t", "c", context_for(self.user))
        self.post_id = saved["ids"]["post_id"]

    def test_publishes_the_draft_in_state(self):
        result = tools.approve_and_publish_post(self.post_id, context_for(self.user, draft_post_id=self.post_id))
        json.dumps(result)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["status"], "published")
        post = Post.objects.get(pk=self.post_id)
        self.assertEqual(post.status, "published")
        self.assertIsNotNone(post.approved_at)

    def test_refuses_without_the_matching_draft_in_state(self):
        for state in ({}, {"draft_post_id": str(uuid.uuid4())}):
            with self.subTest(state=state):
                result = tools.approve_and_publish_post(self.post_id, context_for(self.user, **state))
                self.assertEqual(result["status"], "error")
                self.assertIn("just showed", result["error"])
                self.assertEqual(Post.objects.get(pk=self.post_id).status, "draft")

    def test_retry_after_publishing_is_a_no_op(self):
        first = tools.approve_and_publish_post(self.post_id, context_for(self.user, draft_post_id=self.post_id))
        approved_at = Post.objects.get(pk=self.post_id).approved_at
        again = tools.approve_and_publish_post(self.post_id, context_for(self.user))
        self.assertEqual(again["status"], "ok")
        self.assertEqual(again["data"], first["data"])
        self.assertEqual(Post.objects.get(pk=self.post_id).approved_at, approved_at)

    def test_other_users_post_is_refused(self):
        stranger = context_for(make_user("other@example.com"), draft_post_id=self.post_id)
        result = tools.approve_and_publish_post(self.post_id, stranger)
        self.assertEqual(result["error"], "Post not found.")
        self.assertEqual(Post.objects.get(pk=self.post_id).status, "draft")

    def test_archived_post_cannot_be_published(self):
        Post.objects.filter(pk=self.post_id).update(status="archived")
        result = tools.approve_and_publish_post(self.post_id, context_for(self.user, draft_post_id=self.post_id))
        self.assertEqual(result["status"], "error")
        self.assertEqual(Post.objects.get(pk=self.post_id).status, "archived")

    def test_publish_response_clears_the_draft_in_state(self):
        context = context_for(self.user, draft_post_id=self.post_id)
        saved = {"id": "s-1", "kind": "tool_response", "author": "post_gen", "name": "save_post_draft", "call_id": "c1",
                 "response": tools.update_post_draft(self.post_id, context)}
        published = {"id": "s-2", "kind": "tool_response", "author": "post_gen", "name": "approve_and_publish_post", "call_id": "c2",
                     "response": tools.approve_and_publish_post(self.post_id, context)}
        state = build_state(self.user.id, [saved, published])
        self.assertNotIn("draft_post_id", state)


class EveryPostTypeTests(TestCase):
    """The same rules hold for sell, buy and repair."""

    def setUp(self):
        self.user = make_user("owner@example.com")
        self.stranger = make_user("other@example.com")
        self.context = context_for(self.user)
        self.makers = {"sell": make_sell, "buy": make_buy, "repair": make_repair}

    def test_another_users_issue_is_refused(self):
        for issue_type, make in self.makers.items():
            theirs = make(self.stranger)
            with self.subTest(issue_type=issue_type):
                result = tools.save_post_draft(issue_type, str(theirs.id), "t", "c", self.context)
                self.assertEqual(result["error"], "Issue not found.")
        self.assertEqual(Post.objects.count(), 0)

    def test_unknown_post_data_keys_are_rejected(self):
        for issue_type, make in self.makers.items():
            issue = make(self.user)
            with self.subTest(issue_type=issue_type):
                result = tools.save_post_draft(
                    issue_type, str(issue.id), "t", "c", self.context, {"ai_analysis": "x"}
                )
                self.assertEqual(result["status"], "error")
                self.assertIn("Unknown fields: ai_analysis", result["error"])
        self.assertEqual(Post.objects.count(), 0)

    def test_published_posts_cannot_be_edited_or_given_photos(self):
        for issue_type, make in self.makers.items():
            issue = make(self.user)
            saved = tools.save_post_draft(issue_type, str(issue.id), "t", "c", self.context)
            post_id = saved["ids"]["post_id"]
            tools.approve_and_publish_post(post_id, context_for(self.user, draft_post_id=post_id))
            with self.subTest(issue_type=issue_type):
                for result in (
                    tools.update_post_draft(post_id, self.context, title="new"),
                    tools.select_post_images(post_id, [], self.context),
                ):
                    self.assertEqual(result["error"], "Only drafts can be edited.")
                self.assertEqual(Post.objects.get(pk=post_id).title, "t")

    def test_a_repair_cannot_drop_or_disprove_owner_reported(self):
        issue = make_repair(self.user)
        result = tools.save_post_draft(
            "repair", str(issue.id), "t", "c", self.context, {"owner_reported": False}
        )
        self.assertEqual(result["status"], "error")
        saved = tools.save_post_draft("repair", str(issue.id), "t", "c", self.context)
        post_id = saved["ids"]["post_id"]
        tools.update_post_draft(post_id, self.context, post_data={"cost": 200})
        self.assertTrue(Post.objects.get(pk=post_id).post_data["owner_reported"])
        refused = tools.update_post_draft(post_id, self.context, post_data={"owner_reported": False})
        self.assertEqual(refused["status"], "error")
        self.assertTrue(Post.objects.get(pk=post_id).post_data["owner_reported"])
