import { cn } from '@/lib/utils';

export function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        "w-full rounded-tt border border-tt-border bg-tt-background px-3 py-2 text-sm text-tt-foreground",
        "focus:outline-none focus:ring-2 focus:ring-tt-brand focus:ring-offset-1 focus:ring-offset-tt-surface",
        className
      )}
      {...props}
    />
  );
}
