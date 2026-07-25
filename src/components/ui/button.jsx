import { cva } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-tt font-tt-mono text-xs uppercase tracking-wide font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-tt-brand text-tt-background hover:opacity-90",
        destructive: "bg-transparent border border-tt-destructive text-tt-destructive hover:bg-tt-destructive-bg",
        "destructive-solid": "bg-tt-destructive text-tt-foreground hover:opacity-90",
        outline: "bg-transparent border border-tt-border text-tt-foreground hover:border-tt-brand hover:text-tt-brand",
        secondary: "bg-tt-surface text-tt-foreground hover:bg-tt-surface-2",
        ghost: "bg-transparent text-tt-foreground hover:bg-tt-surface",
        link: "bg-transparent text-tt-brand underline-offset-4 hover:underline normal-case tracking-normal",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[0.68rem]",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
