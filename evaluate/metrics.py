"""
Direct TruLens metric computation — no TruApp, no @instrument, no Metric/Selector.

Calls provider methods directly on each (question, chunks, answer) triple
and returns plain float scores.

compute_groundedness_v2() replaces the old TruLens CoT helper with a single
OpenAI SDK call so that groundedness is evaluated in one pass over the full
evidence set (chunks + entities + relationships) rather than being broken into
per-claim sub-calls that can inflate LLM request counts.
"""

from __future__ import annotations

import os

import numpy as np

from config import (
    GROUNDEDNESS_MODEL,
    GROUNDEDNESS_TEMPERATURE,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)


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


def compute_context_relevance(
    provider: object, question: str, chunks: list[str]
) -> float:
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


# ---------------------------------------------------------------------------
# Groundedness v2 — single OpenAI SDK call
# ---------------------------------------------------------------------------

_GROUNDEDNESS_SYSTEM_PROMPT = """\
You are an expert at evaluating whether a statement is grounded in evidence.

Your task:
1. Read all the evidence carefully.
2. Extract all factual claims from the statement.
3. For each claim, check whether it is fully supported by the evidence.
4. Return a single score from 0.0 to 1.0.

Scoring scale:
- 1.0 : All factual claims are fully supported by evidence.
- 0.8-0.9 : Most claims supported; minor unsupported details.
- 0.6-0.7 : Some claims supported; moderate gaps.
- 0.4-0.5 : Few claims supported; significant unsupported content.
- 0.0-0.3 : No claims supported, or claims contradict evidence.

Return ONLY the decimal score (e.g. 0.87). Do not include any explanation.\
"""

_GROUNDEDNESS_REASONS_SYSTEM_PROMPT = """\
You are an expert at evaluating whether a statement is grounded in evidence.

Your task:
1. Read all the evidence carefully.
2. Extract the key factual claims from the statement (up to 5 claims).
3. For each claim, identify the best supporting evidence (or note absence).
4. Assign each claim a score from 0.0 to 1.0.
5. Compute an overall score as the mean of all claim scores.

Return your answer as a single JSON object with this exact structure:
{
  "score": <overall float 0.0-1.0>,
  "reasons": [
    {
      "criteria": "<the claim being evaluated>",
      "supporting_evidence": "<relevant quote from evidence, or 'No supporting evidence found'>",
      "score": <float 0.0-1.0>
    }
  ]
}

Return ONLY the JSON object. Do not include any explanation outside it.\
"""


def compute_groundedness_v2(
    answer: str,
    chunks: list[str],
    entities: list[str] | None = None,
    relationships: list[str] | None = None,
    return_reasons: bool = False,
) -> "float | tuple[float, list[dict]]":
    """Evaluate groundedness with a single OpenAI SDK call.

    All available evidence (text chunks, KG entity descriptions, KG
    relationship descriptions) is joined into one prompt so the LLM
    evaluates the statement holistically rather than per-claim, reducing
    LLM requests from 3+ to exactly 1.

    Args:
        answer:         The LLM-generated statement to evaluate.
        chunks:         Text chunks retrieved from /query/data.
        entities:       KG entity descriptions (optional).
        relationships:  KG relationship descriptions (optional).
        return_reasons: When True, returns ``(score, reasons_list)`` where
                        ``reasons_list`` is a list of dicts with keys
                        ``criteria``, ``supporting_evidence``, ``score``.
                        When False (default), returns a plain ``float``.

    Returns:
        float in [0.0, 1.0] when ``return_reasons=False``.
        ``(float, list[dict])`` when ``return_reasons=True``.
    """
    if not chunks:
        return (0.0, []) if return_reasons else 0.0

    # Build full evidence string
    evidence_parts: list[str] = list(chunks)
    if entities:
        evidence_parts.extend(entities)
    if relationships:
        evidence_parts.extend(relationships)

    all_evidence = "\n\n".join(evidence_parts)

    if return_reasons:
        system_prompt = _GROUNDEDNESS_REASONS_SYSTEM_PROMPT
        user_prompt = (
            "EVIDENCE (all available context):\n"
            f"{all_evidence}\n\n"
            "---\n\n"
            "STATEMENT TO EVALUATE:\n"
            f"{answer}\n\n"
            "---\n\n"
            "JSON response:"
        )
        max_tokens = 1024
    else:
        system_prompt = _GROUNDEDNESS_SYSTEM_PROMPT
        user_prompt = (
            "EVIDENCE (all available context):\n"
            f"{all_evidence}\n\n"
            "---\n\n"
            "STATEMENT TO EVALUATE:\n"
            f"{answer}\n\n"
            "---\n\n"
            "Groundedness Score (0.0-1.0):"
        )
        max_tokens = 10

    try:
        import json as _json

        from openai import OpenAI

        os.environ.setdefault("OPENAI_API_KEY", OPENAI_API_KEY)
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=GROUNDEDNESS_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=GROUNDEDNESS_TEMPERATURE,
            max_tokens=max_tokens,
        )

        content = (response.choices[0].message.content or "").strip()

        if return_reasons:
            # Parse JSON response with score + reasons list
            try:
                # Strip markdown code fences if present
                if content.startswith("```"):
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]
                data = _json.loads(content)
                score = max(0.0, min(1.0, float(data.get("score", 0.0))))
                reasons = data.get("reasons", [])
                # Normalise: ensure each reason has the required keys
                normalised: list[dict] = []
                for r in reasons:
                    normalised.append(
                        {
                            "criteria": str(r.get("criteria", "")),
                            "supporting_evidence": str(
                                r.get("supporting_evidence", "")
                            ),
                            "score": float(r.get("score", 0.0)),
                        }
                    )
                return score, normalised
            except Exception:
                # Fallback: treat entire content as a plain score
                try:
                    score = max(0.0, min(1.0, float(content)))
                except Exception:
                    score = 0.0
                return score, []
        else:
            score = float(content)
            return max(0.0, min(1.0, score))

    except Exception as e:
        if _is_auth_error(e):
            raise RuntimeError(
                "OpenAI authentication failed while computing groundedness_v2. "
                "Set a valid OPENAI_API_KEY in evaluate/.env."
            ) from e
        print(f"    [WARN] groundedness_v2 error: {e}")
        return (0.0, []) if return_reasons else 0.0


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
