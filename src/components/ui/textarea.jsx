import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "w-full min-h-[90px] rounded-tt border border-tt-border bg-tt-background px-3 py-2 text-sm text-tt-foreground placeholder:text-tt-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-tt-brand focus:ring-offset-1 focus:ring-offset-tt-surface",
        className
      )}
      {...props}
    />
  );
}
