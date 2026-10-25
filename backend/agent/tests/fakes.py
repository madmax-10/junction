"""Test helpers: a scripted fake model and small reply builders (no network)."""

from google.adk.models import BaseLlm, LlmResponse
from google.genai import types


class ScriptedModel(BaseLlm):
    """A fake model that replays prepared replies instead of calling an API."""

    script: list = []
    calls: list = []

    async def generate_content_async(self, llm_request, stream=False):
        # Remember what the model was asked, then hand back the next prepared reply.
        self.calls.append(llm_request)
        yield self.script[len(self.calls) - 1]


def scripted(*replies):
    return ScriptedModel(model="fake", script=list(replies), calls=[])


def call(name, **args):
    """A model reply that asks to run one tool."""
    part = types.Part(function_call=types.FunctionCall(name=name, args=args))
    return LlmResponse(content=types.Content(role="model", parts=[part]))


def say(text):
    """A model reply that is plain text for the user."""
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=text)]))
