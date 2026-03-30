"""
save_prompts.py
---------------
Standalone script to extract and save all TruLens evaluation prompts
to evaluation_prompts.json WITHOUT running any evaluations.

Usage:
    python save_prompts.py

The output file can be reviewed to understand exactly what criteria
TruLens uses when scoring Groundedness, Answer Relevance, and Context
Relevance.
"""

import importlib
import inspect
import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OUTPUT_FILE = Path(__file__).parent / "evaluation_prompts.json"


def collect_prompts() -> dict:
    from trulens.providers.openai import OpenAI as TruOpenAI

    provider = TruOpenAI(model_engine=OPENAI_MODEL, api_key=OPENAI_API_KEY)

    result: dict = {}

    # ── 1. Static metric descriptions ────────────────────────────────────────
    result["metric_descriptions"] = {
        "Groundedness": {
            "description": (
                "Checks whether every factual statement in the generated answer "
                "is supported by the retrieved context.  A low score means the "
                "model hallucinated information that is not present in the source "
                "material.  Uses Chain-of-Thought (CoT) reasoning and also "
                "considers whether the question is even answerable from the "
                "provided context."
            ),
            "trulens_method": (
                "provider.groundedness_measure_with_cot_reasons"
                "_consider_answerability"
            ),
            "input_selectors": {
                "source": "Selector.select_context(collect_list=True)  "
                          "→ list of all retrieved context strings",
                "statement": "Selector.select_record_output()  "
                             "→ the generated answer",
                "question": "Selector.select_record_input()  "
                            "→ the original question",
            },
            "score_range": "0.0 – 1.0  (higher is better)",
        },
        "Answer Relevance": {
            "description": (
                "Checks whether the generated answer directly addresses and is "
                "relevant to the original question.  A low score means the model "
                "produced an off-topic or tangential response.  Uses CoT "
                "reasoning."
            ),
            "trulens_method": "provider.relevance_with_cot_reasons",
            "input_selectors": {
                "prompt": "Selector.select_record_input()   → the question",
                "response": "Selector.select_record_output() → the answer",
            },
            "score_range": "0.0 – 1.0  (higher is better)",
        },
        "Context Relevance": {
            "description": (
                "Checks whether each individual retrieved context chunk is "
                "relevant to the question.  Evaluated per-chunk and then "
                "aggregated (mean).  A low score means retrieval is bringing in "
                "irrelevant material."
            ),
            "trulens_method": "provider.context_relevance_with_cot_reasons",
            "input_selectors": {
                "question": "Selector.select_record_input()             → the question",
                "context": "Selector.select_context(collect_list=False) → one chunk at a time",
            },
            "aggregation": "numpy.mean across all context chunks",
            "score_range": "0.0 – 1.0  (higher is better)",
        },
    }

    # ── 2. Provider instance attributes that contain prompt text ─────────────
    provider_attrs: dict = {}
    for name in dir(provider):
        if name.startswith("_"):
            continue
        val = getattr(provider, name, None)
        if isinstance(val, str) and len(val) > 20:
            provider_attrs[name] = val
    if provider_attrs:
        result["provider_prompt_attributes"] = provider_attrs

    # ── 3. Inspect method docstrings / source for metric methods ─────────────
    method_info: dict = {}
    for method_name in [
        "groundedness_measure_with_cot_reasons_consider_answerability",
        "groundedness_measure_with_cot_reasons",
        "relevance_with_cot_reasons",
        "context_relevance_with_cot_reasons",
        "comprehensiveness_with_cot_reasons",
        "coherence_with_cot_reasons",
    ]:
        method = getattr(provider, method_name, None)
        if method is None:
            continue
        info: dict = {}
        doc = inspect.getdoc(method)
        if doc:
            info["docstring"] = doc
        try:
            src_lines = inspect.getsourcelines(method)[0]
            # Collect string literals that look like prompts (long strings)
            prompt_lines = []
            for line in src_lines:
                stripped = line.strip()
                # Lines that are large quoted strings or triple-quoted strings
                if (
                    len(stripped) > 60
                    and (stripped.startswith('"') or stripped.startswith("'"))
                ):
                    prompt_lines.append(stripped)
            if prompt_lines:
                info["prompt_fragments"] = prompt_lines
        except (OSError, TypeError):
            pass
        if info:
            method_info[method_name] = info

    if method_info:
        result["method_details"] = method_info

    # ── 4. Scan known TruLens modules for prompt constants ───────────────────
    module_prompts: dict = {}
    for mod_path in [
        "trulens.feedback.prompts",
        "trulens.feedback.generated",
        "trulens.providers.openai",
        "trulens.core.feedback",
    ]:
        try:
            mod = importlib.import_module(mod_path)
        except ImportError:
            continue
        for name in dir(mod):
            if name.startswith("_"):
                continue
            val = getattr(mod, name, None)
            if isinstance(val, str) and len(val) > 30:
                module_prompts[f"{mod_path}::{name}"] = val

    if module_prompts:
        result["module_constants"] = module_prompts

    # ── 5. Runtime configuration ──────────────────────────────────────────────
    result["runtime_configuration"] = {
        "evaluation_model": OPENAI_MODEL,
        "provider_class": "trulens.providers.openai.OpenAI",
        "retrieval_modes": ["local", "global", "hybrid", "mix", "naive"],
        "notes": (
            "TruLens sends the prompts above to the evaluation LLM "
            f"({OPENAI_MODEL}) to score each RAG response.  "
            "Scores are floating-point values in [0, 1]."
        ),
    }

    return result


def main() -> None:
    print("[INFO] Collecting TruLens evaluation prompts …")

    # Start from the pre-built baseline (already contains all prompts from
    # the TruLens source code). merge any additional runtime-extracted data.
    existing: dict = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            try:
                existing = json.load(f)
            except json.JSONDecodeError:
                pass

    live_prompts = collect_prompts()

    # Deep-merge: live data enriches/overwrites existing keys
    merged = {**existing, **live_prompts}
    # Preserve baseline keys not present in live extraction
    for k, v in existing.items():
        if k not in merged:
            merged[k] = v

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"[INFO] Saved to: {OUTPUT_FILE}")
    print(f"       Sections: {list(merged.keys())}")

    total_chars = sum(len(str(v)) for v in merged.values())
    print(f"       Approx size: {total_chars:,} characters")


if __name__ == "__main__":
    main()
