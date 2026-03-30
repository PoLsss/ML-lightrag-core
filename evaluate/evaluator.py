"""
RAG pipeline wrapper with TruLens instrumentation.

RAGPipeline calls LightRAG APIs directly and returns results for metric computation.
"""

from __future__ import annotations

from trulens.core.otel.instrument import instrument
from trulens.otel.semconv.trace import SpanAttributes

from client import LightRAGClient
from config import DEFAULT_TOP_K


class RAGPipeline:
    """Plain wrapper around LightRAGClient for one retrieval mode."""

    def __init__(self, mode: str, top_k: int = DEFAULT_TOP_K) -> None:
        self.mode = mode
        self.top_k = top_k
        self._client = LightRAGClient()

    @instrument(span_type=SpanAttributes.SpanType.RETRIEVAL)
    def retrieve(self, question: str) -> list[str]:
        """Call POST /query/data, return list of chunk text strings."""
        raw = self._client.retrieve(question, self.mode, self.top_k)
        data = raw.get("data") or {}
        return LightRAGClient.extract_chunks(data)

    @instrument(span_type=SpanAttributes.SpanType.GENERATION)
    def generate(self, question: str) -> str:
        """Call POST /query (LLM), return answer string."""
        raw = self._client.generate(question, self.mode, self.top_k)
        return LightRAGClient.extract_answer(raw)

    @instrument()
    def query(self, question: str) -> tuple[list[str], str]:
        """Run full pipeline: retrieval + generation. Returns (chunks, answer)."""
        chunks = self.retrieve(question)
        answer = self.generate(question)
        return chunks, answer
