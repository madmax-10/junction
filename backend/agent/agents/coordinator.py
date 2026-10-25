"""Agent 1: the coordinator, the only agent that talks to the user."""

from google.adk.agents import LlmAgent
from google.adk.tools import AgentTool

from agent.agents.stubs import SPECIALIST_DESCRIPTIONS, make_stub
from agent.config import AGENT_MODEL
from agent.prompts.coordinator import COORDINATOR_INSTRUCTION
from agent.tools.adapters import as_async_tool
from agent.tools.coordinator_tools import (
    get_user_context,
    get_vehicle_details,
    register_used_car,
)

# The five specialists the coordinator can call. These names must match the
# names used in the coordinator prompt.
SPECIALIST_NAMES = tuple(SPECIALIST_DESCRIPTIONS)


def build_coordinator(specialists=None, model=None):
    """Build Agent 1.

    specialists: optional {name: agent} of real specialists. Any name left out
        gets a stub that answers "no_results", so the coordinator always has
        all five. Replace a stub by passing the real agent here.
    model: optional model override (used by tests to avoid a real model call).
    """
    specialists = dict(specialists or {})

    # Catch typos early: only the five known names are allowed, and each agent
    # must be named exactly as its key, because that name is the tool name.
    unknown = set(specialists) - set(SPECIALIST_NAMES)
    if unknown:
        raise ValueError(f"Unknown specialists: {', '.join(sorted(unknown))}.")
    for name, agent in specialists.items():
        if agent.name != name:
            raise ValueError(f"Specialist '{name}' must be named '{name}', not '{agent.name}'.")

    # Wrap each specialist as a tool (AgentTool), not a hand-off. The result
    # comes back to the coordinator, so the user only ever hears one voice.
    specialist_tools = [
        AgentTool(agent=specialists.get(name) or make_stub(name))
        for name in SPECIALIST_NAMES
    ]

    return LlmAgent(
        name="coordinator",
        model=model or AGENT_MODEL,
        description="Talks to the user and delegates to the specialist agents.",
        instruction=COORDINATOR_INSTRUCTION,
        # Its own tools (look up the user's cars/issues, register a car),
        # then the five specialists. The three database tools are wrapped so
        # they run off ADK's event loop, where Django allows database access.
        tools=[
            as_async_tool(get_user_context),
            as_async_tool(get_vehicle_details),
            as_async_tool(register_used_car),
            *specialist_tools,
        ],
    )
