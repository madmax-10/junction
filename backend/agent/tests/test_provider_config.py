"""Provider switching is offline and preserves agent JSON contracts."""

from unittest.mock import patch

from django.test import SimpleTestCase

from agent.config import AGENT_MODEL, get_agent_model, valuation_provider_config
from agent.runner import default_specialists
from agent.schemas import REPLY_SCHEMAS
from agent.services.ai_valuation_service import get_evidence_weights
from agent.tests.fakes import scripted


class ProviderConfigTests(SimpleTestCase):
    @patch.dict("os.environ", {"AGENT_MODEL_FACTORY": ""})
    def test_default_is_gemini_and_explicit_model_wins(self):
        self.assertEqual(get_agent_model(), AGENT_MODEL)
        model = scripted()
        self.assertIs(get_agent_model(model), model)

    @patch.dict("os.environ", {"AGENT_MODEL_FACTORY": "adapter.factory"})
    def test_one_factory_switches_all_specialists_and_retains_schemas(self):
        model = scripted()
        with patch("agent.config.load_adapter", return_value=lambda **_: model):
            agents = default_specialists()
        for name, agent in agents.items():
            self.assertIs(agent.model, model)
            self.assertIs(agent.output_schema, REPLY_SCHEMAS[name])

    @patch.dict("os.environ", {"VALUATION_WEIGHT_ADAPTER": "adapter.weights",
                              "VALUATION_PROVIDER_NAME": "muse", "VALUATION_MODEL": "configured-model"})
    def test_custom_weight_adapter_keeps_validation_and_provider_identity(self):
        comparables = [{"post_id": str(i)} for i in range(3)]
        rows = [{"post_id": str(i), "weight": "1", "reason": "Fixture"} for i in range(3)]
        with patch("agent.services.ai_valuation_service.load_adapter",
                   return_value=lambda *_: {"weights": rows}):
            evidence = get_evidence_weights({}, comparables)
        self.assertEqual(len(evidence.weights), 3)
        self.assertEqual(valuation_provider_config(), ("muse", "configured-model", "adapter.weights"))
