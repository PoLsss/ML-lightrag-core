@echo off
REM Change to evaluate directory
cd /d "E:\TaiLieu\Master's\Semeter 1\ML and Algorithms\project\evaluate"

REM Create a log file
set LOGFILE=diagnostics_output.txt
echo. > %LOGFILE%

REM ============================================================================
REM SECTION 1: TruLens Version and Modules
REM ============================================================================
echo. >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%
echo SECTION 1: TruLens Version and Modules >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%

echo. >> %LOGFILE%
echo [1.1] Check TruLens version >> %LOGFILE%
py -c "import trulens; print('trulens version:', trulens.__version__)" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [1.2] List trulens.core contents >> %LOGFILE%
py -c "import trulens.core; print(dir(trulens.core))" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [1.3] Check Metric and Selector imports >> %LOGFILE%
py -c "from trulens.core import Metric, Selector; print('Metric/Selector OK')" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [1.4] Check instrument import >> %LOGFILE%
py -c "from trulens.core.otel.instrument import instrument; print('instrument OK')" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [1.5] Check SpanAttributes >> %LOGFILE%
py -c "from trulens.otel.semconv.trace import SpanAttributes; print('SpanAttributes OK'); print('SpanType members:', dir(SpanAttributes.SpanType)); print('RETRIEVAL members:', dir(SpanAttributes.RETRIEVAL))" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [1.6] Check TruApp import >> %LOGFILE%
py -c "from trulens.apps.app import TruApp; print('TruApp OK')" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [1.7] Check TruOpenAI methods >> %LOGFILE%
py -c "from trulens.providers.openai import OpenAI as TruOpenAI; p = TruOpenAI.__new__(TruOpenAI); methods = [x for x in dir(p) if 'groundedness' in x.lower() or 'relevance' in x.lower() or 'context' in x.lower()]; print('Available methods:', methods)" >> %LOGFILE% 2>&1

REM ============================================================================
REM SECTION 2: Syntax Error Checks
REM ============================================================================
echo. >> %LOGFILE%
echo. >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%
echo SECTION 2: Syntax Error Checks >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%

echo. >> %LOGFILE%
echo [2.1] Compile config.py >> %LOGFILE%
py -m py_compile config.py >> %LOGFILE% 2>&1 && echo config.py OK >> %LOGFILE% || echo config.py FAILED >> %LOGFILE%

echo. >> %LOGFILE%
echo [2.2] Compile client.py >> %LOGFILE%
py -m py_compile client.py >> %LOGFILE% 2>&1 && echo client.py OK >> %LOGFILE% || echo client.py FAILED >> %LOGFILE%

echo. >> %LOGFILE%
echo [2.3] Compile evaluator.py >> %LOGFILE%
py -m py_compile evaluator.py >> %LOGFILE% 2>&1 && echo evaluator.py OK >> %LOGFILE% || echo evaluator.py FAILED >> %LOGFILE%

echo. >> %LOGFILE%
echo [2.4] Compile metrics.py >> %LOGFILE%
py -m py_compile metrics.py >> %LOGFILE% 2>&1 && echo metrics.py OK >> %LOGFILE% || echo metrics.py FAILED >> %LOGFILE%

echo. >> %LOGFILE%
echo [2.5] Compile runner.py >> %LOGFILE%
py -m py_compile runner.py >> %LOGFILE% 2>&1 && echo runner.py OK >> %LOGFILE% || echo runner.py FAILED >> %LOGFILE%

echo. >> %LOGFILE%
echo [2.6] Compile reporting.py >> %LOGFILE%
py -m py_compile reporting.py >> %LOGFILE% 2>&1 && echo reporting.py OK >> %LOGFILE% || echo reporting.py FAILED >> %LOGFILE%

echo. >> %LOGFILE%
echo [2.7] Compile evaluate_trulens.py >> %LOGFILE%
py -m py_compile evaluate_trulens.py >> %LOGFILE% 2>&1 && echo evaluate_trulens.py OK >> %LOGFILE% || echo evaluate_trulens.py FAILED >> %LOGFILE%

REM ============================================================================
REM SECTION 3: Import Tests
REM ============================================================================
echo. >> %LOGFILE%
echo. >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%
echo SECTION 3: Import Tests >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%

echo. >> %LOGFILE%
echo [3.1] Test config import >> %LOGFILE%
py -c "import sys; sys.path.insert(0, '.'); from config import LIGHTRAG_HOST; print('config import OK, LIGHTRAG_HOST=', LIGHTRAG_HOST)" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [3.2] Test client import >> %LOGFILE%
py -c "import sys; sys.path.insert(0, '.'); from client import LightRAGClient; print('client import OK')" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [3.3] Test evaluator import >> %LOGFILE%
py -c "import sys; sys.path.insert(0, '.'); from evaluator import LightRAGEvaluator; print('evaluator import OK')" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [3.4] Test metrics import >> %LOGFILE%
py -c "import sys; sys.path.insert(0, '.'); from metrics import build_feedback_functions; print('metrics import OK')" >> %LOGFILE% 2>&1

echo. >> %LOGFILE%
echo [3.5] Test runner import >> %LOGFILE%
py -c "import sys; sys.path.insert(0, '.'); from runner import run_evaluation; print('runner import OK')" >> %LOGFILE% 2>&1

REM ============================================================================
REM Done
REM ============================================================================
echo. >> %LOGFILE%
echo. >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%
echo DIAGNOSTICS COMPLETE >> %LOGFILE%
echo ============================================================================ >> %LOGFILE%

REM Display the log file
type %LOGFILE%
