"""Coordinator tools against the real models. Run with: python manage.py test agent"""

import inspect
import json
import uuid
from types import SimpleNamespace

from django.test import TestCase
from google.adk.tools import FunctionTool

from accounts.models import User
from agent.tools import coordinator_tools as tools
from issues.models import BuyIssue, RepairIssue, SellIssue
from posts.models import Post
from vehicles.models import UsedCar

TOOLS = (tools.get_vehicle_details, tools.get_user_context, tools.register_used_car)


def context_for(user):
    return SimpleNamespace(state={"user_id": str(user.id)})


def make_car(owner, **overrides):
    values = {"make": "Honda", "model": "Civic", "year": 2018, "mileage": 62000}
    values.update(overrides)
    return UsedCar.objects.create(owner=owner, **values)


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
    def test_missing_or_unknown_user_is_rejected(self):
        for state in ({}, {"user_id": None}, {"user_id": "not-a-uuid"}, {"user_id": str(uuid.uuid4())}):
            context = SimpleNamespace(state=state)
            with self.subTest(state=state):
                for result in (
                    tools.get_vehicle_details(str(uuid.uuid4()), context),
                    tools.get_user_context(context),
                    tools.register_used_car("Honda", "Civic", 2018, 1000, context),
                ):
                    self.assertEqual(result["status"], "error")
                    self.assertEqual(result["error"], "Not authenticated.")
        self.assertEqual(UsedCar.objects.count(), 0)

    def test_inactive_user_is_rejected(self):
        user = User.objects.create_user(email="gone@example.com", password="pw-12345678", name="Gone")
        user.is_active = False
        user.save()
        self.assertEqual(tools.get_user_context(context_for(user))["status"], "error")


class GetVehicleDetailsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password="pw-12345678", name="Ada")
        cls.other = User.objects.create_user(email="bea@example.com", password="pw-12345678", name="Bea")

    def test_returns_owned_car_with_envelope(self):
        car = make_car(self.user, trim="EX", condition="Good")
        result = tools.get_vehicle_details(str(car.id), context_for(self.user))
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["ids"], {"used_car_id": str(car.id)})
        self.assertEqual(result["data"]["make"], "Honda")
        self.assertEqual(result["data"]["trim"], "EX")
        self.assertEqual(result["data"]["mileage"], 62000)
        json.dumps(result)

    def test_another_users_car_is_not_returned(self):
        car = make_car(self.other)
        result = tools.get_vehicle_details(str(car.id), context_for(self.user))
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["error"], "Car not found.")
        self.assertIsNone(result["data"])
        self.assertNotIn("Honda", json.dumps(result))

    def test_missing_and_malformed_ids_look_the_same_as_foreign_cars(self):
        for bad in (str(uuid.uuid4()), "not-a-uuid", "", None):
            with self.subTest(bad=bad):
                result = tools.get_vehicle_details(bad, context_for(self.user))
                self.assertEqual(result["error"], "Car not found.")

    def test_history_cannot_override_identity(self):
        car = make_car(self.other)
        context = SimpleNamespace(state={"user_id": str(self.user.id), "owner_id": str(self.other.id)})
        self.assertEqual(tools.get_vehicle_details(str(car.id), context)["status"], "error")


class GetUserContextTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password="pw-12345678", name="Ada")
        cls.other = User.objects.create_user(email="bea@example.com", password="pw-12345678", name="Bea")

    def test_new_user_gets_empty_context(self):
        result = tools.get_user_context(context_for(self.user))
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"]["used_cars"], [])
        self.assertEqual(result["data"]["draft_posts"], [])
        self.assertEqual(result["ids"]["used_car_ids"], [])
        self.assertEqual(result["ids"]["issue_ids"], {"buy": [], "sell": [], "repair": []})

    def test_returns_only_the_callers_own_open_records(self):
        car = make_car(self.user)
        other_car = make_car(self.other, make="Toyota", model="Camry")
        buy = BuyIssue.objects.create(user=self.user, description="Want a truck")
        BuyIssue.objects.create(user=self.user, description="Old search", status="closed")
        sell = SellIssue.objects.create(user=self.user, used_car=car, description="Selling my Civic")
        repair = RepairIssue.objects.create(user=self.user, used_car=car, description="Won't start")
        SellIssue.objects.create(user=self.other, used_car=other_car, description="Their Camry")
        RepairIssue.objects.create(user=self.other, used_car=other_car, description="Their noise")
        draft = Post.objects.create(
            issue_id=sell.id, issue_type="sell", title="Mine", content="x", status=Post.Status.DRAFT
        )
        Post.objects.create(
            issue_id=sell.id, issue_type="sell", title="Published", content="x", status=Post.Status.PUBLISHED
        )
        other_sell = SellIssue.objects.get(user=self.other)
        Post.objects.create(
            issue_id=other_sell.id, issue_type="sell", title="Theirs", content="x", status=Post.Status.DRAFT
        )

        result = tools.get_user_context(context_for(self.user))

        self.assertEqual([c["id"] for c in result["data"]["used_cars"]], [str(car.id)])
        self.assertEqual(result["ids"]["used_car_ids"], [str(car.id)])
        self.assertEqual(result["ids"]["issue_ids"], {
            "buy": [str(buy.id)], "sell": [str(sell.id)], "repair": [str(repair.id)],
        })
        self.assertEqual(result["ids"]["draft_post_ids"], [str(draft.id)])
        self.assertEqual(result["data"]["open_issues"]["sell"][0]["used_car_id"], str(car.id))
        self.assertIsNone(result["data"]["open_issues"]["buy"][0]["used_car_id"])
        dumped = json.dumps(result)
        for secret in ("Camry", "Their", "Theirs", "Old search"):
            self.assertNotIn(secret, dumped)

    def test_private_contact_info_is_never_included(self):
        car = make_car(self.user)
        SellIssue.objects.create(
            user=self.user, used_car=car, description="Selling",
            contact_info={"phone": "555-0100"},
        )
        self.assertNotIn("555-0100", json.dumps(tools.get_user_context(context_for(self.user))))


class RegisterUsedCarTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(email="ada@example.com", password="pw-12345678", name="Ada")
        cls.other = User.objects.create_user(email="bea@example.com", password="pw-12345678", name="Bea")

    def test_creates_car_owned_by_session_user(self):
        result = tools.register_used_car(
            " Honda ", "Civic", 2018, 62000, context_for(self.user), trim="EX", condition="Runs well"
        )
        self.assertEqual(result["status"], "ok")
        car = UsedCar.objects.get()
        self.assertEqual(car.owner, self.user)
        self.assertEqual((car.make, car.model, car.year, car.mileage), ("Honda", "Civic", 2018, 62000))
        self.assertEqual((car.trim, car.condition), ("EX", "Runs well"))
        self.assertEqual(result["ids"], {"used_car_id": str(car.id)})
        self.assertEqual(result["data"]["id"], str(car.id))

    def test_owner_is_always_the_session_user(self):
        tools.register_used_car("Honda", "Civic", 2018, 1000, context_for(self.other))
        self.assertEqual(UsedCar.objects.get().owner, self.other)

    def test_optional_fields_default_to_blank(self):
        tools.register_used_car("Honda", "Civic", 2018, 1000, context_for(self.user))
        car = UsedCar.objects.get()
        self.assertEqual((car.trim, car.condition), ("", ""))

    def test_invalid_input_is_rejected_without_creating_a_car(self):
        cases = [
            ("", "Civic", 2018, 1000),
            ("Honda", "   ", 2018, 1000),
            ("Honda", "Civic", 1800, 1000),
            ("Honda", "Civic", 3000, 1000),
            ("Honda", "Civic", 2018, -5),
            ("Honda", "Civic", "abc", 1000),
        ]
        for args in cases:
            with self.subTest(args=args):
                result = tools.register_used_car(*args, context_for(self.user))
                self.assertEqual(result["status"], "error")
                self.assertTrue(result["error"])
        self.assertEqual(UsedCar.objects.count(), 0)

    def test_registered_car_is_visible_to_the_other_tools(self):
        context = context_for(self.user)
        car_id = tools.register_used_car("Honda", "Civic", 2018, 1000, context)["ids"]["used_car_id"]
        self.assertEqual(tools.get_vehicle_details(car_id, context)["status"], "ok")
        self.assertEqual(tools.get_user_context(context)["ids"]["used_car_ids"], [car_id])
