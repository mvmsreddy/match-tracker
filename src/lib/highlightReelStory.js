/**
 * renderHighlightReelStory
 *
 * Draws a 1080×1920 (portrait, 9:16) canvas that mirrors the HighlightReelCard
 * content so a player can drop it straight into an Instagram / Reels / WhatsApp
 * Status Story. Returns a Blob (image/png) — the caller decides whether to
 * Web-Share or download it.
 *
 * Design language matches the app: dark editorial navy background, amber
 * accent, big display type. No external assets required — everything is
 * drawn from primitives so it also works offline.
 *
 * @param {object} data
 *   selfName, oppName, winnerName, isSelfWin, finalScore, durationLabel,
 *   pointsPlayed, longestWin, longestLoss, recap, tips (array of {text})
 * @returns {Promise<Blob>}
 */
export async function renderHighlightReelStory(data) {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // ─── Background ─────────────────────────────────────────────────────────
  ctx.fillStyle = '#050914';
  ctx.fillRect(0, 0, W, H);

  // Faint decorative court lines
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, 480, W - 160, H - 720);
  ctx.beginPath();
  ctx.moveTo(W / 2, 480);
  ctx.lineTo(W / 2, H - 240);
  ctx.stroke();

  // ─── Brand strip ────────────────────────────────────────────────────────
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TENNIS TRACKER PRO', 80, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('MATCH HIGHLIGHT', 80, 172);

  // ─── Winner headline ────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.fillStyle = data.isSelfWin ? '#f59e0b' : '#ffffff';
  ctx.font = 'bold 110px "Playfair Display", Georgia, serif';
  drawWrap(ctx, `${data.winnerName} wins`, 80, 320, W - 160, 105);

  // vs subline
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${data.selfName}  vs  ${data.oppName}`, 80, 470);

  // ─── Score ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 130px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  const scoreText = data.finalScore || '—';
  const scoreFont = fitFontSize(ctx, scoreText, W - 240, 130, 'bold', '"Playfair Display", Georgia, serif');
  ctx.font = `bold ${scoreFont}px "Playfair Display", Georgia, serif`;
  ctx.fillText(scoreText, W / 2, 700);

  // Duration + points meta
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '28px monospace';
  const meta = [data.durationLabel, `${data.pointsPlayed || 0} points`].filter(Boolean).join('  ·  ');
  ctx.fillText(meta, W / 2, 760);

  // ─── Streak boxes ───────────────────────────────────────────────────────
  const boxTop = 850;
  const boxH = 260;
  const boxW = (W - 240) / 2;

  // Best run
  ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
  roundRect(ctx, 80, boxTop, boxW, boxH, 20);
  ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('BEST RUN', 110, boxTop + 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 128px "Playfair Display", Georgia, serif';
  ctx.fillText(String(data.longestWin || 0), 110, boxTop + 210);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('points won in a row', 110, boxTop + 245);

  // Tough patch
  const box2X = 80 + boxW + 40;
  ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
  roundRect(ctx, box2X, boxTop, boxW, boxH, 20);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('TOUGH PATCH', box2X + 30, boxTop + 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 128px "Playfair Display", Georgia, serif';
  ctx.fillText(String(data.longestLoss || 0), box2X + 30, boxTop + 210);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('points lost in a row', box2X + 30, boxTop + 245);

  // ─── Recap ──────────────────────────────────────────────────────────────
  const recapTop = 1180;
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('AI COACH RECAP', 80, recapTop);

  if (data.recap) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 34px Georgia, serif';
    drawWrap(ctx, `"${data.recap.trim()}"`, 80, recapTop + 60, W - 160, 46, 8);
  }

  // ─── Watermark ──────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('tennis-tracker.app', W / 2, H - 90);
  ctx.fillStyle = 'rgba(245,158,11,0.7)';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('EVERY POINT. EVERY INSIGHT.', W / 2, H - 55);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}

// ─── Canvas helpers ───────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text).split(/\s+/);
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = words[i];
      lines += 1;
      if (lines >= maxLines - 1) {
        // last line — draw with ellipsis if remaining wouldn't fit
        let tail = line + ' ' + words.slice(i + 1).join(' ');
        while (ctx.measureText(tail + '…').width > maxWidth && tail.length > 0) {
          tail = tail.slice(0, -1);
        }
        ctx.fillText(tail + (words.length - i > 1 ? '…' : ''), x, y);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function fitFontSize(ctx, text, maxWidth, startSize, weight, family) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > 40) {
    size -= 6;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}
