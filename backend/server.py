# Tennis Tracker Pro — minimal FastAPI backend.
#
# This backend exists solely to proxy two external services:
#   1. POST /api/advisor/tip     -> LLM-generated real-time match tip
#      (Emergent-managed, no user credentials needed)
#   2. POST /api/digest/send     -> Resend-powered weekly digest email
#      (needs the user's Resend API key + verified sender)
#
# Everything else in the app is a pure Vite + localStorage frontend. There is
# no database on this side and no persistent state — every request is
# stateless. All routes are prefixed with /api so the platform ingress routes
# them to :8001.

import asyncio
import logging
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tennis-backend")

app = FastAPI(title="Tennis Tracker Pro API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Live Match Advisor — LLM tips during a tracked match
# ============================================================================

class AdvisorRequest(BaseModel):
    session_id: str
    my_name: Optional[str] = "Player"
    opponent_name: Optional[str] = "Opponent"
    my_score: Optional[str] = None       # e.g. "40-30, 5-4"
    game_state: Optional[str] = None     # "serving", "receiving", "tiebreak"
    recent_form: Optional[str] = None    # last 3-5 points summary
    my_strengths: Optional[list[str]] = None
    opponent_notes: Optional[str] = None


@app.post("/api/advisor/tip")
async def advisor_tip(req: AdvisorRequest):
    """Return a short (1-2 sentence) tactical tip, streamed via SSE.

    The frontend calls this from the in-match tracker whenever the player
    taps the "Get AI Tip" button. Streaming feels immediate even though the
    entire response is only ~30 tokens.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured on server")

    system_prompt = (
        "You are a world-class tennis coach whispering short tactical advice to a "
        "player between points. Rules: reply in ONE punchy sentence (max 22 words). "
        "Be concrete: 'serve wide to the ad court', 'come to the net on the second serve return'. "
        "Never explain — just direct. No hedging, no 'try to'."
    )

    # Compose the situational prompt
    parts = []
    if req.my_score:
        parts.append(f"Score: {req.my_score}.")
    if req.game_state:
        parts.append(f"You are {req.game_state}.")
    if req.opponent_name:
        parts.append(f"Opponent: {req.opponent_name}.")
    if req.recent_form:
        parts.append(f"Recent points: {req.recent_form}.")
    if req.my_strengths:
        parts.append(f"Your strengths: {', '.join(req.my_strengths)}.")
    if req.opponent_notes:
        parts.append(f"Opponent notes: {req.opponent_notes}.")
    if not parts:
        parts.append("You are mid-match and want a tactical nudge for the next point.")

    prompt = " ".join(parts) + " Give me the next-point plan."

    chat = LlmChat(
        api_key=api_key,
        session_id=req.session_id,
        system_message=system_prompt,
    ).with_model("anthropic", "claude-sonnet-4-6")

    async def event_stream():
        try:
            async for event in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(event, TextDelta):
                    # SSE format: single-line data event
                    yield f"data: {event.content}\n\n"
                elif isinstance(event, StreamDone):
                    yield "event: done\ndata: [DONE]\n\n"
                    break
        except Exception as e:  # noqa: BLE001
            logger.exception("Advisor tip stream failed")
            yield f"event: error\ndata: {str(e)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ============================================================================
# Weekly Digest Email — Resend
# ============================================================================

class DigestStats(BaseModel):
    matches_played: int = 0
    matches_won: int = 0
    matches_lost: int = 0
    practices: int = 0
    streak_days: int = 0
    top_skill: Optional[str] = None
    top_skill_rating: Optional[float] = None
    momentum_score: Optional[int] = None
    momentum_label: Optional[str] = None
    rank_snapshot: Optional[str] = None  # e.g. "U16 Doubles #63 (▲12)"
    achievements_unlocked: int = 0


class DigestEmailRequest(BaseModel):
    recipient_email: EmailStr
    player_name: str
    stats: DigestStats


def _digest_html(name: str, s: DigestStats) -> str:
    """Render a mobile-friendly, table-based HTML digest email."""
    win_rate = 0 if s.matches_played == 0 else round((s.matches_won / s.matches_played) * 100)
    rows = []
    if s.matches_played:
        rows.append(f"""
        <tr><td style="padding:10px 16px;border-bottom:1px solid #eee">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1.5px">Matches</div>
          <div style="font-size:22px;font-weight:800;color:#0a1128">{s.matches_won}W · {s.matches_lost}L</div>
          <div style="font-size:12px;color:#888">{win_rate}% win rate</div>
        </td></tr>""")
    if s.practices:
        rows.append(f"""
        <tr><td style="padding:10px 16px;border-bottom:1px solid #eee">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1.5px">Practice</div>
          <div style="font-size:22px;font-weight:800;color:#0a1128">{s.practices} session{'s' if s.practices != 1 else ''}</div>
        </td></tr>""")
    if s.streak_days:
        rows.append(f"""
        <tr><td style="padding:10px 16px;border-bottom:1px solid #eee">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1.5px">Streak</div>
          <div style="font-size:22px;font-weight:800;color:#f59e0b">{s.streak_days}-day active</div>
        </td></tr>""")
    if s.momentum_score is not None:
        rows.append(f"""
        <tr><td style="padding:10px 16px;border-bottom:1px solid #eee">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1.5px">Momentum</div>
          <div style="font-size:22px;font-weight:800;color:#0a1128">{s.momentum_score}/100 · {s.momentum_label or ''}</div>
        </td></tr>""")
    if s.top_skill and s.top_skill_rating:
        rows.append(f"""
        <tr><td style="padding:10px 16px;border-bottom:1px solid #eee">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1.5px">Top skill this week</div>
          <div style="font-size:22px;font-weight:800;color:#0a1128">{s.top_skill}</div>
          <div style="font-size:12px;color:#888">{s.top_skill_rating}/10 average</div>
        </td></tr>""")
    if s.rank_snapshot:
        rows.append(f"""
        <tr><td style="padding:10px 16px;border-bottom:1px solid #eee">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1.5px">Ranking</div>
          <div style="font-size:16px;font-weight:700;color:#0a1128">{s.rank_snapshot}</div>
        </td></tr>""")

    stats_table = "\n".join(rows) or """
        <tr><td style="padding:24px 16px;text-align:center;color:#888;font-size:14px">
          A quiet week — open the app and log one session to keep your streak alive.
        </td></tr>"""

    return f"""
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f7f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(10,17,40,0.08)">
        <tr><td style="background:linear-gradient(160deg,#050914,#0a1128 40%,#111a3d);padding:32px 24px;color:#fff">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#f59e0b;font-weight:700">Tennis Tracker Pro</div>
          <div style="font-size:28px;font-weight:800;margin-top:8px;letter-spacing:-0.5px">Your week, {name}</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-top:6px">A snapshot of every point you tracked.</div>
        </td></tr>
        {stats_table}
        <tr><td style="padding:24px 16px 8px 16px">
          <a href="#" style="display:inline-block;padding:14px 24px;background:#0a1128;color:#fff;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px">
            Open dashboard →
          </a>
        </td></tr>
        <tr><td style="padding:16px 16px 24px 16px;color:#aaa;font-size:11px">
          You are receiving this because you enabled the weekly digest in your profile. Reply STOP to opt out.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


@app.post("/api/digest/send")
async def send_digest(req: DigestEmailRequest):
    """Send the caller's weekly digest email via Resend.

    Frontend triggers this either from the Profile "Send now" button or from
    the Monday cron (see /app/scripts/send_monday_digests.py). Non-blocking:
    the Resend SDK is sync so we wrap it in asyncio.to_thread.
    """
    import resend

    resend_key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("SENDER_EMAIL")
    if not resend_key or not sender:
        raise HTTPException(
            status_code=503,
            detail="Weekly digest email is not configured. Ask an admin to set RESEND_API_KEY and SENDER_EMAIL.",
        )

    resend.api_key = resend_key
    params = {
        "from": sender,
        "to": [req.recipient_email],
        "subject": f"{req.player_name}, your tennis week in numbers",
        "html": _digest_html(req.player_name, req.stats),
    }
    try:
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "success", "email_id": email.get("id"), "to": req.recipient_email}
    except Exception as e:  # noqa: BLE001
        logger.exception("Resend send failed")
        raise HTTPException(status_code=500, detail=f"Failed to send digest: {str(e)}")


# ============================================================================
# Health
# ============================================================================

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "advisor_ready": bool(os.environ.get("EMERGENT_LLM_KEY")),
        "digest_ready": bool(os.environ.get("RESEND_API_KEY") and os.environ.get("SENDER_EMAIL")),
    }
