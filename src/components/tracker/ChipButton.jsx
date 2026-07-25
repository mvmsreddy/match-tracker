import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const chipVariants = cva(
  "flex min-h-[50px] flex-1 cursor-pointer select-none items-center justify-center rounded-tt border px-3 py-3 text-center font-sans text-[0.87rem] transition-colors",
  {
    variants: {
      variant: {
        default: "border-tt-border bg-tt-surface text-tt-foreground hover:border-tt-brand",
        warn: "bg-transparent border-tt-destructive text-tt-destructive hover:bg-tt-destructive-bg",
        action: "bg-transparent border-tt-brand text-tt-brand hover:bg-tt-brand/10",
        self: "bg-transparent border-tt-win text-tt-win hover:bg-tt-win-bg",
        forced: "bg-transparent border-tt-forced text-tt-forced hover:bg-tt-forced-bg",
        let: "bg-transparent border-tt-border text-tt-muted-foreground text-[0.76rem] hover:border-tt-muted-foreground",
      },
      full: {
        true: "w-full flex-[1_1_100%]",
        false: "",
      },
    },
    defaultVariants: { variant: "default", full: false },
  }
);

export default function ChipButton({ className, variant, full, ...props }) {
  return (
    <button
      type="button"
      className={cn(chipVariants({ variant, full, className }))}
      {...props}
    />
  );
}
