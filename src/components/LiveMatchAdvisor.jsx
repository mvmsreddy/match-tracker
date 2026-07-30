import { useRef, useState } from 'react';
import { Card } from '@/components/primitives/card';
import { Sparkles, Loader2, RefreshCw, Zap } from 'lucide-react';

/**
 * LiveMatchAdvisor — a small floating panel inside the in-match tracker that
 * asks the backend LLM for a one-sentence tactical tip based on the current
 * match state, and streams the reply token-by-token via SSE.
 *
 * Everything is stateless per call; no chat history — the coach voice is
 * defined server-side in the system prompt.
 */
export default function LiveMatchAdvisor({ matchContext }) {
  const [tip, setTip] = useState('');
  const [status, setStatus] = useState('idle'); // idle | streaming | done | error
  const [error, setError] = useState('');
  const readerRef = useRef(null);

  async function fetchTip() {
    setTip('');
    setError('');
    setStatus('streaming');

    const controller = new AbortController();
    readerRef.current = controller;
    try {
      const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL
        || import.meta.env.REACT_APP_BACKEND_URL
        || window.location.origin;
      const res = await fetch(`${backendUrl}/api/advisor/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchContext || {}),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Advisor unavailable (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // Read SSE stream line-by-line
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: done')) { setStatus('done'); return; }
          if (line.startsWith('event: error')) { throw new Error('LLM error'); }
          if (line.startsWith('data: ')) {
            const chunk = line.slice(6);
            if (chunk === '[DONE]') { setStatus('done'); return; }
            setTip(prev => prev + chunk);
          }
        }
      }
      setStatus('done');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not reach advisor');
      setStatus('error');
    } finally {
      readerRef.current = null;
    }
  }

  const busy = status === 'streaming';
  const hasTip = tip.length > 0;

  return (
    <Card
      className="relative overflow-hidden border-l-4 border-l-primary bg-primary/5"
      data-testid="live-advisor-card"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">AI Coach</div>
            <div className="text-sm font-bold">Next-point plan</div>
          </div>
          {!busy && (
            <button
              onClick={fetchTip}
              className="rounded-full bg-primary text-primary-foreground px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5 hover:opacity-90 active:scale-[0.97] transition-all"
              data-testid="advisor-get-tip-btn"
            >
              {hasTip ? <RefreshCw className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
              {hasTip ? 'New tip' : 'Get tip'}
            </button>
          )}
          {busy && (
            <div className="rounded-full bg-primary/10 text-primary px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
            </div>
          )}
        </div>

        {(hasTip || busy) && (
          <div className="mt-3 pt-3 border-t border-primary/15">
            <div className="text-sm font-medium italic leading-relaxed text-foreground min-h-[24px]" data-testid="advisor-tip-text">
              {tip || '…'}
              {busy && <span className="inline-block w-1 h-4 bg-primary/70 ml-0.5 align-middle animate-pulse" />}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs text-destructive font-semibold">{error}</div>
        )}

        {!hasTip && !busy && !error && (
          <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Tap for a whispered tactical nudge from the AI coach — takes about 2 seconds.
          </div>
        )}
      </div>
    </Card>
  );
}
