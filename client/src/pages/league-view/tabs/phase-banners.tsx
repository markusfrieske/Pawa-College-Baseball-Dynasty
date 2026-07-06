import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { RetroButton } from "@/components/ui/retro-button";

export function PhaseGuidanceBanner({ phase, leagueId }: { phase: string; leagueId: string }) {
  const getGuidance = (): { text: string; action?: { label: string; href: string } } | null => {
    switch (phase) {
      case "preseason":
      case "spring_training":
        return { text: "Spring training is underway. Head to the Commissioner page to advance to the regular season.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "regular_season":
        return { text: "The regular season is in progress. Advance weeks from the Commissioner page or sim ahead.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "conference_championship":
      case "super_regionals":
        return { text: "Postseason is underway. Advance from the Commissioner page to continue the bracket.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "cws":
        return { text: "The College World Series is here. Sim the championship from the Commissioner page.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "offseason_departures":
        return { text: "Review your departing players and make retention offers before the commissioner advances.", action: { label: "Departures", href: `/league/${leagueId}/departures` } };
      case "offseason_recruiting_1":
      case "offseason_recruiting_2":
      case "offseason_recruiting_3":
      case "offseason_recruiting_4":
        return { text: "Recruiting is open. Scout, contact, and offer scholarships to build your next class.", action: { label: "Recruiting", href: `/league/${leagueId}/recruiting` } };
      case "offseason_signing_day":
        return { text: "Decision Day is here. See where the final few recruits go by readying up.", action: { label: "Commissioner", href: `/league/${leagueId}/commissioner` } };
      case "offseason_walkons":
        return { text: "Time to finalize your roster. Cut players to get to 25 and sign walk-ons to fill gaps.", action: { label: "Walk-Ons", href: `/league/${leagueId}/walkons` } };
      default:
        return null;
    }
  };

  const guidance = getGuidance();
  if (!guidance) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-md bg-gold/5 border border-gold/20 px-4 py-2" data-testid="phase-guidance-banner">
      <ChevronRight className="w-4 h-4 text-gold shrink-0" />
      <span className="text-xs text-muted-foreground flex-1">{guidance.text}</span>
      {guidance.action && (
        <Link href={guidance.action.href}>
          <RetroButton variant="outline" size="sm" data-testid="button-phase-guidance-action">
            {guidance.action.label}
          </RetroButton>
        </Link>
      )}
    </div>
  );
}

export function SeasonProgressBar({ phase }: { phase: string }) {
  const phases = [
    { key: "spring", label: "SPR" },
    { key: "regular_season", label: "REG" },
    { key: "conference_championship", label: "CONF" },
    { key: "super_regionals", label: "SUPR" },
    { key: "cws", label: "CWS" },
    { key: "offseason", label: "OFF" },
  ];

  const offseasonPhases = ["offseason_departures", "offseason_recruiting_1", "offseason_recruiting_2", 
    "offseason_recruiting_3", "offseason_recruiting_4", "offseason_signing_day", "offseason_walkons"];
  
  const springPhases = ["preseason", "spring_training"];
  
  const currentPhaseNormalized = offseasonPhases.includes(phase) ? "offseason" 
    : springPhases.includes(phase) ? "spring" 
    : phase;
  const currentIndex = phases.findIndex(p => p.key === currentPhaseNormalized);

  return (
    <div className="mt-4" data-testid="season-progress-bar">
      <div className="flex items-center gap-1 sm:gap-2">
        {phases.map((p, i) => (
          <div
            key={p.key}
            className={`flex-1 flex flex-col items-center gap-1 min-w-0 ${
              i < currentIndex ? "opacity-50" : i === currentIndex ? "" : "opacity-30"
            }`}
          >
            <div
              className={`w-full h-2 rounded-full ${
                i < currentIndex
                  ? "bg-green-500"
                  : i === currentIndex
                    ? "bg-gold"
                    : "bg-muted"
              }`}
            />
            <span className={`text-[7px] sm:text-[8px] font-pixel text-center ${i === currentIndex ? "text-gold" : "text-muted-foreground"}`}>
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
