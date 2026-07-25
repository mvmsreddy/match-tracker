import { cn } from '@/lib/utils';

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-left text-xs", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }) {
  return <thead className={cn("", className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody className={cn("", className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn("border-b border-tt-border last:border-0", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn(
        "px-3 py-2 font-tt-mono text-[10px] font-bold uppercase tracking-wider text-tt-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }) {
  return <td className={cn("px-3 py-2", className)} {...props} />;
}
