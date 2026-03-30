#!/usr/bin/env python3
"""Run diagnostics for TruLens and evaluate modules."""

import subprocess
import sys

def run_cmd(cmd, description=""):
    """Run a command and print output."""
    if description:
        print(f"\n>>> {description}")
    print(f"    Command: {cmd}")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        if result.stdout:
            print("    OUTPUT:")
            for line in result.stdout.strip().split('\n'):
                print(f"      {line}")
        if result.stderr:
            print("    STDERR:")
            for line in result.stderr.strip().split('\n'):
                print(f"      {line}")
        if result.returncode != 0:
            print(f"    EXIT CODE: {result.returncode}")
    except Exception as e:
        print(f"    ERROR: {e}")

print("=" * 70)
print("PYTHON DIAGNOSTICS FOR TRULENS AND EVALUATE MODULES")
print("=" * 70)

# Section 1: TruLens Version and Modules
print("\n" + "=" * 70)
print("SECTION 1: TruLens Version and Modules")
print("=" * 70)

run_cmd("py -c \"import trulens; print('trulens version:', trulens.__version__)\"", 
        "Check TruLens version")

run_cmd("py -c \"import trulens.core; print(dir(trulens.core))\"",
        "List trulens.core contents")

run_cmd("py -c \"from trulens.core import Metric, Selector; print('Metric/Selector OK')\"",
        "Check Metric and Selector imports")

run_cmd("py -c \"from trulens.core.otel.instrument import instrument; print('instrument OK')\"",
        "Check instrument import")

run_cmd("py -c \"from trulens.otel.semconv.trace import SpanAttributes; print('SpanAttributes OK'); print(dir(SpanAttributes.SpanType)); print(dir(SpanAttributes.RETRIEVAL))\"",
        "Check SpanAttributes")

run_cmd("py -c \"from trulens.apps.app import TruApp; print('TruApp OK')\"",
        "Check TruApp import")

run_cmd("py -c \"from trulens.providers.openai import OpenAI as TruOpenAI; p = TruOpenAI.__new__(TruOpenAI); print([x for x in dir(p) if 'groundedness' in x.lower() or 'relevance' in x.lower() or 'context' in x.lower()])\"",
        "Check TruOpenAI methods")

# Section 2: Syntax Error Checks
print("\n" + "=" * 70)
print("SECTION 2: Syntax Error Checks")
print("=" * 70)

for module in ["config", "client", "evaluator", "metrics", "runner", "reporting", "evaluate_trulens"]:
    run_cmd(f"py -m py_compile {module}.py", f"Compile {module}.py")

# Section 3: Import Tests
print("\n" + "=" * 70)
print("SECTION 3: Import Tests")
print("=" * 70)

run_cmd("py -c \"import sys; sys.path.insert(0, '.'); from config import LIGHTRAG_HOST; print('config import OK, LIGHTRAG_HOST=', LIGHTRAG_HOST)\"",
        "Test config import")

run_cmd("py -c \"import sys; sys.path.insert(0, '.'); from client import LightRAGClient; print('client import OK')\"",
        "Test client import")

run_cmd("py -c \"import sys; sys.path.insert(0, '.'); from evaluator import LightRAGEvaluator; print('evaluator import OK')\"",
        "Test evaluator import")

run_cmd("py -c \"import sys; sys.path.insert(0, '.'); from metrics import build_feedback_functions; print('metrics import OK')\"",
        "Test metrics import")

run_cmd("py -c \"import sys; sys.path.insert(0, '.'); from runner import run_evaluation; print('runner import OK')\"",
        "Test runner import")

print("\n" + "=" * 70)
print("DIAGNOSTICS COMPLETE")
print("=" * 70)
