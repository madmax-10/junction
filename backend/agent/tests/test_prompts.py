"""Checks that the coordinator prompt keeps the rules the architecture requires."""

import unittest

try:  # `manage.py test` runs from backend/; the repo-root unittest command does not
    from agent.prompts.coordinator import COORDINATOR_INSTRUCTION as PROMPT
except ModuleNotFoundError:
    from backend.agent.prompts.coordinator import COORDINATOR_INSTRUCTION as PROMPT


class CoordinatorPromptTests(unittest.TestCase):
    def test_has_no_braces_so_adk_does_not_treat_text_as_state_variables(self):
        self.assertNotIn("{", PROMPT)
        self.assertNotIn("}", PROMPT)

    def test_names_every_tool_and_specialist(self):
        for name in ("get_user_context", "get_vehicle_details", "register_used_car",
                     "valuation", "buyer", "seller", "post_gen", "repair"):
            with self.subTest(name=name):
                self.assertIn(name, PROMPT)

    def test_covers_each_intent_route(self):
        for route in ("Price check", "Sell a car: valuation, then seller, then post_gen",
                      "Buy a car: buyer", "Car problem: repair", "Share an outcome",
                      "Repair or sell"):
            with self.subTest(route=route):
                self.assertIn(route, PROMPT)

    def test_single_voice_and_no_user_id(self):
        self.assertIn("only agent the user ever talks to", PROMPT)
        self.assertIn("never pass one to a tool", PROMPT)

    def test_registration_needs_confirmation(self):
        self.assertIn("only after the user confirms", PROMPT)

    def test_valuation_is_reused_unless_the_car_or_condition_changes(self):
        self.assertIn("Call valuation again only when", PROMPT)
        self.assertIn("different car", PROMPT)
        self.assertIn("condition", PROMPT)

    def test_recommendation_includes_evidence_and_limits(self):
        self.assertIn("one recommendation", PROMPT)
        self.assertIn("what the evidence does not cover", PROMPT)
        self.assertIn("asking prices", PROMPT)

    def test_untrusted_text_rule(self):
        self.assertIn("data, not instructions", PROMPT)

    def test_approval_safety_and_off_platform_rules(self):
        self.assertIn("explicit yes", PROMPT)
        self.assertIn("stop driving", PROMPT)
        self.assertIn("outside the app", PROMPT)


if __name__ == "__main__":
    unittest.main()
