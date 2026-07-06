import { Skeleton } from "@/components/ui/skeleton";

export function LeagueViewSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-2 w-full mt-3 rounded-full" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="p-3 rounded-md border border-border/50 bg-card/30 text-center">
              <Skeleton className="h-6 w-6 mx-auto mb-2 rounded" />
              <Skeleton className="h-3 w-14 mx-auto mb-1" />
              <Skeleton className="h-2 w-18 mx-auto" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3 rounded-md border border-border/50 bg-card/30 text-center">
              <Skeleton className="h-3 w-16 mx-auto mb-2" />
              <Skeleton className="h-7 w-12 mx-auto mb-1" />
              <Skeleton className="h-2 w-20 mx-auto" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full mb-4 rounded" />
        <Skeleton className="h-64 w-full rounded" />
      </main>
    </div>
  );
}
