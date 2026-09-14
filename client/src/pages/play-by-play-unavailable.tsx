import { Link, useParams } from "wouter";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";

export default function PlayByPlayUnavailablePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="container mx-auto max-w-xl px-4 py-12">
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <h1 className="text-xl font-semibold">Play-by-play is temporarily unavailable</h1>
        </RetroCardHeader>
        <RetroCardContent className="space-y-4">
          <p className="text-muted-foreground">
            Interactive play-by-play is being rebuilt. Opening this page does not
            simulate a game or change a result. Use the schedule to view games,
            report results, and manage your season.
          </p>
          <Link
            href={`/league/${id}/schedule`}
            className="inline-flex min-h-11 items-center rounded border border-border px-4 py-2 font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2"
          >
            Open schedule
          </Link>
        </RetroCardContent>
      </RetroCard>
    </main>
  );
}
