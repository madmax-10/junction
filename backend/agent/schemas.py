"""Final-reply contracts. Shape validation is never database authorization."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class AgentReply(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    agent: Literal["coordinator", "valuation", "buyer", "seller", "repair", "post_gen"]
    status: Literal["answer", "needs_input", "unavailable", "error"]
    message: str = Field(min_length=1)


class CoordinatorReply(AgentReply):
    agent: Literal["coordinator"] = "coordinator"


class ValuationReply(AgentReply):
    agent: Literal["valuation"] = "valuation"


class BuyerReply(AgentReply):
    agent: Literal["buyer"] = "buyer"


class SellerReply(AgentReply):
    agent: Literal["seller"] = "seller"


class RepairReply(AgentReply):
    agent: Literal["repair"] = "repair"


class PostReply(AgentReply):
    agent: Literal["post_gen"] = "post_gen"


REPLY_SCHEMAS = {
    "coordinator": CoordinatorReply, "valuation": ValuationReply,
    "buyer": BuyerReply, "seller": SellerReply, "repair": RepairReply,
    "post_gen": PostReply,
}


class DatabaseOperation(BaseModel):
    """Server-derived tool execution outcome, never filled by the LLM."""

    model_config = ConfigDict(extra="forbid", strict=True)
    agent: str
    tool: str
    call_id: str
    operation: Literal["read", "write"]
    status: Literal["ok", "no_results", "insufficient_data", "vision_unavailable", "search_unavailable", "error"]
    succeeded: bool
    ids: dict[str, JsonValue]
    error: str | None
