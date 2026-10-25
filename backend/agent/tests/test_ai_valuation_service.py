"""Offline provider boundary tests; all listing/price data here are test fixtures."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from agent.services.ai_valuation_service import (
    EvidenceWeights, ValuationProviderError, gemini_weights, get_evidence_weights,
)


class EvidenceWeightTests(SimpleTestCase):
    def setUp(self):
        self.subject = {"make": "Toyota", "model": "Camry", "year": 2020}
        self.comparables = [{"post_id": str(index), "asking_price": Decimal(price)}
                            for index, price in enumerate(("10000", "12000", "15000"))]
        self.rows = [{"post_id": str(index), "weight": weight, "reason": "Supplied fixture evidence"}
                     for index, weight in enumerate(("0.1", "0.2", "0.7"))]

    def test_valid_injected_provider_retains_decimal_weights_and_reasons(self):
        provider = MagicMock(return_value={"weights": self.rows})
        result = get_evidence_weights(self.subject, self.comparables, provider=provider)
        provider.assert_called_once_with(self.subject, self.comparables)
        self.assertIsInstance(result, EvidenceWeights)
        self.assertEqual({row.post_id: row.weight for row in result.weights},
                         {"0": Decimal("0.1"), "1": Decimal("0.2"), "2": Decimal("0.7")})
        self.assertEqual([row.reason for row in result.weights],
                         [row["reason"] for row in self.rows])

    def test_fabricated_duplicate_missing_ids_and_malformed_responses_are_rejected(self):
        for raw in (
            {"weights": [dict(row, post_id="fabricated") for row in self.rows]},
            {"weights": [self.rows[0], self.rows[0], self.rows[2]]},
            {"weights": self.rows[:2]},
            {"weights": [dict(row, reason=None) for row in self.rows]},
            {}, None, "not JSON", '{"weights": [',
        ):
            with self.subTest(raw=raw), self.assertRaises(ValuationProviderError):
                get_evidence_weights(self.subject, self.comparables, provider=lambda *_: raw)

    def test_provider_exception_is_wrapped(self):
        with self.assertRaises(ValuationProviderError):
            get_evidence_weights(self.subject, self.comparables,
                                 provider=MagicMock(side_effect=RuntimeError("offline failure")))

    def test_provider_cannot_inject_price_currency_or_invalid_weight(self):
        for change in ({"asking_price": "999999"}, {"currency": "USD"},
                       {"weight": True}, {"weight": "Infinity"}, {"weight": "1.01"},
                       {"reason": ""}):
            with self.subTest(change=change), self.assertRaises(ValuationProviderError):
                get_evidence_weights(self.subject, self.comparables,
                                     provider=lambda *_: {"weights": [dict(row, **change) for row in self.rows]})

    @patch.dict("os.environ", {"GOOGLE_API_KEY": ""})
    def test_missing_key_never_constructs_client(self):
        with patch("agent.services.ai_valuation_service.genai.Client") as client:
            with self.assertRaises(ValuationProviderError):
                get_evidence_weights(self.subject, self.comparables)
            client.assert_not_called()

    @patch.dict("os.environ", {"GOOGLE_API_KEY": "offline-test-key"})
    def test_gemini_request_uses_configured_model_and_pydantic_schema_without_network(self):
        with patch("agent.services.ai_valuation_service.genai.Client") as factory:
            client = factory.return_value.__enter__.return_value
            client.models.generate_content.return_value = SimpleNamespace(text='{"weights": []}')
            self.assertEqual(gemini_weights(self.subject, self.comparables), '{"weights": []}')
            request = client.models.generate_content.call_args.kwargs
            from agent.config import AGENT_MODEL
            self.assertEqual(request["model"], AGENT_MODEL)
            self.assertIs(request["config"].response_schema, EvidenceWeights)
            self.assertEqual(request["config"].response_mime_type, "application/json")
            self.assertIn('"asking_price": "10000"', request["contents"])
