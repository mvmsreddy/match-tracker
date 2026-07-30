"""Backend API tests for Tennis Tracker Pro minimal FastAPI backend.

Modules covered:
  - /api/health          (readiness flags)
  - /api/advisor/tip     (SSE streaming LLM tactical tip)
  - /api/digest/send     (Resend email; intentionally unconfigured -> 503)
"""

import os

import pytest
import requests
from dotenv import dotenv_values

_env = dotenv_values("/app/memory/.env") or {}
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("VITE_BACKEND_URL")
    or "https://0e360100-eae9-4867-811b-c1ce9b3f6a38.preview.emergentagent.com"
).rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Health ---------------------------------------------------------------
class TestHealth:
    def test_health_ok(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/health", timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["status"] == "ok"
        assert d["advisor_ready"] is True
        assert d["digest_ready"] is False


# --- Live Advisor (SSE) ---------------------------------------------------
class TestAdvisorTip:
    def _stream(self, payload, timeout=90):
        r = requests.post(
            f"{BASE_URL}/api/advisor/tip",
            json=payload,
            stream=True,
            timeout=timeout,
            headers={"Accept": "text/event-stream"},
        )
        chunks = []
        for raw in r.iter_lines(decode_unicode=True):
            chunks.append(raw if raw is not None else "")
        return r, "\n".join(chunks)

    def test_advisor_stream_format_and_content(self):
        payload = {
            "session_id": "TEST_advisor_1",
            "my_score": "40-30, 5-4",
            "game_state": "serving",
            "opponent_name": "TEST_Rival",
        }
        r, body = self._stream(payload)
        assert r.status_code == 200, body[:300]
        assert "text/event-stream" in r.headers.get("content-type", "")
        assert "event: error" not in body, f"stream error: {body[:500]}"
        assert "event: done" in body and "[DONE]" in body, body[:500]

        text = "".join(
            line[len("data: "):]
            for line in body.split("\n")
            if line.startswith("data: ") and line.strip() != "data: [DONE]"
        ).strip()
        assert len(text) > 10, f"tip too short: {text!r}"
        assert len(text.split()) <= 40, f"tip not short/punchy: {text!r}"

    def test_advisor_minimal_body(self):
        r, body = self._stream({"session_id": "TEST_advisor_2"})
        assert r.status_code == 200
        assert "event: done" in body
        assert "event: error" not in body

    def test_advisor_missing_session_id_returns_422(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/advisor/tip", json={"my_score": "0-0"}, timeout=30)
        assert r.status_code == 422, r.text[:300]


# --- Digest (not configured) ---------------------------------------------
class TestDigest:
    def test_digest_send_not_configured(self, api_client):
        payload = {
            "recipient_email": "test_qa@example.com",
            "player_name": "TEST_Player",
            "stats": {"matches_played": 3, "matches_won": 2, "matches_lost": 1, "streak_days": 4},
        }
        r = api_client.post(f"{BASE_URL}/api/digest/send", json=payload, timeout=30)
        assert r.status_code == 503, r.text[:300]
        assert "not configured" in r.json().get("detail", "").lower()

    def test_digest_invalid_email_returns_422(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/digest/send",
            json={"recipient_email": "not-an-email", "player_name": "X", "stats": {}},
            timeout=30,
        )
        assert r.status_code == 422, r.text[:300]

    def test_digest_missing_body_returns_422(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/digest/send", json={}, timeout=30)
        assert r.status_code == 422
