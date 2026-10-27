"""Shared test setup: a fresh temporary database for the whole test run."""
from __future__ import annotations

import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["DATABASE_PATH"] = os.path.join(_tmp, "test.db")
sys.path.insert(0, os.path.dirname(__file__))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def server():
    with TestClient(app) as c:
        yield c


def login(server, identifier, password, role=None) -> TestClient:
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"identifier": identifier, "password": password, "role": role})
    assert r.status_code == 200, r.text
    return c
