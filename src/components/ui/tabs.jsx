import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn("flex border-b border-tt-border", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "cursor-pointer bg-transparent border-b-2 border-transparent px-5 py-3 font-tt-mono text-xs uppercase tracking-wide text-tt-muted-foreground transition-colors",
        "hover:text-tt-foreground",
        "data-[state=active]:border-tt-brand data-[state=active]:text-tt-brand data-[state=active]:font-semibold",
        "disabled:opacity-35 disabled:cursor-default disabled:hover:text-tt-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn("", className)} {...props} />;
}
