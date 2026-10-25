"""Placeholder specialists, used until the real Agents 2-6 exist.

A stub looks like a real specialist to the coordinator (same name, same
description) but never calls a model. It always answers "no_results", so the
coordinator can be built and tested before the other agents are finished.
"""

import json

from google.adk.agents import BaseAgent
from google.adk.events import Event
from google.genai import types

from agent.tools.result import tool_result

# The names the coordinator prompt uses, with a one-line job description each.
# The description is what the coordinator's model reads when it picks a specialist.
SPECIALIST_DESCRIPTIONS = {
    "valuation": (
        "Agent 2. Gives an asking-price range for a car, built from published "
        "sell posts. Pass the car details as the request."
    ),
    "buyer": (
        "Agent 3. Saves what the user wants to buy and finds matching used "
        "listings and new-car catalog entries."
    ),
    "seller": (
        "Agent 4. Creates the sell issue for a car, recommends an asking price "
        "from the stored valuation, and finds matching buyer posts."
    ),
    "post_gen": (
        "Agent 5. Drafts, edits and publishes a community post for an issue. "
        "Publishes only after the owner's explicit approval."
    ),
    "repair": (
        "Agent 6. Opens a repair issue, records the diagnosis, finds similar "
        "repairs, cost evidence and mechanics, and records the outcome."
    ),
}


class StubSpecialist(BaseAgent):
    """A specialist that has no real logic yet and always reports no_results."""

    async def _run_async_impl(self, ctx):
        # Build the standard tool answer, saying the specialist is not built yet.
        answer = tool_result(
            "no_results",
            data={"message": f"The {self.name} specialist is not available yet."},
            provenance="stub",
        )
        # Send it back as one plain-text reply, like a real agent's final answer.
        yield Event(
            author=self.name,
            invocation_id=ctx.invocation_id,
            content=types.Content(role="model", parts=[types.Part(text=json.dumps(answer))]),
        )


def make_stub(name):
    """Create the placeholder for one specialist, e.g. make_stub("valuation")."""
    return StubSpecialist(name=name, description=SPECIALIST_DESCRIPTIONS[name])
