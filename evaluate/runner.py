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
    compute_groundedness,
    create_provider,
    validate_provider,
)


METRIC_NAMES: tuple[str, str, str] = (
    "Context Relevance",
    "Answer Relevance",
    "Groundedness",
)


def _build_dashboard_metrics(provider: object) -> list[object]:
    """Create TruLens metrics so RAG Triad appears in dashboard UI."""
    try:
        from trulens.core import Metric, Selector
    except ImportError:
        from trulens.core import Feedback as Metric, Selector

    from trulens.otel.semconv.trace import SpanAttributes

    generation_output = Selector(
        span_type=SpanAttributes.SpanType.GENERATION,
        span_attribute=SpanAttributes.CALL.RETURN,
        match_only_if_no_ancestor_matched=True,
        ignore_none_values=True,
    )

    return [
        Metric(implementation=provider.context_relevance, name="Context Relevance")
        .on_input(arg="question")
        .on_context(arg="context", collect_list=False)
        .aggregate(np.mean),
        Metric(implementation=provider.relevance, name="Answer Relevance").on(
            {
                "prompt": Selector.select_record_input(),
                "response": generation_output,
            }
        ),
        Metric(
            implementation=provider.groundedness_measure_with_cot_reasons,
            name="Groundedness",
        ).on(
            {
                "source": Selector.select_context(collect_list=True),
                "statement": generation_output,
            }
        ),
    ]


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
        chunks, answer = pipeline.query(question)

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
                result["groundedness"] = compute_groundedness(provider, answer, chunks)

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

    dashboard_metrics = _build_dashboard_metrics(provider)
    print(f"[INFO] Dashboard metrics ready: {', '.join(METRIC_NAMES)}")

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

            # OTel feedback computation can complete asynchronously.
            # Trigger and wait here so dashboard leaderboard has final metric values.
            try:
                tru_app.compute_feedbacks(raise_error_on_no_feedbacks_computed=False)
                session = session or getattr(tru_app, "session", None)
                if session is not None:
                    mode_records = session.get_records_and_feedback(
                        app_name="LightRAG-Evaluation",
                        app_versions=[mode],
                    )[0]
                    mode_record_ids = (
                        mode_records["record_id"].dropna().astype(str).tolist()
                        if "record_id" in mode_records.columns
                        else []
                    )
                    if mode_record_ids:
                        session.wait_for_feedback_results(
                            record_ids=mode_record_ids,
                            feedback_names=list(METRIC_NAMES),
                            timeout=180,
                        )
            except Exception as exc:
                warnings.warn(
                    f"[WARN] Feedback finalization incomplete for mode={mode}: {exc}"
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
