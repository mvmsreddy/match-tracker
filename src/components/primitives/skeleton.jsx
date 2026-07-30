import { cn } from '@/lib/utils';

/**
 * Base skeleton block with shimmer animation
 */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

/**
 * Stat card skeleton — matches the dashboard stat cards
 */
export function StatCardSkeleton() {
  return (
    <div className="p-4 sm:p-5 rounded-lg border border-border bg-card space-y-2">
      <Skeleton className="h-5 w-5" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

/**
 * Match/List item skeleton
 */
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4 rounded-lg border border-border bg-card">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

/**
 * Chart placeholder skeleton
 */
export function ChartSkeleton({ height = 200 }) {
  return (
    <div className="p-4 sm:p-6 rounded-lg border border-border bg-card space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-48" />
      <Skeleton className="w-full" style={{ height: `${height}px` }} />
    </div>
  );
}

/**
 * Full-page dashboard skeleton
 */
export function DashboardSkeleton() {
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto space-y-5">
      <Skeleton className="h-24 w-full" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} />)}
      </div>
    </div>
  );
}
