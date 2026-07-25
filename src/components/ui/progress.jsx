import { cn } from '@/lib/utils';

export function Progress({ label, value, max = 100, valueLabel, className }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      {(label || valueLabel) && (
        <div className="mb-1.5 flex justify-between text-xs text-tt-foreground">
          <span>{label}</span>
          <span className="font-tt-mono text-tt-brand tabular-nums">{valueLabel}</span>
        </div>
      )}
      <div className="h-1 rounded-full bg-tt-surface-2">
        <div
          className="h-full rounded-full bg-tt-brand"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
