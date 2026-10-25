"""Test helpers: a scripted fake model and small reply builders (no network)."""

from google.adk.models import BaseLlm, LlmResponse
from google.adk.models.base_llm import LlmCapabilities
from google.genai import types
from pydantic import BaseModel


def structured_response(request, response):
    """Make scripted prose obey the actual requested final-output schema.

    Tool calls are unchanged. Malformed-output tests use an explicit raw model.
    """
    schema = request.config.response_schema
    response_tool = request.tools_dict.get("set_model_response")
    if schema is None and response_tool is not None:
        schema = response_tool.output_schema
    if not isinstance(schema, type) or not issubclass(schema, BaseModel) or "message" not in schema.model_fields:
        return response
    if not response.content or not response.content.parts:
        return response
    if any(part.function_call for part in response.content.parts):
        return response
    text = "".join(part.text or "" for part in response.content.parts)
    if text.lstrip().startswith("{"):
        return response
    reply = schema(status="answer", message=text or "Sorry, I couldn't finish that. Please try again.")
    if response_tool is not None:
        return call("set_model_response", **reply.model_dump(mode="json"))
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=reply.model_dump_json())]))


class ScriptedModel(BaseLlm):
    """A fake model that replays prepared replies instead of calling an API."""

    script: list = []
    calls: list = []

    @property
    def capabilities(self):
        return LlmCapabilities(output_schema_and_tools=True)

    async def generate_content_async(self, llm_request, stream=False):
        # Remember what the model was asked, then hand back the next prepared reply.
        self.calls.append(llm_request)
        yield structured_response(llm_request, self.script[len(self.calls) - 1])


def scripted(*replies):
    return ScriptedModel(model="fake", script=list(replies), calls=[])


def call(name, **args):
    """A model reply that asks to run one tool."""
    part = types.Part(function_call=types.FunctionCall(name=name, args=args))
    return LlmResponse(content=types.Content(role="model", parts=[part]))


def say(text):
    """A model reply that is plain text for the user."""
    return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=text)]))
