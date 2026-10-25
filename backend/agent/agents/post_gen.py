"""Agent 5: the community post specialist, called by the coordinator."""

from google.adk.agents import LlmAgent

from agent.agents.stubs import SPECIALIST_DESCRIPTIONS
from agent.config import AGENT_MODEL
from agent.prompts.post_gen import POST_GEN_INSTRUCTION
from agent.tools.adapters import as_async_tool
from agent.tools.post_tools import (
    approve_and_publish_post,
    get_issue_context,
    save_post_draft,
    select_post_images,
    update_post_draft,
)


def build_post_gen_agent(model=None):
    """Build Agent 5. Pass the result to build_coordinator as {"post_gen": agent}.

    model: optional model override (used by tests to avoid a real model call).
    """
    return LlmAgent(
        name="post_gen",
        model=model or AGENT_MODEL,
        # Same text the coordinator's model reads when it picks a specialist.
        description=SPECIALIST_DESCRIPTIONS["post_gen"],
        instruction=POST_GEN_INSTRUCTION,
        # The tools are wrapped so they run off ADK's event loop, where Django
        # allows database access.
        tools=[
            as_async_tool(get_issue_context),
            as_async_tool(save_post_draft),
            as_async_tool(update_post_draft),
            as_async_tool(select_post_images),
            as_async_tool(approve_and_publish_post),
        ],
        # Results go back to the coordinator, which is the only voice the user hears.
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
    )
