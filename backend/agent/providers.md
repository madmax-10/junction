# Model provider configuration

The default chat agents and valuation weighting use Gemini with AGENT_MODEL and GOOGLE_API_KEY. SerpApi is a separate search provider, not the conversational model. MODEL_API_KEY is reserved for Muse integration; setting it alone does not activate Muse.

To switch the chat model, set AGENT_MODEL_FACTORY to a trusted dotted Python callable. The callable receives model_name=AGENT_MODEL and returns a Google ADK BaseLlm adapter supporting tool calls. Every default specialist and the coordinator use this configuration. Explicit model overrides still take precedence, including offline test fakes. Output Pydantic schemas remain in place regardless of provider.

To switch valuation weighting, set VALUATION_WEIGHT_ADAPTER to a callable accepting (subject, comparables) and returning JSON or a mapping containing weights: a list of post_id, weight, reason records. Set VALUATION_PROVIDER_NAME and VALUATION_MODEL for truthful audit metadata. Existing ID/weight validation and server Decimal arithmetic remain mandatory. Adapter failures yield insufficient_data; they never silently fall back to another provider.

A production Muse adapter is not included: its actual endpoint, supported tool-call/structured-output protocol and model ID must be supplied and verified before implementing it. The adapter can read MODEL_API_KEY server-side. Do not put secrets or adapter paths in chat, and do not configure a Muse label while still using the default Gemini adapter.

Final agent reports use agent/status/message, where status is answer, needs_input, unavailable or error. Invalid coordinator replies become a structured error. No-response turns also carry this structured error output. Offline tests establish format handling, not live provider compliance.
