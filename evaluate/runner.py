"""
Evaluation orchestration for LightRAG + TruLens.

run_evaluation() is the single public entry point:
  1. Load questions from the dataset file.
  2. For every requested retrieval mode:
     a. Create a RAGPipeline.
     b. For each question: retrieve + generate, then compute three metrics directly.
  3. Build a leaderboard DataFrame and return a structured results dict.
"""

from __future__ import annotations

import json
import time
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from trulens.core import Metric, Selector

from config import (
    OPENAI_MODEL,
    PROMPTS_OUTPUT_FILE,
    QUESTIONS_FILE,
    RETRIEVAL_MODES,
)
from evaluator import RAGPipeline
from metrics import (
    compute_answer_relevance,
    compute_context_relevance,
    compute_groundedness_v2,
    create_provider,
    validate_provider,
)


METRIC_NAMES: tuple[str, str, str] = (
    "Context Relevance",
    "Answer Relevance",
    "Groundedness",
)


def _gr_for_trulens(context: object, answer: str) -> "tuple[float, dict] | float":
    """TruLens-compatible Groundedness wrapper.

    Defined at **module level** (not as a closure inside
    ``_build_dashboard_metrics``) so TruLens's evaluator thread can locate
    and call it by its fully-qualified name ``runner._gr_for_trulens``.
    Closure / nested functions cannot be reliably serialised or imported by
    background threads and will silently produce no feedback records.

    Returns a ``(score, meta)`` tuple where ``meta["reasons"]`` is a list of
    per-claim dicts expected by TruLens's ``expand_groundedness_df``:
    ``[{"criteria": ..., "supporting_evidence": ..., "score": ...}]``.
    This allows the TruLens Web UI to render the Groundedness detail panel
    instead of showing "No metric details found."

    Falls back to ``(0.0, {})`` on any error so the evaluator thread never
    crashes.
    """
    try:
        if isinstance(context, list):
            chunks: list[str] = [str(c) for c in context if c is not None]
        elif context is not None:
            chunks = [str(context)]
        else:
            chunks = []
        if not answer or not chunks:
            return 0.0, {}
        score, reasons = compute_groundedness_v2(
            answer=answer, chunks=chunks, return_reasons=True
        )
        return score, {"reasons": reasons}
    except Exception:
        return 0.0, {}


# Question loading


def load_questions(
    filepath: Path = QUESTIONS_FILE,
    max_questions: Optional[int] = None,
) -> list[dict]:
    """
    Load questions from the dataset JSON file.

    File format:
      [ [categories...], [retrieval_types...], {question...}, {question...}, ... ]

    Returns a flat list of question dicts with: id, question, category,
    retrieval_type, sources.
    """
    try:
        with open(filepath, "r", encoding="utf-8-sig") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Invalid question file format in {filepath}. "
            "Expected JSON array with question objects."
        ) from exc

    questions = [item for item in data if isinstance(item, dict) and "question" in item]

    if max_questions and max_questions > 0:
        questions = questions[:max_questions]

    for idx, q in enumerate(questions):
        if "id" not in q:
            q["id"] = f"q{idx + 1:03d}"

    return questions


# Per-question evaluation


def _evaluate_one(
    pipeline: RAGPipeline,
    provider: object,
    question_data: dict,
    idx: int,
    total: int,
) -> dict[str, Any]:
    """Evaluate a single question: retrieve + generate + compute metrics."""
    question = question_data["question"]
    q_id = question_data.get("id", f"q{idx:03d}")
    short_q = question[:70] + "..." if len(question) > 70 else question

    print(f"  [{idx:>3}/{total}] {q_id}: {short_q}", end=" ", flush=True)

    result: dict[str, Any] = {
        "id": q_id,
        "question": question,
        "category": question_data.get("category", "unknown"),
        "retrieval_type": question_data.get("retrieval_type", "unknown"),
        "sources": question_data.get("sources", []),
        "mode": pipeline.mode,
        "answer": None,
        "context_count": 0,
        "status": "pending",
        "error": None,
        "timestamp": datetime.now().isoformat(),
        "context_relevance": 0.0,
        "answer_relevance": 0.0,
        "groundedness": 0.0,
        "chunks": [],
    }

    try:
        answer = pipeline.query(question)
        chunks, _, entities, relationships = pipeline._last_query_result

        result["answer"] = answer
        result["context_count"] = len(chunks)
        result["chunks"] = chunks

        if answer:
            result["status"] = "success"
        else:
            result["status"] = "empty_response"

        # Compute RAG Triad metrics directly.
        # Answer relevance does not require retrieved context, so compute it whenever
        # we have an answer. Context relevance and groundedness depend on chunks.
        if result["status"] == "success":
            result["answer_relevance"] = compute_answer_relevance(
                provider, question, answer
            )
            if chunks:
                result["context_relevance"] = compute_context_relevance(
                    provider, question, chunks
                )
                result["groundedness"] = compute_groundedness_v2(
                    answer=answer,
                    chunks=chunks,
                    entities=entities,
                    relationships=relationships,
                )

            cr = result["context_relevance"]
            ar = result["answer_relevance"]
            gr = result["groundedness"]
            suffix = "" if chunks else " (no context)"
            print(f"[OK] CR={cr:.2f} AR={ar:.2f} GR={gr:.2f}{suffix}")
        elif result["status"] == "empty_response":
            print("[ERR] (empty response)")
        else:
            print("[ERR] (no context)")

    except Exception as exc:
        result["status"] = "error"
        result["error"] = str(exc)[:300]
        print(f"[ERR] ({result['error']})")

    return result


# Main evaluation loop


def run_evaluation(
    modes: Optional[list[str]] = None,
    max_questions: Optional[int] = None,
    reset_db: bool = True,
) -> dict[str, Any]:
    """
    Run the full evaluation pipeline.

    Args:
        modes:         Retrieval modes to evaluate (default: all five).
        max_questions: Cap the number of questions per mode (for testing).
        reset_db:      Optionally reset TruLens database (ignored if TruSession unavailable).

    Returns:
        Dict with keys: summary, results, leaderboard (DataFrame), session (optional).
    """
    if modes is None:
        modes = RETRIEVAL_MODES

    questions = load_questions(max_questions=max_questions)
    total_q = len(questions)

    _print_header(modes, total_q)

    # Optional TruSession for dashboard - failure here must not crash the run
    session = None
    try:
        from trulens.core import TruSession

        session = TruSession()
        if reset_db:
            print("\n[INFO] Resetting TruLens database ...")
            session.reset_database()
    except Exception as exc:
        warnings.warn(f"[WARN] TruSession unavailable - dashboard disabled: {exc}")

    # Create OpenAI provider for direct metric calls
    print("\n[INFO] Initialising TruLens OpenAI provider ...")
    provider = create_provider()
    validate_provider(provider)
    print(f"[INFO] Provider ready (model: {OPENAI_MODEL})")

    _save_prompts(total_q, modes)

    all_results: list[dict] = []
    start_time = datetime.now()

    for mode in modes:
        print(f"\n{'-' * 65}")
        print(f"  Mode: {mode.upper()}  ({total_q} questions)")
        print(f"{'-' * 65}")

        pipeline = RAGPipeline(mode=mode)
        use_tru_context = False
        mode_run_name = f"eval-{mode}-{int(time.time())}"
        dashboard_metrics = _build_dashboard_metrics(provider)

        try:
            from trulens.apps.app import TruApp

            tru_app = TruApp(
                pipeline,
                app_name="LightRAG-Evaluation",
                app_version=mode,
                main_method=pipeline.query,
                feedbacks=dashboard_metrics,
            )

            with tru_app.run(run_name=mode_run_name):
                use_tru_context = True
                for idx, q in enumerate(questions, start=1):
                    result = _evaluate_one(pipeline, provider, q, idx, total_q)
                    all_results.append(result)
                    time.sleep(0.05)  # light throttle

            # Force immediate feedback computation while tru_app is still alive.
            # The background evaluator thread polls every ~10 s; without an
            # explicit flush the TruApp can be garbage-collected before the
            # thread wakes up, clearing the weakref and causing the evaluator
            # to log "'NoneType' object has no attribute 'connector'".
            try:
                tru_app._evaluator.compute_now(record_ids=None)
                tru_app.stop_evaluator()
                print(f"[INFO] Dashboard feedbacks flushed for mode={mode}")
            except Exception as flush_exc:
                warnings.warn(
                    f"[WARN] Dashboard feedback flush failed for mode={mode}: {flush_exc}"
                )

        except Exception as exc:
            warnings.warn(f"[WARN] TruApp context unavailable for mode={mode}: {exc}")

        if not use_tru_context:
            for idx, q in enumerate(questions, start=1):
                result = _evaluate_one(pipeline, provider, q, idx, total_q)
                all_results.append(result)
                time.sleep(0.05)  # light throttle

        success = sum(
            1 for r in all_results if r["mode"] == mode and r["status"] == "success"
        )
        print(f"\n  Mode {mode}: {success}/{total_q} questions succeeded")

    # Build leaderboard DataFrame
    leaderboard_data = []
    for mode in modes:
        mode_results = [
            r for r in all_results if r["mode"] == mode and r["status"] == "success"
        ]
        if mode_results:
            leaderboard_data.append(
                {
                    "app_version": mode,
                    "Context Relevance": np.mean(
                        [r["context_relevance"] for r in mode_results]
                    ),
                    "Answer Relevance": np.mean(
                        [r["answer_relevance"] for r in mode_results]
                    ),
                    "Groundedness": np.mean([r["groundedness"] for r in mode_results]),
                }
            )
    leaderboard = pd.DataFrame(leaderboard_data)

    completed = sum(1 for r in all_results if r["status"] == "success")
    failed = len(all_results) - completed

    summary: dict[str, Any] = {
        "start_time": start_time.isoformat(),
        "end_time": datetime.now().isoformat(),
        "modes": modes,
        "total_questions": total_q,
        "metrics": list(METRIC_NAMES),
        "completed": completed,
        "failed": failed,
        "success_rate": completed / len(all_results) * 100 if all_results else 0,
    }

    return {
        "summary": summary,
        "results": all_results,
        "leaderboard": leaderboard,
        "session": session,
    }


# Helpers


def _build_dashboard_metrics(provider: object) -> list:
    """Build TruLens Metric objects for the Web UI dashboard.

    Uses TruLens v2 OTEL API (``Metric`` + ``Selector``).  Three metrics are
    registered:

    * **Context Relevance** — ``provider.context_relevance`` called once per
      retrieved chunk (``collect_list=False``), TruLens aggregates the scores.
    * **Answer Relevance** — ``provider.relevance`` maps question → ``prompt``
      and ``select_record_output()`` → ``response``.  Works because
      ``RAGPipeline.query()`` now returns the answer string directly.
    * **Groundedness** — thin wrapper around ``compute_groundedness_v2`` so
      that a single OpenAI SDK call evaluates the full context list from the
      RETRIEVAL span against the generated answer.

    ``query()`` returns a plain ``str`` (the answer), so
    ``Selector.select_record_output()`` resolves to the answer string without
    any tuple-indexing gymnastics.
    """
    # 1. Context Relevance — scored per chunk via TruLens provider
    f_context_relevance = (
        Metric(provider.context_relevance, name="Context Relevance")  # type: ignore[attr-defined]
        .on_input()  # question → param "question"
        .on_context(collect_list=False)  # one chunk at a time → param "context"
    )

    # 2. Answer Relevance — question vs generated answer
    f_answer_relevance = (
        Metric(provider.relevance, name="Answer Relevance")  # type: ignore[attr-defined]
        .on_input()  # question → param "prompt"
        .on({"response": Selector.select_record_output()})  # answer → param "response"
    )

    # 3. Groundedness — single OpenAI call via compute_groundedness_v2.
    # References the module-level _gr_for_trulens so TruLens's evaluator
    # thread can import it by name (closures are not reliably importable).
    f_groundedness = (
        Metric(_gr_for_trulens, name="Groundedness")
        .on_context(collect_list=True)  # full chunk list → param "context"
        .on({"answer": Selector.select_record_output()})  # answer → param "answer"
    )

    return [f_context_relevance, f_answer_relevance, f_groundedness]


def _print_header(modes: list[str], total_q: int) -> None:
    print("=" * 65)
    print("  LightRAG x TruLens Evaluation Pipeline")
    print("  RAG Triad: Groundedness | Answer Relevance | Context Relevance")
    print("=" * 65)
    print(f"  Model     : {OPENAI_MODEL}")
    print(f"  Modes     : {', '.join(modes)}")
    print(f"  Questions : {total_q} per mode  ({total_q * len(modes)} total evals)")
    print("=" * 65)


def _save_prompts(total_q: int, modes: list[str]) -> None:
    """Persist evaluation configuration to JSON."""
    output = {
        "configuration": {
            "provider": "trulens.providers.openai.OpenAI",
            "model_engine": OPENAI_MODEL,
            "retrieval_modes": modes,
            "total_questions": total_q,
            "enabled_metrics": list(METRIC_NAMES),
            "evaluation_timestamp": datetime.now().isoformat(),
            "approach": "direct_provider_calls",
        },
    }
    with open(PROMPTS_OUTPUT_FILE, "w", encoding="utf-8") as fh:
        json.dump(output, fh, ensure_ascii=False, indent=2)
    print(f"[INFO] Evaluation config saved -> {PROMPTS_OUTPUT_FILE}")
