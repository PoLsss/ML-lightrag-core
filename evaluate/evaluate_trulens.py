"""
TruLens Evaluation Pipeline for LightRAG - CLI entry point.

All business logic lives in dedicated modules:
  config.py     - environment / constants
  client.py     - LightRAG HTTP client
  evaluator.py  - plain RAGPipeline (no TruLens instrumentation)
  metrics.py    - direct provider metric computation
  runner.py     - per-mode, per-question evaluation loop
  reporting.py  - results persistence and terminal output

Usage:
    py evaluate_trulens.py                     # run full evaluation
    py evaluate_trulens.py --run               # same
    py evaluate_trulens.py --questions 5       # quick test (5 questions)
    py evaluate_trulens.py --mode local        # single mode
    py evaluate_trulens.py --mode local --mode global  # multiple modes
    py evaluate_trulens.py --dashboard         # open TruLens dashboard
    py evaluate_trulens.py --summary           # print last run summary
    py evaluate_trulens.py --clear             # reset TruLens database

Configuration (evaluate/.env):
    OPENAI_API_KEY      OpenAI key (required)
    OPENAI_MODEL        model name         (default: gpt-4o-mini)
    TRULENS_PORT        dashboard port     (default: 2602)
    LIGHTRAG_HOST       server URL         (default: http://localhost:9621)
    LIGHTRAG_USERNAME   login username (email, default: admin@example.com)
    LIGHTRAG_PASSWORD   login password      (default: 12345678)
"""

import argparse
import sys

from config import RETRIEVAL_MODES, TRULENS_PORT
from reporting import (
    print_previous_summary,
    print_summary,
    save_detailed_results,
    save_leaderboard_csv,
)
from runner import run_evaluation


# CLI

def _configure_console_output() -> None:
    """Use UTF-8 output when supported to avoid mojibake on Windows terminals."""
    try:
        reconfigure_stdout = getattr(sys.stdout, "reconfigure", None)
        if callable(reconfigure_stdout):
            reconfigure_stdout(encoding="utf-8", errors="replace")

        reconfigure_stderr = getattr(sys.stderr, "reconfigure", None)
        if callable(reconfigure_stderr):
            reconfigure_stderr(encoding="utf-8", errors="replace")
    except Exception:
        pass

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="TruLens Evaluation Pipeline for LightRAG",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--run", action="store_true", help="Run evaluation (default)")
    parser.add_argument("--dashboard", action="store_true", help="Open TruLens dashboard")
    parser.add_argument("--summary", action="store_true", help="Print last run summary")
    parser.add_argument("--clear", action="store_true", help="Reset TruLens database")
    parser.add_argument(
        "--mode",
        action="append",
        choices=RETRIEVAL_MODES,
        metavar="MODE",
        help=f"Retrieval mode (repeatable). Choices: {', '.join(RETRIEVAL_MODES)}",
    )
    parser.add_argument(
        "--questions",
        type=int,
        default=None,
        metavar="N",
        help="Limit to first N questions per mode (default: all)",
    )
    parser.add_argument(
        "--no-reset",
        action="store_true",
        help="Append to existing TruLens database instead of resetting it",
    )
    return parser.parse_args()


def _cmd_run(args: argparse.Namespace) -> None:
    modes = args.mode or None
    reset = not args.no_reset

    print("[INFO] Starting evaluation ...")
    if args.questions:
        print(f"[INFO] Limiting to {args.questions} questions per mode")
    if modes:
        print(f"[INFO] Modes: {', '.join(modes)}")
    else:
        print(f"[INFO] All modes: {', '.join(RETRIEVAL_MODES)}")

    result = run_evaluation(
        modes=modes,
        max_questions=args.questions,
        reset_db=reset,
    )

    save_detailed_results(result)
    if not result["leaderboard"].empty:
        save_leaderboard_csv(result["leaderboard"])
    print_summary(result)


def _cmd_dashboard() -> None:
    try:
        from trulens.core import TruSession
        from trulens.dashboard import run_dashboard
    except ImportError as exc:
        print(f"[ERROR] TruLens dashboard not available: {exc}")
        return

    session = TruSession()
    lb = session.get_leaderboard()
    if lb.empty:
        print("[WARNING] No evaluation data found in TruLens database.")
        print("[INFO] Running one bootstrap evaluation so dashboard has data ...")
        result = run_evaluation(modes=[RETRIEVAL_MODES[0]], max_questions=1, reset_db=False)
        save_detailed_results(result)
        if not result["leaderboard"].empty:
            save_leaderboard_csv(result["leaderboard"])
        lb = session.get_leaderboard()

        if lb.empty:
            print("[WARNING] Bootstrap run finished but leaderboard is still empty.")
            print("[INFO] Check LightRAG server and OPENAI_API_KEY, then run: py evaluate_trulens.py --run")
        else:
            print(f"[INFO] Bootstrap completed with {len(lb)} leaderboard records")
    else:
        print(f"[INFO] Found {len(lb)} leaderboard records")
        print(lb.to_string())

    print(f"\n[INFO] Dashboard -> http://localhost:{TRULENS_PORT}")
    run_dashboard(session, port=TRULENS_PORT)


def _cmd_clear() -> None:
    try:
        from trulens.core import TruSession
        TruSession().reset_database()
        print("[INFO] [OK] TruLens database cleared")
        print("[INFO]   Run: py evaluate_trulens.py --run  to start fresh")
    except ImportError as exc:
        print(f"[ERROR] TruLens not available: {exc}")


# Entry point

if __name__ == "__main__":
    _configure_console_output()
    args = _parse_args()

    if args.dashboard:
        _cmd_dashboard()
    elif args.summary:
        print_previous_summary()
    elif args.clear:
        _cmd_clear()
    else:
        _cmd_run(args)
