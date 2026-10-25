"""Smoke test: one LlmAgent answers one message through ADK.

Run from backend/:  ../.venv/bin/python -m agent.hello_world
"""

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from google.adk.agents import LlmAgent  # noqa: E402
from google.adk.runners import InMemoryRunner  # noqa: E402
from google.genai import types  # noqa: E402

from agent.config import AGENT_MODEL  # noqa: E402


async def main():
    if not os.environ.get("GOOGLE_API_KEY"):
        sys.exit("GOOGLE_API_KEY is not set. Copy backend/.env.example to backend/.env and add a key.")

    agent = LlmAgent(
        name="hello",
        model=AGENT_MODEL,
        instruction="Reply in one short sentence.",
    )
    runner = InMemoryRunner(agent=agent, app_name="hello_world")
    session = await runner.session_service.create_session(app_name="hello_world", user_id="smoke-test")
    message = types.Content(role="user", parts=[types.Part(text="Say hello to Car Owner Hub.")])

    async for event in runner.run_async(user_id="smoke-test", session_id=session.id, new_message=message):
        if event.is_final_response() and event.content and event.content.parts:
            print(f"[{AGENT_MODEL}] {event.content.parts[0].text}")


if __name__ == "__main__":
    asyncio.run(main())
