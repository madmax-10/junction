"""Public contact fixtures go through the actual draft and approval services."""

import json
from unittest.mock import patch
from uuid import uuid4

from django.db import DatabaseError, connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.exceptions import NotFound, ValidationError

from accounts.models import User
from agent.services.post_contact_service import get_post_contact
from issues.models import SellIssue
from issues.services import create_buy_issue, create_repair_issue, create_sell_issue
from posts.models import Post
from posts.serializers import PostUpdateSerializer
from posts.services import approve_post, delete_post, generate_post, update_draft
from vehicles.models import UsedCar


class PostContactTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.seller = User.objects.create_user(email="PRIVATE-account@example.com", name="Seller")
        cls.other = User.objects.create_user(email="other-person@example.com", name="Other")
        cls.car = UsedCar.objects.create(
            owner=cls.seller, make="Toyota", model="Camry", year=2020,
            mileage=40000, condition="PRIVATE vehicle condition",
        )
        cls.issue = create_sell_issue(cls.seller, {
            "used_car": cls.car, "description": "PRIVATE issue description", "asking_price": 12000,
            "location": "PRIVATE home address",
            "contact_info": {"email": "PRIVATE-issue@example.com", "phone": "PRIVATE phone"},
        })

    def draft(self, contact=None, *, issue_type=Post.IssueType.SELL):
        issue = self.issue
        if issue_type == Post.IssueType.BUY:
            issue = create_buy_issue(self.seller, {"description": "Buyer request"})
        elif issue_type == Post.IssueType.REPAIR:
            issue = create_repair_issue(self.seller, {"used_car": self.car, "description": "Repair symptoms"})
        return generate_post(
            self.seller, issue_type, issue.id,
            post_data={"contact": contact} if contact is not None else None,
        )

    def publish(self, contact=None, *, issue_type=Post.IssueType.SELL):
        return approve_post(self.seller, self.draft(contact, issue_type=issue_type).id)

    def test_published_sell_contact_is_exactly_the_owner_approved_snapshot(self):
        contact = {"email": "public-seller@example.com", "phone": "+1 (512) 555-0100",
                   "link": "https://example.com/contact"}
        post = self.publish(contact)
        result = get_post_contact(post.id)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["data"], {"post_id": str(post.id), "contact": contact})
        self.assertEqual(result["data"]["contact"], post.post_data["contact"])

    def test_missing_public_contact_does_not_fall_back_to_private_issue(self):
        post = self.publish()
        self.assertNotIn("contact", post.post_data)
        result = get_post_contact(post.id)
        self.assertEqual(result["status"], "no_results")
        self.assertIsNone(result["data"])
        self.assertEqual(result["ids"], {})
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_draft_contact_is_not_public(self):
        draft = self.draft({"email": "public-seller@example.com"})
        self.assertEqual(get_post_contact(draft.id)["status"], "no_results")

    def test_approved_but_unpublished_status_is_not_public(self):
        draft = self.draft({"email": "public-seller@example.com"})
        # The model defines this state, while normal approve_post jumps straight
        # to Published. Simulate only an unpublished intermediate state.
        Post.objects.filter(pk=draft.id).update(status=Post.Status.APPROVED)
        self.assertEqual(get_post_contact(draft.id)["status"], "no_results")

    def test_archived_post_is_not_public(self):
        post = self.publish({"email": "public-seller@example.com"})
        delete_post(self.seller, post)
        self.assertEqual(get_post_contact(post.id)["status"], "no_results")

    def test_deleted_draft_and_missing_post_are_indistinguishable(self):
        draft = self.draft({"email": "public-seller@example.com"})
        deleted_id = draft.id
        delete_post(self.seller, draft)
        self.assertEqual(get_post_contact(deleted_id), get_post_contact(uuid4()))
        self.assertEqual(get_post_contact(deleted_id)["status"], "no_results")

    def test_invalid_post_identifiers_are_rejected_without_queries(self):
        for identifier in (None, True, False, 1, 1.5, "", "bad", [], {}, object()):
            with self.subTest(identifier=repr(identifier)):
                with self.assertNumQueries(0):
                    result = get_post_contact(identifier)
                self.assertEqual(result["status"], "error")
                self.assertIsNone(result["data"])
                self.assertEqual(result["ids"], {})

    def test_uuid_strings_and_uuid_objects_use_same_public_record(self):
        post = self.publish({"email": "public-seller@example.com"})
        self.assertEqual(get_post_contact(post.id), get_post_contact(str(post.id)))
        self.assertEqual(get_post_contact(post.id), get_post_contact(post.id.hex.upper()))

    def test_published_buy_and_repair_posts_are_not_sell_contacts(self):
        buy = self.publish({"email": "buyer-public@example.com"}, issue_type=Post.IssueType.BUY)
        repair = self.publish(issue_type=Post.IssueType.REPAIR)
        for post in (buy, repair):
            with self.subTest(issue_type=post.issue_type):
                self.assertEqual(get_post_contact(post.id)["status"], "no_results")

    def test_partial_approved_contact_is_supported(self):
        for contact in ({"email": "public-seller@example.com"}, {"phone": "512-555-0100"},
                        {"link": "http://example.com/contact"}):
            with self.subTest(contact=contact):
                post = self.publish(contact)
                self.assertEqual(get_post_contact(post.id)["data"]["contact"], contact)

    def test_public_values_are_normalized_only_by_the_existing_publication_schema(self):
        post = self.publish({"email": " public-seller@example.com ", "phone": " 512-555-0100 "})
        result = get_post_contact(post.id)
        self.assertEqual(result["data"]["contact"], post.post_data["contact"])
        self.assertEqual(result["data"]["contact"]["phone"], "512-555-0100")

    def test_normal_publication_rejects_malformed_contacts_and_unknown_fields(self):
        for contact in ([], "email@example.com", {"email": "bad"}, {"phone": True},
                        {"link": "javascript:alert(1)"}, {"home_address": "PRIVATE"},
                        {"email": "public@example.com", "user_id": str(self.seller.id)}):
            with self.subTest(contact=contact), self.assertRaises(ValidationError):
                self.draft(contact)
        self.assertFalse(Post.objects.filter(status=Post.Status.PUBLISHED).exists())

    def test_corrupt_contact_reads_fail_closed_using_real_contact_validation(self):
        post = self.publish({"email": "public-seller@example.com"})
        for contact in (None, {}, [], "bad", 123, {"email": "bad"}, {"phone": []},
                        {"phone": "x" * 51}, {"link": "javascript:bad"},
                        {"email": "public@example.com", "home_address": "PRIVATE"},
                        {"email": "public@example.com", "owner_id": str(self.seller.id)}):
            with self.subTest(contact=contact):
                # No invalid fixture is published by bypassing validation: mock
                # only a corrupted database read after a legitimate publication.
                with patch("agent.services.post_contact_service.Post.objects.filter") as lookup:
                    lookup.return_value.values.return_value.first.return_value = {
                        "id": post.id, "post_data__contact": contact,
                    }
                    result = get_post_contact(post.id)
                self.assertEqual(result["status"], "no_results")
                self.assertIsNone(result["data"])
                self.assertNotIn("PRIVATE", json.dumps(result))

    def test_final_owner_review_can_remove_phone_before_publishing(self):
        draft = self.draft({"email": "public@example.com", "phone": "512-555-0100"})
        payload = {**draft.post_data, "contact": {"email": "public@example.com"}}
        serializer = PostUpdateSerializer(instance=draft, data={"post_data": payload})
        self.assertTrue(serializer.is_valid())
        update_draft(self.seller, draft, serializer.validated_data)
        published = approve_post(self.seller, draft.id)
        self.assertEqual(get_post_contact(published.id)["data"]["contact"], {"email": "public@example.com"})

    def test_other_user_cannot_publish_draft_to_expose_contact(self):
        draft = self.draft({"email": "public@example.com"})
        with self.assertRaises(NotFound):
            approve_post(self.other, draft.id)
        self.assertEqual(get_post_contact(draft.id)["status"], "no_results")

    def test_no_private_account_phone_issue_or_used_car_information_is_exposed(self):
        post = self.publish({"email": "public-seller@example.com"})
        result = get_post_contact(post.id)
        output = json.dumps(result)
        self.assertNotIn("PRIVATE", output)
        self.assertNotIn(str(self.issue.id), output)
        self.assertNotIn(str(self.car.id), output)
        self.assertNotIn(str(self.seller.id), output)
        self.assertEqual(set(result["data"]), {"post_id", "contact"})

    def test_no_authentication_or_seller_ownership_query_is_needed_for_public_contact(self):
        post = self.publish({"email": "public-seller@example.com"})
        with CaptureQueriesContext(connection) as queries:
            result = get_post_contact(post.id)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(len(queries), 1)
        self.assertIn('"posts"', queries[0]["sql"])
        for table in ('"users"', '"sell_issues"', '"used_cars"'):
            self.assertNotIn(table, queries[0]["sql"])

    def test_result_envelope_is_json_safe_and_allowlisted(self):
        post = self.publish({"email": "public-seller@example.com"})
        result = get_post_contact(post.id)
        self.assertEqual(set(result), {"status", "data", "ids", "provenance", "error"})
        self.assertEqual(result["ids"], {"post_id": str(post.id)})
        self.assertEqual(result["provenance"], "published_sell_posts")
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertEqual(set(result["data"]["contact"]), {"email"})

    def test_lookup_is_read_only_and_does_not_call_external_network(self):
        post = self.publish({"email": "public-seller@example.com"})
        before = (list(Post.objects.values()), list(SellIssue.objects.values()), list(User.objects.values()))
        with patch("socket.socket.connect", side_effect=AssertionError("No external calls")) as network:
            with CaptureQueriesContext(connection) as queries:
                result = get_post_contact(post.id)
            network.assert_not_called()
        self.assertEqual(result["status"], "ok")
        self.assertTrue(all(query["sql"].lstrip().upper().startswith("SELECT") for query in queries))
        self.assertEqual((list(Post.objects.values()), list(SellIssue.objects.values()), list(User.objects.values())), before)

    def test_database_failure_is_generic_and_has_no_contact_payload(self):
        with patch("agent.services.post_contact_service.Post.objects.filter", side_effect=DatabaseError("PRIVATE SQL")):
            result = get_post_contact(uuid4())
        self.assertEqual(result["status"], "error")
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertIsNone(result["data"])
