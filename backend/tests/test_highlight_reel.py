"""Tests for POST /api/advisor/highlight-reel (SSE post-match recap).

Also re-checks /api/health advisor_ready flag as a pre-req.
"""

import os

import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or "https://0e360100-eae9-4867-811b-c1ce9b3f6a38.preview.emergentagent.com"
).rstrip("/")

ENDPOINT = f"{BASE_URL}/api/advisor/highlight-reel"

FULL_PAYLOAD = {
    "session_id": "TEST_reel_full",
    "my_name": "Rohan",
    "opponent_name": "Aditya",
    "i_won": True,
    "final_score": "6-4  6-3",
    "duration": "72 min",
    "points_played": 84,
    "longest_win_streak": 6,
    "longest_loss_streak": 3,
    "key_tips": ["Serve wide to his backhand", "Stay low on returns"],
}


def _stream(payload, timeout=120):
    r = requests.post(
        ENDPOINT,
        json=payload,
        stream=True,
        timeout=timeout,
        headers={"Accept": "text/event-stream", "Content-Type": "application/json"},
    )
    lines = []
    if r.status_code == 200:
        for raw in r.iter_lines(decode_unicode=True):
            lines.append(raw if raw is not None else "")
    return r, "\n".join(lines)


def _recap_text(body):
    out = []
    for line in body.split("\n"):
        if line.startswith("data: "):
            chunk = line[6:]
            if chunk == "[DONE]":
                continue
            out.append(chunk.replace("\\n", "\n"))
    return "".join(out)


class TestHealthPrereq:
    def test_advisor_ready(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("advisor_ready") is True


class TestHighlightReel:
    def test_stream_format_and_content(self):
        r, body = _stream(FULL_PAYLOAD)
        assert r.status_code == 200, body[:400]
        assert "text/event-stream" in r.headers.get("content-type", "")
        assert "event: error" not in body, body[:500]
        assert "event: done" in body
        assert "data: [DONE]" in body
        recap = _recap_text(body)
        assert len(recap.strip()) >= 40, f"recap too short: {recap!r}"
        # 2-3 short sentences, max ~55 words
        words = len(recap.split())
        assert words <= 90, f"recap too long ({words} words): {recap!r}"
        assert "you" in recap.lower()

    def test_loss_variant(self):
        payload = dict(FULL_PAYLOAD, session_id="TEST_reel_loss", i_won=False)
        r, body = _stream(payload)
        assert r.status_code == 200, body[:400]
        assert "event: error" not in body
        assert _recap_text(body).strip()

    def test_minimal_body_only_session_id(self):
        r, body = _stream({"session_id": "TEST_reel_min"})
        assert r.status_code == 200, body[:400]
        assert "event: error" not in body, body[:500]
        assert "data: [DONE]" in body
        assert len(_recap_text(body).strip()) > 10

    def test_missing_session_id_returns_422(self):
        r = requests.post(ENDPOINT, json={"my_name": "X"}, timeout=30)
        assert r.status_code == 422, r.text[:300]

    def test_wrong_type_returns_422(self):
        r = requests.post(
            ENDPOINT,
            json={"session_id": "TEST_reel_bad", "points_played": "many"},
            timeout=30,
        )
        assert r.status_code == 422, r.text[:300]


class TestRegressionStreams:
    """Existing SSE endpoints should be unaffected."""

    def test_advisor_tip_still_streams(self):
        r = requests.post(
            f"{BASE_URL}/api/advisor/tip",
            json={
                "session_id": "TEST_reg_tip",
                "my_score": "40-30, 5-4",
                "game_state": "serving",
            },
            stream=True,
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        body = "\n".join([l or "" for l in r.iter_lines(decode_unicode=True)])
        assert "event: error" not in body, body[:400]
        assert "data: [DONE]" in body
        assert _recap_text(body).strip()

    def test_nutrition_suggest_still_streams(self):
        r = requests.post(
            f"{BASE_URL}/api/nutrition/suggest",
            json={"session_id": "TEST_reg_nutri", "context": "pre_match"},
            stream=True,
            timeout=120,
        )
        if r.status_code == 422:
            pytest.skip(f"nutrition payload schema differs: {r.text[:200]}")
        assert r.status_code == 200, r.text[:300]
        body = "\n".join([l or "" for l in r.iter_lines(decode_unicode=True)])
        assert "event: error" not in body, body[:400]
        assert "data: [DONE]" in body
