"""Agent settings read from the environment (see backend/.env.example)."""

import os
from importlib import import_module

AGENT_MODEL = os.environ.get("AGENT_MODEL", "gemini-3.8-flash")


def load_adapter(path):
    """Load a server-configured callable; never accept adapter paths from chat."""
    module, separator, name = path.rpartition(".")
    if not separator:
        raise ValueError("Adapter must be a dotted Python callable path.")
    adapter = getattr(import_module(module), name)
    if not callable(adapter):
        raise ValueError("Configured adapter must be callable.")
    return adapter


def get_agent_model(model=None):
    """Preserve explicit overrides, otherwise use the configured ADK model factory.

    A factory receives model_name and returns an ADK BaseLlm (with tool support).
    An empty factory retains ADK's native Gemini model-name integration.
    """
    if model is not None:
        return model
    factory = os.environ.get("AGENT_MODEL_FACTORY", "").strip()
    return load_adapter(factory)(model_name=AGENT_MODEL) if factory else AGENT_MODEL


def valuation_provider_config():
    """Provider identity and adapter are configured together for accurate audit data."""
    path = os.environ.get("VALUATION_WEIGHT_ADAPTER", "").strip()
    if not path:
        return "gemini", AGENT_MODEL, None
    provider = os.environ.get("VALUATION_PROVIDER_NAME", "custom").strip() or "custom"
    model = os.environ.get("VALUATION_MODEL", "").strip() or None
    return provider, model, path
