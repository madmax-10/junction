"""Agent settings read from the environment (see backend/.env.example)."""

import os

AGENT_MODEL = os.environ.get("AGENT_MODEL", "gemini-2.5-flash")
