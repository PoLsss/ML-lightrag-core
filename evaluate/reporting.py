"""
Results persistence and terminal reporting.

All output concerns (file I/O and pretty-printing) live here.
No business logic; no API calls.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from config import DETAILED_RESULTS_FILE, RESULTS_OUTPUT_FILE


RAG_TRIAD_METRICS: tuple[str, str, str] = (
    "Context Relevance",
    "Answer Relevance",
    "Groundedness",
)


# File output

def save_detailed_results(
    evaluation_output: dict[str, Any],
    path: Path = DETAILED_RESULTS_FILE,
) -> None:
    """Write the full evaluation output (summary + per-question results) to JSON."""
    serialisable = {
        k: v
        for k, v in evaluation_output.items()
        if k not in ("leaderboard", "session")
    }
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(serialisable, fh, ensure_ascii=False, indent=2)
    print(f"[INFO] Detailed results saved -> {path}")


def save_leaderboard_csv(
    leaderboard: pd.DataFrame,
    path: Path = RESULTS_OUTPUT_FILE,
) -> None:
    """Write the leaderboard DataFrame to CSV."""
    leaderboard.to_csv(path, index=False)
    print(f"[INFO] Leaderboard saved -> {path}")


# Terminal output

def print_summary(evaluation_output: dict[str, Any]) -> None:
    """Print a human-readable evaluation summary to stdout."""
    summary = evaluation_output.get("summary", {})
    results = evaluation_output.get("results", [])
    leaderboard: pd.DataFrame = evaluation_output.get("leaderboard", pd.DataFrame())

    print(f"\n{'=' * 65}")
    print("  Evaluation Summary")
    print(f"{'=' * 65}")
    print(f"  Start      : {summary.get('start_time', 'N/A')}")
    print(f"  End        : {summary.get('end_time', 'N/A')}")
    print(f"  Modes      : {', '.join(summary.get('modes', []))}")
    print(f"  Questions  : {summary.get('total_questions', 0)} per mode")
    print(f"  Completed  : {summary.get('completed', 0)}")
    print(f"  Failed     : {summary.get('failed', 0)}")
    print(f"  Success    : {summary.get('success_rate', 0):.1f}%")

    print(f"\n{'-' * 65}")
    print("  Results by Mode")
    print(f"{'-' * 65}")
    for mode in summary.get("modes", []):
        mode_results = [r for r in results if r.get("mode") == mode]
        success = sum(1 for r in mode_results if r.get("status") == "success")
        print(f"  {mode.upper():8}  {success:>3}/{len(mode_results)}")

    if not leaderboard.empty:
        print(f"\n{'-' * 65}")
        print("  RAG Triad Leaderboard (mean scores by mode)")
        print(f"{'-' * 65}")
        print(leaderboard.to_string(index=False))
        print()
        print_metric_coverage(leaderboard)
    else:
        print("\n[WARNING] No leaderboard data - check that questions produced successful answers.")


def print_metric_coverage(leaderboard: pd.DataFrame) -> None:
    """Print the [OK]/[X] metric coverage table."""
    print(f"{'-' * 65}")
    print("  Metric Coverage")
    print(f"{'-' * 65}")

    for col in leaderboard.columns:
        non_null = leaderboard[col].notna().sum()
        total = len(leaderboard)
        pct = non_null / total * 100 if total > 0 else 0
        mark = "[OK]" if non_null > 0 else "[X]"
        print(f"  {mark} {col:.<40} {pct:>6.1f}% ({non_null}/{total})")

    missing: list[str] = []
    for metric in RAG_TRIAD_METRICS:
        if metric not in leaderboard.columns:
            missing.append(metric)
            continue
        if int(leaderboard[metric].notna().sum()) == 0:
            missing.append(metric)
    if missing:
        print(f"\n[WARNING] Missing RAG Triad data: {', '.join(missing)}")
        print("[INFO]    Possible causes:")
        print("          - Retrieved context was empty for all questions")
        print("          - LightRAG server returned error responses")


def print_previous_summary(detailed_results_path: Path = DETAILED_RESULTS_FILE) -> None:
    """Print summary from the last saved evaluation run."""
    print(f"{'=' * 65}")
    print("  Last Evaluation Results")
    print(f"{'=' * 65}")

    if not detailed_results_path.exists():
        print("[WARNING] No results file found.")
        print("[INFO]    Run: py evaluate_trulens.py --run")
        return

    with open(detailed_results_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    summary = data.get("summary", {})
    results = data.get("results", [])

    print(f"  Start      : {summary.get('start_time', 'N/A')}")
    print(f"  End        : {summary.get('end_time', 'N/A')}")
    print(f"  Modes      : {', '.join(summary.get('modes', []))}")
    print(f"  Questions  : {summary.get('total_questions', 0)} per mode")
    print(f"  Completed  : {summary.get('completed', 0)}")
    print(f"  Failed     : {summary.get('failed', 0)}")
    print(f"  Success    : {summary.get('success_rate', 0):.1f}%")

    print(f"\n{'-' * 65}")
    print("  Results by Mode")
    print(f"{'-' * 65}")
    for mode in summary.get("modes", []):
        mode_results = [r for r in results if r.get("mode") == mode]
        success = sum(1 for r in mode_results if r.get("status") == "success")
        cr = [r.get("context_relevance", 0) for r in mode_results if r.get("status") == "success"]
        ar = [r.get("answer_relevance", 0) for r in mode_results if r.get("status") == "success"]
        gr = [r.get("groundedness", 0) for r in mode_results if r.get("status") == "success"]
        import numpy as np
        if cr:
            print(
                f"  {mode.upper():8}  {success:>3}/{len(mode_results)}  "
                f"CR={np.mean(cr):.3f}  AR={np.mean(ar):.3f}  GR={np.mean(gr):.3f}"
            )
        else:
            print(f"  {mode.upper():8}  {success:>3}/{len(mode_results)}")
