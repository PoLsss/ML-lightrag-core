"""
RAG pipeline wrapper with TruLens instrumentation.

RAGPipeline calls LightRAG APIs directly and returns results for metric computation.

query() returns the answer string (str) so that TruLens select_record_output()
resolves to the answer directly.  The full result tuple
(chunks, answer, entities, relationships) is cached in _last_query_result for
_evaluate_one() to read after the call returns.
"""

from __future__ import annotations

from trulens.core.otel.instrument import instrument
from trulens.otel.semconv.trace import SpanAttributes

from client import LightRAGClient
from config import DEFAULT_TOP_K, MAX_ENTITIES, MAX_RELATIONSHIPS


class RAGPipeline:
    """Plain wrapper around LightRAGClient for one retrieval mode."""

    def __init__(self, mode: str, top_k: int = DEFAULT_TOP_K) -> None:
        self.mode = mode
        self.top_k = top_k
        self._client = LightRAGClient()
        # Raw /query/data response cached by retrieve() for use in query()
        self._last_retrieve_data: dict = {}

    @instrument(span_type=SpanAttributes.SpanType.RETRIEVAL)
    def retrieve(self, question: str) -> list[str]:
        """Call POST /query/data, cache raw data, return limited chunk strings.

        The returned list contains only text chunks (no entities / relationships)
        so that TruLens context-span selectors see a clean chunk list.  Entities
        and relationships are surfaced separately via query().
        """
        raw = self._client.retrieve(question, self.mode, self.top_k)
        self._last_retrieve_data = raw.get("data") or {}

        # Return only text chunks for the TruLens retrieval span
        chunks: list[str] = []
        for chunk in self._last_retrieve_data.get("chunks") or []:
            content = (chunk.get("content") or "").strip()
            if content:
                chunks.append(content)
        return chunks

    @instrument(span_type=SpanAttributes.SpanType.GENERATION)
    def generate(self, question: str) -> str:
        """Call POST /query (LLM), return answer string."""
        raw = self._client.generate(question, self.mode, self.top_k)
        return LightRAGClient.extract_answer(raw)

    @instrument()
    def query(self, question: str) -> str:
        """Run full pipeline: retrieval + generation.

        Returns the answer string so that TruLens ``select_record_output()``
        resolves to the answer directly (not a tuple).  The full result tuple
        ``(chunks, answer, entities, relationships)`` is cached in
        ``self._last_query_result`` for ``_evaluate_one()`` to read after the
        call returns.
        """
        chunks = self.retrieve(question)
        answer = self.generate(question)

        data = self._last_retrieve_data
        entities = LightRAGClient.extract_entities(data, max_entities=MAX_ENTITIES)
        relationships = LightRAGClient.extract_relationships(
            data, max_relationships=MAX_RELATIONSHIPS
        )

        # Cache for manual metric computation in runner._evaluate_one()
        self._last_query_result: tuple[list[str], str, list[str], list[str]] = (
            chunks,
            answer,
            entities,
            relationships,
        )

        return answer
