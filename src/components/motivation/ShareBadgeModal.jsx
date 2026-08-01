import { useEffect, useRef, useState } from 'react';
import {
  Trophy, Award, Zap, Flame, Shield, Target, Star, Crown,
  Dumbbell, Sparkles, TrendingUp, X, Download, Share2, Loader2,
} from 'lucide-react';

const ICONS = {
  trophy: Trophy, award: Award, zap: Zap, flame: Flame, shield: Shield,
  target: Target, star: Star, crown: Crown, dumbbell: Dumbbell,
  sparkles: Sparkles, 'trending-up': TrendingUp,
};

// Instagram Story canvas is 1080x1920 (9:16). We render an SVG at that size
// then rasterize it to a data URL on demand — no third-party dep, no
// html2canvas, works offline.
function buildShareSvg({ title, desc, playerName, unlockedAt, iconKey }) {
  const dateStr = unlockedAt
    ? new Date(unlockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // We inline a Lucide-shaped icon path per key. Since Lucide paths are
  // trivial to describe here we just use a filled trophy motif for all —
  // the badge design carries the identity via title + colour, not micro-icons.
  const iconPaths = {
    trophy: 'M8 21h8m-4-4v4M6 4h12v4a6 6 0 0 1-12 0V4Zm-2 0h2v3H4a2 2 0 0 1 0-4h0m16 4h-2V4h2a2 2 0 0 1 0 4Z',
    flame:  'M12 22c4.4 0 8-3.1 8-7.5 0-3-3-6.5-8-12.5-5 6-8 9.5-8 12.5C4 18.9 7.6 22 12 22Z',
    crown:  'M2 8l4 8h12l4-8-6 4-4-8-4 8-6-4Zm4 12h12',
    star:   'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z',
    target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
    zap:    'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
    award:  'M8 21h8m-4-4v4M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z',
    dumbbell:'M6 4v16M18 4v16M6 12h12M2 8v8M22 8v8',
    sparkles:'M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2Zm7 12l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z',
    'trending-up':'M3 17l6-6 4 4 8-8m0 0h-5m5 0v5',
  };
  const icon = iconPaths[iconKey] || iconPaths.trophy;

  // Escape helper for user-controlled strings
  const esc = s => String(s || '').replace(/[<>&"']/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050914"/>
      <stop offset="40%" stop-color="#0a1128"/>
      <stop offset="100%" stop-color="#111a3d"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fde68a"/>
      <stop offset="50%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="rgba(245,158,11,0.35)"/>
      <stop offset="100%" stop-color="rgba(245,158,11,0)"/>
    </radialGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.04 0"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect width="1080" height="1920" filter="url(#grain)" opacity="0.6"/>

  <!-- Court motif -->
  <g fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.08">
    <rect x="120" y="140" width="840" height="1640"/>
    <line x1="120" y1="960" x2="960" y2="960"/>
    <line x1="540" y1="140" x2="540" y2="1780" stroke-dasharray="10 10"/>
  </g>

  <!-- Ambient glow -->
  <circle cx="540" cy="820" r="500" fill="url(#glow)"/>

  <!-- Brand -->
  <text x="540" y="180" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="24" letter-spacing="8" fill="#f59e0b" font-weight="700">TENNIS TRACKER PRO</text>
  <text x="540" y="220" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="14" letter-spacing="6" fill="#ffffff" opacity="0.4">ACHIEVEMENT UNLOCKED</text>

  <!-- Medal circle -->
  <g transform="translate(540 780)">
    <circle r="280" fill="rgba(255,255,255,0.03)" stroke="url(#gold)" stroke-width="4"/>
    <circle r="240" fill="rgba(245,158,11,0.08)" stroke="url(#gold)" stroke-width="2"/>
    <g transform="translate(-96 -96) scale(8)" fill="none" stroke="url(#gold)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="${icon}"/>
    </g>
  </g>

  <!-- Title -->
  <text x="540" y="1240" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="96" font-weight="900" fill="#ffffff" letter-spacing="-2">${esc(title)}</text>

  <!-- Description -->
  <text x="540" y="1320" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="36" fill="#ffffff" opacity="0.6">${esc(desc)}</text>

  <!-- Divider -->
  <rect x="440" y="1400" width="200" height="3" fill="url(#gold)"/>

  <!-- Player + date -->
  <text x="540" y="1480" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="42" font-weight="700" fill="#ffffff">${esc(playerName || 'A tennis player')}</text>
  <text x="540" y="1540" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="30" fill="#ffffff" opacity="0.5">${esc(dateStr)}</text>

  <!-- Footer -->
  <text x="540" y="1820" text-anchor="middle" font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="22" fill="#ffffff" opacity="0.35" letter-spacing="4">TRACKED WITH TENNIS TRACKER PRO</text>
</svg>`;
}

async function svgToPngDataUrl(svg, width = 1080, height = 1920) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => {
        if (!b) return reject(new Error('Could not render badge image'));
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, blob: b });
        reader.onerror = () => reject(new Error('Reader failed'));
        reader.readAsDataURL(b);
      }, 'image/png', 0.95);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG failed to load')); };
    img.src = url;
  });
}

export default function ShareBadgeModal({ badge, playerName, onClose }) {
  const [state, setState] = useState('loading'); // loading | ready | error
  const [dataUrl, setDataUrl] = useState('');
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState('');
  const cardRef = useRef(null);

  useEffect(() => {
    if (!badge) return;
    setState('loading');
    const svg = buildShareSvg({
      title: badge.title,
      desc: badge.desc,
      playerName,
      unlockedAt: badge.unlockedAt,
      iconKey: badge.icon,
    });
    svgToPngDataUrl(svg)
      .then(({ dataUrl, blob }) => {
        setDataUrl(dataUrl);
        setBlob(blob);
        setState('ready');
      })
      .catch(e => { setError(e.message); setState('error'); });
  }, [badge, playerName]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!badge) return null;

  async function handleShare() {
    if (!blob) return;
    const file = new File([blob], `tennistracker-${badge.id}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `I unlocked "${badge.title}" on Tennis Tracker Pro`,
          text: `${badge.desc} 🎾`,
        });
      } catch (_) { /* user cancelled */ }
    } else {
      // Fallback: download
      handleDownload();
    }
  }
  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `tennistracker-${badge.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5,9,20,0.85)' }}
      onClick={onClose}
      data-testid="share-badge-modal"
    >
      <div
        ref={cardRef}
        onClick={e => e.stopPropagation()}
        className="relative bg-card rounded-2xl shadow-2xl w-full max-w-[380px] overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          data-testid="share-badge-close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-4 pb-3">
          <div className="text-[12px] uppercase tracking-[0.25em] font-bold text-accent-ink">Share your badge</div>
          <div className="text-sm text-muted-foreground mt-0.5">Instagram Stories · 1080×1920</div>
        </div>

        <div className="px-4 pb-4">
          <div className="aspect-[9/16] rounded-xl overflow-hidden bg-slate-950 border border-border relative">
            {state === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}
            {state === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm p-4 text-center">{error}</div>
            )}
            {state === 'ready' && (
              <img
                src={dataUrl}
                alt={`${badge.title} badge`}
                className="w-full h-full object-cover"
                data-testid="share-badge-preview"
              />
            )}
          </div>
        </div>

        <div className="flex gap-2 p-4 pt-0">
          <button
            onClick={handleShare}
            disabled={state !== 'ready'}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]"
            data-testid="share-badge-share-btn"
          >
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button
            onClick={handleDownload}
            disabled={state !== 'ready'}
            className="h-11 px-4 rounded-xl bg-secondary text-foreground font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-muted disabled:opacity-50 transition-all active:scale-[0.98]"
            data-testid="share-badge-download-btn"
          >
            <Download className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
