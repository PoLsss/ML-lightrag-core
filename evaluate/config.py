"""
Configuration loaded once at import time from evaluate/.env.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).parent / ".env"
load_dotenv(_ENV_PATH)

OPENAI_API_KEY: str = os.environ["OPENAI_API_KEY"]
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

LIGHTRAG_HOST: str = os.getenv("LIGHTRAG_HOST", "http://localhost:9621")
LIGHTRAG_USERNAME: str = os.getenv("LIGHTRAG_USERNAME", "admin@example.com")
LIGHTRAG_PASSWORD: str = os.getenv("LIGHTRAG_PASSWORD", "12345678")

TRULENS_PORT: int = int(os.getenv("TRULENS_PORT", "2602"))

RETRIEVAL_MODES: list[str] = ["local", "global", "hybrid", "mix", "naive"]
DEFAULT_TOP_K: int = 10
REQUEST_TIMEOUT: int = 120
MAX_RETRIES: int = 3

_EVAL_DIR = Path(__file__).parent
QUESTIONS_FILE = _EVAL_DIR / "evaluate_rag_system_100c_final.txt"
PROMPTS_OUTPUT_FILE = _EVAL_DIR / "evaluation_prompts.json"
RESULTS_OUTPUT_FILE = _EVAL_DIR / "evaluation_results.csv"
DETAILED_RESULTS_FILE = _EVAL_DIR / "evaluation_detailed_results.json"
