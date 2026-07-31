import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const chipVariants = cva(
  "flex min-h-[50px] flex-1 cursor-pointer select-none items-center justify-center rounded-lg border px-3 py-3 text-center font-sans text-[0.87rem] transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground hover:border-primary",
        warn: "bg-transparent border-destructive text-destructive hover:bg-destructive/10",
        action: "bg-transparent border-primary text-primary hover:bg-primary/10",
        self: "bg-transparent border-chart-3 text-chart-3 hover:bg-chart-3/10",
        forced: "bg-transparent border-forced text-forced hover:bg-forced-background",
        let: "bg-transparent border-border text-muted-foreground text-[0.76rem] hover:border-muted-foreground",
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
