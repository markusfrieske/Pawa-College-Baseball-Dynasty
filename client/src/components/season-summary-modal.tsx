import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { TeamBadge } from "@/components/ui/team-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RetroButton } from "@/components/ui/retro-button";
import { Trophy, GraduationCap, ArrowRightLeft, Star } from "lucide-react";

interface SeasonSummaryModalProps {
  open: boolean;
  onClose: () => void;
  leagueId: string;
  season: number;
}

interface SeasonSummaryData {
  season: number;
  userTeam: {
    name: string;
    mascot: string;
    abbreviation: string;
    primaryColor: string;
    wins: number;
    losses: number;
    confWins: number;
    confLosses: number;
    runsScored: number;
    runsAllowed: number;
  } | null;
  standings: { name: string; mascot: string; abbreviation: string; primaryColor: string; wins: number; losses: number }[];
  cwsChampion: { name: string; mascot: string; abbreviation: string; primaryColor: string } | null;
  cwsRunnerUp: { name: string; abbreviation: string } | null;
  awards: {
    mvp: { playerName: string; position: string; teamName: string; overall: number } | null;
    pitcherOfYear: { playerName: string; position: string; teamName: string; overall: number } | null;
    freshmanOfYear: { playerName: string; position: string; teamName: string; overall: number } | null;
  };
  userDepartures: {
    graduated: number;
    drafted: number;
    transferred: number;
    draftPicks: { playerName: string; position: string; draftRound: number }[];
  };
  leagueDraftPicks: { playerName: string; position: string; teamName: string; draftRound: number }[];
}

/** Inline animation style for staggered card entrance — respects prefers-reduced-motion via CSS. */
function cardIn(index: number): React.CSSProperties {
  return {
    animationDelay: `${index * 80}ms`,
  };
}

export function SeasonSummaryModal({ open, onClose, leagueId, season }: SeasonSummaryModalProps) {
  const { data, isLoading } = useQuery<SeasonSummaryData>({
    queryKey: ["/api/leagues", leagueId, "season-summary", season],
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0" data-testid="season-summary-dialog">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-gold" />
            <span className="font-pixel text-gold text-lg">Season {season} Complete</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Here's a recap of the completed season.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <div className="space-y-4 pt-2 pb-2">
            {isLoading ? (
              <SummarySkeleton />
            ) : data ? (
              <>
                {data.userTeam && (
                  <RetroCard className="summary-card-in" style={cardIn(0)} data-testid="summary-user-team">
                    <RetroCardHeader>Your Team</RetroCardHeader>
                    <RetroCardContent>
                      <div className="flex items-center gap-3 mb-3">
                        <TeamBadge abbreviation={data.userTeam.abbreviation} primaryColor={data.userTeam.primaryColor} name={data.userTeam.name} size="md" />
                        <div>
                          <p className="font-bold text-lg" data-testid="text-user-team-name">{data.userTeam.name}</p>
                          <p className="text-muted-foreground text-sm">
                            {data.userTeam.wins}-{data.userTeam.losses} Overall | {data.userTeam.confWins}-{data.userTeam.confLosses} Conference
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-muted/30 p-2 rounded-md">
                          <span className="text-muted-foreground">Runs Scored</span>
                          <p className="font-bold" data-testid="text-runs-scored">{data.userTeam.runsScored}</p>
                        </div>
                        <div className="bg-muted/30 p-2 rounded-md">
                          <span className="text-muted-foreground">Runs Allowed</span>
                          <p className="font-bold" data-testid="text-runs-allowed">{data.userTeam.runsAllowed}</p>
                        </div>
                      </div>
                    </RetroCardContent>
                  </RetroCard>
                )}

                <RetroCard className="summary-card-in" style={cardIn(1)} data-testid="summary-cws-champion">
                  <RetroCardHeader>College World Series</RetroCardHeader>
                  <RetroCardContent>
                    {data.cwsChampion ? (
                      <div className="flex items-center gap-3">
                        <TeamBadge abbreviation={data.cwsChampion.abbreviation} primaryColor={data.cwsChampion.primaryColor} name={data.cwsChampion.name} size="md" />
                        <div>
                          <p className="text-gold font-bold text-lg" data-testid="text-cws-champion">{data.cwsChampion.name}</p>
                          <p className="text-muted-foreground text-sm">CWS Champion</p>
                          {data.cwsRunnerUp && (
                            <p className="text-muted-foreground text-xs mt-1">Runner-up: {data.cwsRunnerUp.name}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground" data-testid="text-no-cws">No College World Series played this season</p>
                    )}
                  </RetroCardContent>
                </RetroCard>

                <RetroCard className="summary-card-in" style={cardIn(2)} data-testid="summary-awards">
                  <RetroCardHeader>Season Awards</RetroCardHeader>
                  <RetroCardContent className="space-y-3">
                    {data.awards.mvp && (
                      <AwardRow label="MVP" playerName={data.awards.mvp.playerName} position={data.awards.mvp.position} teamName={data.awards.mvp.teamName} testId="award-mvp" />
                    )}
                    {data.awards.pitcherOfYear && (
                      <AwardRow label="Pitcher of the Year" playerName={data.awards.pitcherOfYear.playerName} position={data.awards.pitcherOfYear.position} teamName={data.awards.pitcherOfYear.teamName} testId="award-pitcher" />
                    )}
                    {data.awards.freshmanOfYear && (
                      <AwardRow label="Freshman of the Year" playerName={data.awards.freshmanOfYear.playerName} position={data.awards.freshmanOfYear.position} teamName={data.awards.freshmanOfYear.teamName} testId="award-freshman" />
                    )}
                  </RetroCardContent>
                </RetroCard>

                {data.leagueDraftPicks.length > 0 && (
                  <RetroCard className="summary-card-in" style={cardIn(3)} data-testid="summary-draft">
                    <RetroCardHeader>MLB Draft</RetroCardHeader>
                    <RetroCardContent className="space-y-2">
                      {data.leagueDraftPicks.map((pick, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm" data-testid={`draft-pick-${i}`}>
                          <Badge variant="secondary" className="text-[10px] min-w-[44px] justify-center">
                            Rd {pick.draftRound}
                          </Badge>
                          <span className="font-medium">{pick.playerName}</span>
                          <span className="text-muted-foreground">{pick.position}</span>
                          <span className="text-muted-foreground ml-auto text-xs">{pick.teamName}</span>
                        </div>
                      ))}
                    </RetroCardContent>
                  </RetroCard>
                )}

                {data.userDepartures && (data.userDepartures.graduated > 0 || data.userDepartures.drafted > 0 || data.userDepartures.transferred > 0) && (
                  <RetroCard className="summary-card-in" style={cardIn(4)} data-testid="summary-departures">
                    <RetroCardHeader>Your Departures</RetroCardHeader>
                    <RetroCardContent>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {data.userDepartures.graduated > 0 && (
                          <div className="flex items-center gap-2" data-testid="departures-graduated">
                            <GraduationCap className="w-4 h-4 text-muted-foreground" />
                            <span>{data.userDepartures.graduated} Graduated</span>
                          </div>
                        )}
                        {data.userDepartures.drafted > 0 && (
                          <div className="flex items-center gap-2" data-testid="departures-drafted">
                            <Star className="w-4 h-4 text-muted-foreground" />
                            <span>{data.userDepartures.drafted} Drafted</span>
                          </div>
                        )}
                        {data.userDepartures.transferred > 0 && (
                          <div className="flex items-center gap-2" data-testid="departures-transferred">
                            <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                            <span>{data.userDepartures.transferred} Transferred</span>
                          </div>
                        )}
                      </div>
                      {data.userDepartures.draftPicks.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Your Drafted Players</p>
                          {data.userDepartures.draftPicks.map((pick, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <Badge variant="secondary" className="text-[10px] min-w-[44px] justify-center">
                                Rd {pick.draftRound}
                              </Badge>
                              <span className="font-medium">{pick.playerName}</span>
                              <span className="text-muted-foreground">{pick.position}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </RetroCardContent>
                  </RetroCard>
                )}

                <RetroCard className="summary-card-in" style={cardIn(5)} data-testid="summary-standings">
                  <RetroCardHeader>Final Standings (Top 5)</RetroCardHeader>
                  <RetroCardContent className="space-y-2">
                    {data.standings.slice(0, 5).map((team, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm" data-testid={`standing-${i}`}>
                        <span className="text-muted-foreground font-mono w-5 text-right">{i + 1}.</span>
                        <TeamBadge abbreviation={team.abbreviation} primaryColor={team.primaryColor} name={team.name} size="sm" />
                        <span className="font-medium flex-1">{team.name}</span>
                        <span className="text-muted-foreground">{team.wins}-{team.losses}</span>
                      </div>
                    ))}
                  </RetroCardContent>
                </RetroCard>

                <div className="pt-2 summary-card-in" style={cardIn(6)}>
                  <RetroButton onClick={onClose} className="w-full" data-testid="button-continue-offseason">
                    Continue to Offseason
                  </RetroButton>
                </div>
              </>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function AwardRow({ label, playerName, position, teamName, testId }: { label: string; playerName: string; position: string; teamName: string; testId: string }) {
  return (
    <div className="flex items-start gap-3" data-testid={testId}>
      <Trophy className="w-4 h-4 text-gold mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="font-medium">{playerName} <span className="text-muted-foreground">({position})</span></p>
        <p className="text-xs text-muted-foreground">{teamName}</p>
      </div>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}
