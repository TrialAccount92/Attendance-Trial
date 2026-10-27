#!/usr/bin/env bash
# Starts the AttendPulse API on http://localhost:8000 (creates a virtualenv on first run).
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"
export PATH="$HOME/.local/bin:$PATH"

if command -v uv &> /dev/null; then
    [ -d ".venv" ] || uv venv --python 3.10 .venv
    uv pip install --python .venv/bin/python -q -r requirements.txt
elif command -v python3 &> /dev/null; then
    [ -d ".venv" ] || python3 -m venv .venv
    .venv/bin/python -m pip install -q -r requirements.txt
else
    echo "[Error] python3 or uv not found. Please install Python 3.10+."
    exit 1
fi

exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
