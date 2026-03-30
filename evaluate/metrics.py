"""
Direct TruLens metric computation — no TruApp, no @instrument, no Metric/Selector.

Calls provider methods directly on each (question, chunks, answer) triple
and returns plain float scores.
"""

from __future__ import annotations

import os

import numpy as np

from config import OPENAI_API_KEY, OPENAI_MODEL


def _is_auth_error(exc: Exception) -> bool:
    text = str(exc).lower()
    tokens = (
        "invalid_api_key",
        "incorrect api key",
        "401",
        "authentication",
    )
    return any(token in text for token in tokens)


def validate_provider(provider: object) -> None:
    """Fail fast when provider authentication is invalid."""
    try:
        probe = provider.relevance(prompt="ping", response="pong")  # type: ignore[attr-defined]
        if isinstance(probe, tuple):
            probe = probe[0]
        float(probe) if probe is not None else 0.0
    except Exception as exc:
        if _is_auth_error(exc):
            raise RuntimeError(
                "TruLens provider authentication failed. "
                "Set a valid OPENAI_API_KEY in evaluate/.env."
            ) from exc
        raise RuntimeError(f"TruLens provider validation failed: {exc}") from exc


def compute_context_relevance(provider: object, question: str, chunks: list[str]) -> float:
    """Score each chunk against the question, return mean."""
    if not chunks:
        return 0.0
    scores = []
    for chunk in chunks:
        try:
            score = provider.context_relevance(question=question, context=chunk)  # type: ignore[attr-defined]
            if isinstance(score, tuple):
                score = score[0]
            if score is not None:
                scores.append(float(score))
        except Exception as e:
            if _is_auth_error(e):
                raise RuntimeError(
                    "TruLens provider authentication failed while computing context relevance."
                ) from e
            print(f"    [WARN] context_relevance error: {e}")
    return float(np.mean(scores)) if scores else 0.0


def compute_answer_relevance(provider: object, question: str, answer: str) -> float:
    """Score how relevant the answer is to the question."""
    try:
        score = provider.relevance(prompt=question, response=answer)  # type: ignore[attr-defined]
        if isinstance(score, tuple):
            score = score[0]
        return float(score) if score is not None else 0.0
    except Exception as e:
        if _is_auth_error(e):
            raise RuntimeError(
                "TruLens provider authentication failed while computing answer relevance."
            ) from e
        print(f"    [WARN] answer_relevance error: {e}")
        return 0.0


def compute_groundedness(provider: object, answer: str, chunks: list[str]) -> float:
    """Score whether the answer is grounded in the retrieved context."""
    if not chunks:
        return 0.0
    source = "\n\n".join(chunks)
    try:
        score = provider.groundedness_measure_with_cot_reasons(  # type: ignore[attr-defined]
            source=source, statement=answer
        )
        if isinstance(score, tuple):
            score = score[0]
        return float(score) if score is not None else 0.0
    except Exception:
        try:
            score = provider.groundedness(source=source, statement=answer)  # type: ignore[attr-defined]
            if isinstance(score, tuple):
                score = score[0]
            return float(score) if score is not None else 0.0
        except Exception as e2:
            if _is_auth_error(e2):
                raise RuntimeError(
                    "TruLens provider authentication failed while computing groundedness."
                ) from e2
            print(f"    [WARN] groundedness error: {e2}")
            return 0.0


def create_provider() -> object:
    """Instantiate the TruLens OpenAI provider."""
    try:
        from trulens.providers.openai import OpenAI as TruOpenAI
    except ImportError as exc:
        raise ImportError(
            "trulens-providers-openai is not installed. "
            "Run: pip install trulens-providers-openai"
        ) from exc
    os.environ.setdefault("OPENAI_API_KEY", OPENAI_API_KEY)
    return TruOpenAI(model_engine=OPENAI_MODEL)
