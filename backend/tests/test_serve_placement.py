"""Iteration 13 backend tests.

Module: /api/advisor/tip  -> must include a serve placement zone (WIDE/T/BODY)
                             when game_state says the player is serving.
Regression: /api/advisor/highlight-reel, /api/nutrition/suggest streaming,
            /api/health advisor_ready flag.
"""

import os
import re

import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or "https://0e360100-eae9-4867-811b-c1ce9b3f6a38.preview.emergentagent.com"
).rstrip("/")

TIP = f"{BASE_URL}/api/advisor/tip"
REEL = f"{BASE_URL}/api/advisor/highlight-reel"
NUTRITION = f"{BASE_URL}/api/nutrition/suggest"
HEALTH = f"{BASE_URL}/api/health"

ZONE_RE = re.compile(r"\b(WIDE|T|BODY)\b", re.IGNORECASE)


def _stream_text(url, payload, timeout=120):
    r = requests.post(
        url,
        json=payload,
        stream=True,
        timeout=timeout,
        headers={"Accept": "text/event-stream", "Content-Type": "application/json"},
    )
    assert r.status_code == 200, f"{url} -> {r.status_code}: {r.text[:300]}"
    chunks = []
    done = False
    for raw in r.iter_lines(decode_unicode=True):
        if raw is None:
            continue
        if raw.startswith("data: "):
            data = raw[6:]
            if data.strip() == "[DONE]":
                done = True
                break
            chunks.append(data)
        elif raw.startswith("event: done"):
            done = True
    return "".join(chunks), done


# --- Serve placement suggestion -------------------------------------------

@pytest.mark.parametrize(
    "state",
    ["serving to the deuce court", "serving to the ad court"],
)
def test_serving_tip_contains_placement_zone(state):
    text, done = _stream_text(
        TIP,
        {
            "session_id": f"TEST_placement_{state.replace(' ', '_')}",
            "my_name": "Rohan",
            "opponent_name": "Aditya",
            "my_score": "30-30, 4-4",
            "game_state": state,
            "recent_form": "won last two points on first serve",
            "my_strengths": ["big first serve", "forehand"],
        },
    )
    assert done, "stream did not terminate with a done event"
    assert len(text.strip()) > 5, f"empty tip: {text!r}"
    m = ZONE_RE.search(text)
    assert m, f"no WIDE/T/BODY placement zone in tip: {text!r}"
    print(f"[{state}] zone={m.group(1)} tip={text.strip()}")


def test_receiving_tip_still_works():
    text, done = _stream_text(
        TIP,
        {
            "session_id": "TEST_placement_receiving",
            "game_state": "receiving at 30-40",
            "opponent_name": "Aditya",
        },
    )
    assert done
    assert len(text.strip()) > 5


def test_tip_validation_error():
    r = requests.post(TIP, json={"my_name": "Rohan"}, timeout=30)
    assert r.status_code == 422


# --- Regression -------------------------------------------------------------

def test_health_advisor_ready():
    r = requests.get(HEALTH, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get("advisor_ready") is True, data


def test_highlight_reel_still_streams():
    text, done = _stream_text(
        REEL,
        {
            "session_id": "TEST_iter13_reel",
            "my_name": "Rohan",
            "opponent_name": "Aditya",
            "i_won": True,
            "final_score": "6-4 6-3",
            "duration": "72 min",
            "points_played": 84,
            "longest_win_streak": 6,
            "longest_loss_streak": 3,
        },
    )
    assert done
    assert len(text.strip()) > 40, f"reel too short: {text!r}"


def test_nutrition_still_streams():
    text, done = _stream_text(
        NUTRITION,
        {
            "session_id": "TEST_iter13_nutrition",
            "context": "pre-match in 45 min",
            "minutes_until_match": 45,
            "day_type": "match",
        },
    )
    assert done
    assert len(text.strip()) > 40, f"nutrition too short: {text!r}"
