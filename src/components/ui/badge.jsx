import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-tt border px-2 py-0.5 font-tt-mono text-[10px] font-bold uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "border-tt-brand/30 bg-tt-brand/10 text-tt-brand",
        secondary: "border-tt-border bg-tt-surface-2 text-tt-muted-foreground",
        destructive: "border-tt-destructive/30 bg-tt-destructive-bg text-tt-destructive",
        outline: "border-tt-border text-tt-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
