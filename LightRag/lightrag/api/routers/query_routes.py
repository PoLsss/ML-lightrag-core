"""
This module contains all query-related routes for the LightRAG API.
"""

import json
import logging
import time
import uuid
from typing import Any, Dict, List, Literal, Optional

from ascii_colors import trace_exception
from fastapi import APIRouter, Depends, HTTPException, Request
from lightrag.api.utils_api import get_combined_auth_dependency
from lightrag.api.db_setup import log_query
from lightrag.api.tenant_context import TenantContext, get_optional_tenant_context, DEFAULT_TENANT_ID
from lightrag.api.rls import get_accessible_doc_ids_rls
from lightrag.base import QueryParam
from pydantic import BaseModel, Field, field_validator

router = APIRouter(tags=["query"])


class QueryRequest(BaseModel):
    query: str = Field(

        description="The query text",
    )

    mode: Literal["local", "global", "hybrid", "naive", "mix", "bypass"] = (
        Field(
            default="mix",
            description="Query mode",
        )
    )

    only_need_context: Optional[bool] = Field(
        default=None,
        description="If True, only returns the retrieved context without generating a response.",
    )

    only_need_prompt: Optional[bool] = Field(
        default=None,
        description="If True, only returns the generated prompt without producing a response.",
    )

    response_type: Optional[str] = Field(
        min_length=1,
        default=None,
        description="Defines the response format. Examples: 'Multiple Paragraphs', 'Single Paragraph', 'Bullet Points'.",
    )

    top_k: Optional[int] = Field(
        ge=1,
        default=None,
        description="Number of top items to retrieve. Represents entities in 'local' mode and relationships in 'global' mode.",
    )

    chunk_top_k: Optional[int] = Field(
        ge=1,
        default=None,
        description="Number of text chunks to retrieve initially from vector search and keep after reranking.",
    )

    max_entity_tokens: Optional[int] = Field(
        default=None,
        description="Maximum number of tokens allocated for entity context in unified token control system.",
        ge=1,
    )

    max_relation_tokens: Optional[int] = Field(
        default=None,
        description="Maximum number of tokens allocated for relationship context in unified token control system.",
        ge=1,
    )

    max_total_tokens: Optional[int] = Field(
        default=None,
        description="Maximum total tokens budget for the entire query context (entities + relations + chunks + system prompt).",
        ge=1,
    )

    hl_keywords: list[str] = Field(
        default_factory=list,
        description="List of high-level keywords to prioritize in retrieval. Leave empty to use the LLM to generate the keywords.",
    )

    ll_keywords: list[str] = Field(
        default_factory=list,
        description="List of low-level keywords to refine retrieval focus. Leave empty to use the LLM to generate the keywords.",
    )

    conversation_history: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Stores past conversation history to maintain context. Format: [{'role': 'user/assistant', 'content': 'message'}].",
    )

    user_prompt: Optional[str] = Field(
        default=None,
        description="User-provided prompt for the query. If provided, this will be used instead of the default value from prompt template.",
    )

    enable_rerank: Optional[bool] = Field(
        default=None,
        description="Enable reranking for retrieved text chunks. If True but no rerank model is configured, a warning will be issued. Default is True.",
    )

    include_references: Optional[bool] = Field(
        default=True,
        description="If True, includes reference list in responses. Affects /query and /query/stream endpoints. /query/data always includes references.",
    )

    include_chunk_content: Optional[bool] = Field(
        default=False,
        description="If True, includes actual chunk text content in references. Only applies when include_references=True. Useful for evaluation and debugging.",
    )

    stream: Optional[bool] = Field(
        default=True,
        description="If True, enables streaming output for real-time responses. Only affects /query/stream endpoint.",
    )

    @field_validator("query", mode="after")
    @classmethod
    def query_strip_after(cls, query: str) -> str:
        return query.strip()

    @field_validator("conversation_history", mode="after")
    @classmethod
    def conversation_history_role_check(
        cls, conversation_history: List[Dict[str, Any]] | None
    ) -> List[Dict[str, Any]] | None:
        if conversation_history is None:
            return None
        for msg in conversation_history:
            if "role" not in msg:
                raise ValueError("Each message must have a 'role' key.")
            if not isinstance(msg["role"], str) or not msg["role"].strip():
                raise ValueError(
                    "Each message 'role' must be a non-empty string."
                )
        return conversation_history

    def to_query_params(self, is_stream: bool) -> "QueryParam":
        request_data = self.model_dump(
            exclude_none=True, exclude={"query", "include_chunk_content"}
        )
        param = QueryParam(**request_data)
        param.stream = is_stream
        return param


class ReferenceItem(BaseModel):
    """A single reference item in query responses."""

    reference_id: str = Field(description="Unique reference identifier")
    file_path: str = Field(description="Path to the source file")
    content: Optional[List[str]] = Field(
        default=None,
        description="List of chunk contents from this file (only present when include_chunk_content=True)",
    )


class QueryResponse(BaseModel):
    response: str = Field(
        description="The generated response",
    )
    references: Optional[List[ReferenceItem]] = Field(
        default=None,
        description="Reference list (Disabled when include_references=False, /query/data always includes references.)",
    )
    # [NEW] Thêm trường này để gửi dữ liệu Graph về Frontend
    context_data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Raw context data including entities and relations for graph visualization",
    )


class QueryDataResponse(BaseModel):
    status: str = Field(description="Query execution status")
    message: str = Field(description="Status message")
    data: Dict[str, Any] = Field(
        description="Query result data containing entities, relationships, chunks, and references"
    )
    metadata: Dict[str, Any] = Field(
        description="Query metadata including mode, keywords, and processing information"
    )


class StreamChunkResponse(BaseModel):
    """Response model for streaming chunks in NDJSON format"""

    references: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Reference list (only in first chunk when include_references=True)",
    )
    response: Optional[str] = Field(
        default=None, description="Response content chunk or complete response"
    )
    error: Optional[str] = Field(
        default=None, description="Error message if processing fails"
    )


def create_query_routes(rag, api_key: Optional[str] = None, top_k: int = 60):
    combined_auth = get_combined_auth_dependency(api_key)

    # Model pricing per 1M tokens (USD) — used to compute cost from API-reported token counts
    MODEL_PRICING = {
        # OpenAI
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
        "gpt-4": {"input": 30.00, "output": 60.00},
        "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
        "o1": {"input": 15.00, "output": 60.00},
        "o1-mini": {"input": 3.00, "output": 12.00},
        "o3-mini": {"input": 1.10, "output": 4.40},
        # Anthropic
        "claude-3-opus": {"input": 15.00, "output": 75.00},
        "claude-3-sonnet": {"input": 3.00, "output": 15.00},
        "claude-3-haiku": {"input": 0.25, "output": 1.25},
        "claude-3.5-sonnet": {"input": 3.00, "output": 15.00},
        "claude-3.5-haiku": {"input": 0.80, "output": 4.00},
        # Google Gemini
        "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
        "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
        "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
        # Default fallback for unknown models
        "_default": {"input": 1.00, "output": 3.00},
    }

    def _compute_cost_from_api_tokens(prompt_tokens: int, completion_tokens: int, model_name: str = "") -> float:
        """Compute cost from API-reported token counts using model pricing table."""
        if prompt_tokens == 0 and completion_tokens == 0:
            return 0.0
        # Find matching pricing (allow partial model name match)
        pricing = MODEL_PRICING.get("_default")
        model_lower = model_name.lower() if model_name else ""
        for model_key, model_pricing in MODEL_PRICING.items():
            if model_key != "_default" and model_key in model_lower:
                pricing = model_pricing
                break
        input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
        output_cost = (completion_tokens / 1_000_000) * pricing["output"]
        return round(input_cost + output_cost, 8)

    def _get_user_info_from_context(ctx: Optional[TenantContext]) -> Dict[str, str]:
        """Extract user info from TenantContext (per-request, no shared state)."""
        if ctx is not None:
            return {
                "email": ctx.user_email,
                "role": ctx.user_role,
            }
        return {"email": "unknown", "role": "unknown"}

    @router.post(
        "/query",
        response_model=QueryResponse,
        dependencies=[Depends(combined_auth)],
    )
    async def query_text(
        request: QueryRequest,
        http_request: Request,
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        start_time = time.time()
        try:
            param = request.to_query_params(False)
            param.stream = False

            # --- RLS SCOPE FILTERING: set accessible_doc_ids BEFORE retrieval ---
            # Uses the centralized RLS module for tenant-isolated doc access.
            # Admin gets None (unrestricted within tenant); others get filtered list.
            if ctx is not None:
                accessible_ids = await get_accessible_doc_ids_rls(
                    ctx.tenant_id, ctx.user_role, ctx.user_email
                )
                if accessible_ids is not None:
                    param.accessible_doc_ids = set(accessible_ids)

            # Gọi LightRAG (retrieval is now scope-filtered)
            result = await rag.aquery_llm(request.query, param=param)

            # Lấy các phần dữ liệu quan trọng
            llm_response = result.get("llm_response", {})
            data = result.get("data", {})  # Đây là nơi chứa entities, relations
            references = data.get("references", [])

            response_content = llm_response.get("content", "")
            if not response_content:
                response_content = "No relevant context found for the query."

            # Xử lý nội dung tham chiếu (giữ nguyên logic cũ)
            if request.include_references and request.include_chunk_content:
                chunks = data.get("chunks", [])
                ref_id_to_content = {}
                for chunk in chunks:
                    ref_id = chunk.get("reference_id", "")
                    content = chunk.get("content", "")
                    if ref_id and content:
                        ref_id_to_content.setdefault(ref_id, []).append(content)

                enriched_references = []
                for ref in references:
                    ref_copy = ref.copy()
                    ref_id = ref.get("reference_id", "")
                    if ref_id in ref_id_to_content:
                        ref_copy["content"] = ref_id_to_content[ref_id]
                    enriched_references.append(ref_copy)
                references = enriched_references

            # Calculate execution time
            execution_time_ms = int((time.time() - start_time) * 1000)

            # Log the query to database — using TenantContext (no re-parsing JWT)
            try:
                user_info = _get_user_info_from_context(ctx)
                client_ip = ctx.ip_address if ctx else (http_request.client.host if http_request.client else "unknown")
                doc_ids = [ref.get("reference_id", "") for ref in references if ref.get("reference_id")]
                
                # Extract token usage from token_tracker (API-reported token counts)
                usage = llm_response.get("usage", {}) if isinstance(llm_response.get("usage"), dict) else {}
                total_tokens = usage.get("total_tokens", 0)
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)
                # Compute cost from API-reported tokens using model pricing table
                model_name = getattr(rag, "llm_model_name", "")
                computed_cost = _compute_cost_from_api_tokens(prompt_tokens, completion_tokens, model_name)
                
                await log_query(
                    user_email=user_info["email"],
                    user_role=user_info["role"],
                    query_text=request.query,
                    query_mode=request.mode,
                    response_preview=response_content[:200] if response_content else "",
                    documents_accessed=doc_ids,
                    execution_time_ms=execution_time_ms,
                    session_id=ctx.request_id if ctx else str(uuid.uuid4()),
                    ip_address=client_ip,
                    tokens_used=total_tokens if total_tokens > 0 else None,
                    cost=computed_cost if computed_cost > 0 else None
                )
            except Exception as log_error:
                logging.warning(f"Failed to log query: {log_error}")

            # [FIX] Đóng gói context_data vào phản hồi
            response_obj = {
                "response": response_content,
                "context_data": data,  # Gửi toàn bộ data (chứa entities) về Frontend
            }

            if request.include_references:
                response_obj["references"] = references
            else:
                response_obj["references"] = None

            return QueryResponse(**response_obj)

        except Exception as e:
            trace_exception(e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/query/stream", dependencies=[Depends(combined_auth)])
    async def query_text_stream(
        request: QueryRequest,
        http_request: Request,
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        try:
            start_time = time.time()
            stream_mode = request.stream if request.stream is not None else True
            param = request.to_query_params(stream_mode)
            from fastapi.responses import StreamingResponse
            from starlette.background import BackgroundTask

            # --- RLS SCOPE FILTERING: set accessible_doc_ids BEFORE retrieval ---
            if ctx is not None:
                accessible_ids = await get_accessible_doc_ids_rls(
                    ctx.tenant_id, ctx.user_role, ctx.user_email
                )
                if accessible_ids is not None:
                    param.accessible_doc_ids = set(accessible_ids)

            result = await rag.aquery_llm(request.query, param=param)

            # Extract user info from TenantContext (per-request, no re-parsing)
            user_info = _get_user_info_from_context(ctx)
            client_ip = ctx.ip_address if ctx else (http_request.client.host if http_request.client else "unknown")
            session_id = ctx.request_id if ctx else str(uuid.uuid4())

            # Shared state to collect response chunks for logging after stream ends
            stream_state = {
                "collected_response": [],
                "references": [],
                "llm_response": result.get("llm_response", {}),
            }

            async def stream_generator():
                # Lấy dữ liệu context
                data = result.get("data", {})
                references = data.get("references", [])
                llm_response = result.get("llm_response", {})

                # Logic xử lý chunk content (Giữ nguyên)
                if request.include_references and request.include_chunk_content:
                    chunks = data.get("chunks", [])
                    ref_id_to_content = {}
                    for chunk in chunks:
                        ref_id = chunk.get("reference_id", "")
                        content = chunk.get("content", "")
                        if ref_id and content:
                            ref_id_to_content.setdefault(ref_id, []).append(
                                content
                            )
                    enriched_references = []
                    for ref in references:
                        ref_copy = ref.copy()
                        ref_id = ref.get("reference_id", "")
                        if ref_id in ref_id_to_content:
                            ref_copy["content"] = ref_id_to_content[ref_id]
                        enriched_references.append(ref_copy)
                    references = enriched_references

                # Save references to shared state for background logging
                stream_state["references"] = references

                if llm_response.get("is_streaming"):
                    # [QUAN TRỌNG] Gửi context_data trong gói tin đầu tiên
                    first_packet = {}
                    if request.include_references:
                        first_packet["references"] = references

                    # Gửi luôn context_data (chứa entities) về Frontend
                    first_packet["context_data"] = data

                    yield f"{json.dumps(first_packet)}\n"

                    # Sau đó mới stream nội dung chat
                    response_stream = llm_response.get("response_iterator")
                    if response_stream:
                        try:
                            async for chunk in response_stream:
                                if chunk:
                                    stream_state["collected_response"].append(chunk)
                                    yield f"{json.dumps({'response': chunk})}\n"
                        except Exception as e:
                            logging.error(f"Streaming error: {str(e)}")
                            yield f"{json.dumps({'error': str(e)})}\n"
                else:
                    response_content = llm_response.get("content", "")
                    stream_state["collected_response"].append(response_content)
                    yield f"{json.dumps({'response': response_content, 'references': references if request.include_references else None, 'context_data': data})}\n"

            async def log_stream_query():
                """Background task to log the streaming query after response completes."""
                try:
                    execution_time_ms = int((time.time() - start_time) * 1000)
                    full_response = "".join(stream_state["collected_response"])
                    references = stream_state["references"]
                    llm_response = stream_state["llm_response"]
                    doc_ids = [ref.get("reference_id", "") for ref in references if ref.get("reference_id")]
                    
                    # Read from token_tracker after stream is fully consumed
                    token_tracker = llm_response.get("token_tracker")
                    if token_tracker is not None:
                        usage = token_tracker.get_usage()
                    elif isinstance(llm_response.get("usage"), dict):
                        usage = llm_response.get("usage", {})
                    else:
                        usage = {}
                    
                    total_tokens = usage.get("total_tokens", 0)
                    prompt_tokens = usage.get("prompt_tokens", 0)
                    completion_tokens = usage.get("completion_tokens", 0)
                    # Compute cost from API-reported tokens using model pricing table
                    model_name = getattr(rag, "llm_model_name", "")
                    computed_cost = _compute_cost_from_api_tokens(prompt_tokens, completion_tokens, model_name)

                    await log_query(
                        user_email=user_info["email"],
                        user_role=user_info["role"],
                        query_text=request.query,
                        query_mode=request.mode,
                        response_preview=full_response[:200] if full_response else "",
                        documents_accessed=doc_ids,
                        execution_time_ms=execution_time_ms,
                        session_id=session_id,
                        ip_address=client_ip,
                        tokens_used=total_tokens if total_tokens > 0 else None,
                        cost=computed_cost if computed_cost > 0 else None
                    )
                except Exception as log_error:
                    logging.warning(f"Failed to log streaming query: {log_error}")

            return StreamingResponse(
                stream_generator(),
                media_type="application/x-ndjson",
                headers={"Cache-Control": "no-cache"},
                background=BackgroundTask(log_stream_query),
            )
        except Exception as e:
            trace_exception(e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.post(
        "/query/data",
        response_model=QueryDataResponse,
        dependencies=[Depends(combined_auth)],
    )
    async def query_data(
        request: QueryRequest,
        http_request: Request,
        ctx: Optional[TenantContext] = Depends(get_optional_tenant_context),
    ):
        start_time = time.time()
        try:
            param = request.to_query_params(False)

            # --- RLS SCOPE FILTERING: set accessible_doc_ids BEFORE retrieval ---
            if ctx is not None:
                accessible_ids = await get_accessible_doc_ids_rls(
                    ctx.tenant_id, ctx.user_role, ctx.user_email
                )
                if accessible_ids is not None:
                    param.accessible_doc_ids = set(accessible_ids)

            response = await rag.aquery_data(request.query, param=param)

            # Log the query using TenantContext
            try:
                execution_time_ms = int((time.time() - start_time) * 1000)
                user_info = _get_user_info_from_context(ctx)
                client_ip = ctx.ip_address if ctx else (http_request.client.host if http_request.client else "unknown")

                await log_query(
                    user_email=user_info["email"],
                    user_role=user_info["role"],
                    query_text=request.query,
                    query_mode=request.mode,
                    response_preview=str(response.get("message", ""))[:200] if isinstance(response, dict) else "",
                    documents_accessed=[],
                    execution_time_ms=execution_time_ms,
                    session_id=ctx.request_id if ctx else str(uuid.uuid4()),
                    ip_address=client_ip,
                )
            except Exception as log_error:
                logging.warning(f"Failed to log data query: {log_error}")

            if isinstance(response, dict):
                return QueryDataResponse(**response)
            else:
                return QueryDataResponse(
                    status="failure",
                    message="Invalid response type",
                    data={},
                )
        except Exception as e:
            trace_exception(e)
            raise HTTPException(status_code=500, detail=str(e))

    return router
