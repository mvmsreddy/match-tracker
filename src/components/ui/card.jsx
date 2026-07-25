import { cn } from '@/lib/utils';

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-tt border border-tt-border bg-tt-surface text-tt-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col gap-1 border-b border-tt-border p-4", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }) {
  return (
    <h2
      className={cn(
        "font-tt-mono text-xs font-bold uppercase tracking-wider text-tt-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }) {
  return (
    <p className={cn("text-xs text-tt-muted-foreground", className)} {...props} />
  );
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return (
    <div className={cn("flex items-center gap-2 border-t border-tt-border p-4", className)} {...props} />
  );
}
