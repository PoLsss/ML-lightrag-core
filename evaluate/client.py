"""
LightRAG HTTP client.

Authentication:
  - Login only via email/password at POST /login.
  - Token is cached and reused for all subsequent requests.

Two separate API calls per question:
  POST /query/data  → pure retrieval (no LLM).
                       Returns { "data": { "chunks": [...], "entities": [...], ... } }
  POST /query       → LLM generation.
                       Returns { "response": "<answer>" }
"""

from __future__ import annotations

import time
from typing import Any

import requests

from config import (
    LIGHTRAG_HOST,
    LIGHTRAG_PASSWORD,
    LIGHTRAG_USERNAME,
    MAX_RETRIES,
    REQUEST_TIMEOUT,
)


class LightRAGClient:
    """Thin HTTP client for the LightRAG server."""

    _shared_token: str | None = None

    def __init__(self) -> None:
        self._token: str | None = LightRAGClient._shared_token

    def _login(self) -> str:
        """Return a cached Bearer token, logging in via email/password."""
        cached_token = self._token
        if cached_token is not None:
            return cached_token
        resp = requests.post(
            f"{LIGHTRAG_HOST}/login",
            # OAuth2PasswordRequestForm: 'username' field = email
            data={"username": LIGHTRAG_USERNAME, "password": LIGHTRAG_PASSWORD},
            timeout=30,
        )
        resp.raise_for_status()
        token = resp.json().get("access_token")
        if not token:
            raise ValueError(
                f"Login to {LIGHTRAG_HOST}/login succeeded but no access_token in response. "
                "Check LIGHTRAG_USERNAME / LIGHTRAG_PASSWORD in evaluate/.env"
            )
        self._token = token
        LightRAGClient._shared_token = token
        return token

    def _auth_headers(self) -> dict[str, str]:
        """Return the bearer auth header."""
        return {"Authorization": f"Bearer {self._login()}"}

    def _post(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST to an endpoint with retry/back-off. Returns parsed JSON."""
        last_exc: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = requests.post(
                    f"{LIGHTRAG_HOST}{endpoint}",
                    json=payload,
                    headers=self._auth_headers(),
                    timeout=REQUEST_TIMEOUT,
                )
                if resp.status_code in (401, 403):
                    # token may be expired; clear and login once again
                    self._token = None
                    LightRAGClient._shared_token = None
                    resp = requests.post(
                        f"{LIGHTRAG_HOST}{endpoint}",
                        json=payload,
                        headers=self._auth_headers(),
                        timeout=REQUEST_TIMEOUT,
                    )
                resp.raise_for_status()
                return resp.json()
            except Exception as exc:
                last_exc = exc
                if attempt < MAX_RETRIES:
                    time.sleep(attempt)

        raise RuntimeError(
            f"LightRAG {endpoint} failed after {MAX_RETRIES} attempts: {last_exc}"
        )

    def retrieve(self, question: str, mode: str, top_k: int = 10) -> dict[str, Any]:
        """POST /query/data — pure retrieval, no LLM call."""
        return self._post(
            "/query/data", {"query": question, "mode": mode, "top_k": top_k}
        )

    def generate(self, question: str, mode: str, top_k: int = 10) -> dict[str, Any]:
        """POST /query — LLM generation, returns {"response": "<answer>"}."""
        return self._post(
            "/query",
            {"query": question, "mode": mode, "top_k": top_k, "stream": False},
        )

    @staticmethod
    def extract_chunks(
        data: dict[str, Any],
        max_entities: int = 5,
        max_relationships: int = 5,
    ) -> list[str]:
        """Extract plain-text context strings from POST /query/data response["data"].

        Args:
            data:              Parsed ``response["data"]`` from ``/query/data``.
            max_entities:      Maximum number of KG entity descriptions to include.
            max_relationships: Maximum number of KG relationship descriptions to include.
        """
        texts: list[str] = []

        for chunk in data.get("chunks") or []:
            content = (chunk.get("content") or "").strip()
            if content:
                texts.append(content)

        for entity in (data.get("entities") or [])[:max_entities]:
            desc = (entity.get("description") or "").strip()
            if desc:
                texts.append(desc)

        for rel in (data.get("relationships") or [])[:max_relationships]:
            desc = (rel.get("description") or "").strip()
            if desc:
                texts.append(desc)

        return texts

    @staticmethod
    def extract_entities(data: dict[str, Any], max_entities: int = 5) -> list[str]:
        """Extract up to *max_entities* entity description strings."""
        descs: list[str] = []
        for entity in (data.get("entities") or [])[:max_entities]:
            desc = (entity.get("description") or "").strip()
            if desc:
                descs.append(desc)
        return descs

    @staticmethod
    def extract_relationships(
        data: dict[str, Any], max_relationships: int = 5
    ) -> list[str]:
        """Extract up to *max_relationships* relationship description strings."""
        descs: list[str] = []
        for rel in (data.get("relationships") or [])[:max_relationships]:
            desc = (rel.get("description") or "").strip()
            if desc:
                descs.append(desc)
        return descs

    @staticmethod
    def extract_answer(response_data: dict[str, Any]) -> str:
        """Return the generated answer string from a POST /query response."""
        return response_data.get("response", "")
