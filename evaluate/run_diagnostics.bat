@echo off
cd /d "E:\TaiLieu\Master's\Semeter 1\ML and Algorithms\project\evaluate"

echo === Section 1: TruLens Version and Modules ===
py -c "import trulens; print('trulens version:', trulens.__version__)"
py -c "import trulens.core; print(dir(trulens.core))"
py -c "from trulens.core import Metric, Selector; print('Metric/Selector OK')"
py -c "from trulens.core.otel.instrument import instrument; print('instrument OK')"
py -c "from trulens.otel.semconv.trace import SpanAttributes; print('SpanAttributes OK'); print(dir(SpanAttributes.SpanType)); print(dir(SpanAttributes.RETRIEVAL))"
py -c "from trulens.apps.app import TruApp; print('TruApp OK')"
py -c "from trulens.providers.openai import OpenAI as TruOpenAI; p = TruOpenAI.__new__(TruOpenAI); print([x for x in dir(p) if 'groundedness' in x.lower() or 'relevance' in x.lower() or 'context' in x.lower()])"

echo.
echo === Section 2: Syntax Error Checks ===
py -m py_compile config.py && echo config OK || echo config FAILED
py -m py_compile client.py && echo client OK || echo client FAILED
py -m py_compile evaluator.py && echo evaluator OK || echo evaluator FAILED
py -m py_compile metrics.py && echo metrics OK || echo metrics FAILED
py -m py_compile runner.py && echo runner OK || echo runner FAILED
py -m py_compile reporting.py && echo reporting OK || echo reporting FAILED
py -m py_compile evaluate_trulens.py && echo main OK || echo main FAILED

echo.
echo === Section 3: Import Tests ===
py -c "import sys; sys.path.insert(0, '.'); from config import LIGHTRAG_HOST; print('config import OK, LIGHTRAG_HOST=', LIGHTRAG_HOST)"
py -c "import sys; sys.path.insert(0, '.'); from client import LightRAGClient; print('client import OK')"
py -c "import sys; sys.path.insert(0, '.'); from evaluator import LightRAGEvaluator; print('evaluator import OK')"
py -c "import sys; sys.path.insert(0, '.'); from metrics import build_feedback_functions; print('metrics import OK')"
py -c "import sys; sys.path.insert(0, '.'); from runner import run_evaluation; print('runner import OK')"

pause
