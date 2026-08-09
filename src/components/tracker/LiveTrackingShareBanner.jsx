import { useState } from 'react';
import { Button } from '@/components/primitives/button';

export default function LiveTrackingShareBanner({ sessionId }) {
  const [copied, setCopied] = useState(false);
  if (!sessionId) return null;

  const url = `${window.location.origin}/track/live/${sessionId}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this live view link:', url);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live view active
        </span>
        <span className="text-muted-foreground flex-1 min-w-48">
          Share this link with a coach or parent to watch points update in real time.
        </span>
        <Button size="sm" variant="outline" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy live link'}
        </Button>
      </div>
    </div>
  );
}
