import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RetroSelect } from "@/components/ui/retro-select";
import { RetroButton } from "@/components/ui/retro-button";
import {
  Target, TrendingUp, Users, BarChart3, Flame, BookOpen, X,
  DollarSign, MapPin, Swords, GraduationCap, ArrowUpDown,
} from "lucide-react";

export interface MobileFilterState {
  positionFilter: string;
  starFilter: string;
  typeFilter: string;
  stateFilter: string;
  sortBy: string;
  showWatchlistOnly: boolean;
  showTopAvailable: boolean;
  showTeamNeeds: boolean;
  showPipeline: boolean;
  showContested: boolean;
  showStory: boolean;
  showOfferedOnly: boolean;
  showInStateOnly: boolean;
  showAffordableOnly: boolean;
  showHighRivalPressure: boolean;
}

interface MobileFilterSheetProps extends MobileFilterState {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  setPositionFilter: (val: string) => void;
  setStarFilter: (val: string) => void;
  setTypeFilter: (val: string) => void;
  setStateFilter: (val: string) => void;
  setSortBy: (val: string) => void;
  setShowWatchlistOnly: (val: boolean) => void;
  setShowTopAvailable: (val: boolean) => void;
  setShowTeamNeeds: (val: boolean) => void;
  setShowPipeline: (val: boolean) => void;
  setShowContested: (val: boolean) => void;
  setShowStory: (val: boolean) => void;
  setShowOfferedOnly: (val: boolean) => void;
  setShowInStateOnly: (val: boolean) => void;
  setShowAffordableOnly: (val: boolean) => void;
  setShowHighRivalPressure: (val: boolean) => void;
  filteredRecruitsCount: number;
  positionOptions: { label: string; value: string }[];
  starOptions: { label: string; value: string }[];
  stateOptions: { label: string; value: string }[];
  sortOptions: { label: string; value: string }[];
  teamState?: string;
  onReset: () => void;
}

function ViewToggle({
  active,
  onClick,
  icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-medium transition-colors w-full justify-center ${
        active
          ? "bg-gold/15 border-gold/60 text-gold"
          : "border-border/60 text-muted-foreground hover:border-gold/30 hover:text-foreground"
      }`}
      onClick={onClick}
      data-testid={testId}
    >
      {icon}
      {label}
    </button>
  );
}

export function MobileFilterSheet({
  isOpen,
  onOpenChange,
  positionFilter,
  setPositionFilter,
  starFilter,
  setStarFilter,
  typeFilter,
  setTypeFilter,
  stateFilter,
  setStateFilter,
  sortBy,
  setSortBy,
  showWatchlistOnly,
  setShowWatchlistOnly,
  showTopAvailable,
  setShowTopAvailable,
  showTeamNeeds,
  setShowTeamNeeds,
  showPipeline,
  setShowPipeline,
  showContested,
  setShowContested,
  showStory,
  setShowStory,
  showOfferedOnly,
  setShowOfferedOnly,
  showInStateOnly,
  setShowInStateOnly,
  showAffordableOnly,
  setShowAffordableOnly,
  showHighRivalPressure,
  setShowHighRivalPressure,
  filteredRecruitsCount,
  positionOptions,
  starOptions,
  stateOptions,
  sortOptions,
  onReset,
}: MobileFilterSheetProps) {
  const activeViewCount = [
    showWatchlistOnly, showTopAvailable, showTeamNeeds, showPipeline,
    showContested, showStory, showOfferedOnly, showInStateOnly,
    showAffordableOnly, showHighRivalPressure,
  ].filter(Boolean).length;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border p-0 max-h-[90vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-gold text-xs">
              FILTERS
              {activeViewCount > 0 && (
                <span className="ml-2 text-xs bg-gold/20 border border-gold/40 text-gold px-1.5 py-0.5 rounded-full">
                  {activeViewCount} active
                </span>
              )}
            </SheetTitle>
            <button
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              onClick={onReset}
              data-testid="button-clear-all-filters"
            >
              Reset
            </button>
          </div>
        </SheetHeader>

        <div className="p-4 space-y-5">
          {/* Sort */}
          <div>
            <p className="text-xs font-semibold text-gold mb-2 flex items-center gap-1.5">
              <ArrowUpDown className="w-3 h-3" />
              SORT BY
            </p>
            <RetroSelect
              options={sortOptions}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full"
              data-testid="select-sort-filter-sheet"
            />
          </div>

          {/* Position */}
          <div>
            <p className="text-xs font-semibold text-gold mb-2">POSITION</p>
            <RetroSelect
              options={positionOptions}
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-full"
              data-testid="select-position-filter-sheet"
            />
          </div>

          {/* Stars */}
          <div>
            <p className="text-xs font-semibold text-gold mb-2">STARS</p>
            <RetroSelect
              options={starOptions}
              value={starFilter}
              onChange={(e) => setStarFilter(e.target.value)}
              className="w-full"
              data-testid="select-star-filter-sheet"
            />
          </div>

          {/* Type */}
          <div>
            <p className="text-xs font-semibold text-gold mb-2">TYPE</p>
            <RetroSelect
              options={[
                { label: "All Types", value: "all" },
                { label: "High School", value: "HS" },
                { label: "Transfer", value: "TRANSFER" },
                { label: "JUCO", value: "JUCO" },
              ]}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full"
              data-testid="select-type-filter-sheet"
            />
          </div>

          {/* Home State */}
          <div>
            <p className="text-xs font-semibold text-gold mb-2">HOME STATE</p>
            <RetroSelect
              options={stateOptions}
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full"
              data-testid="select-state-filter-sheet"
            />
          </div>

          {/* View Toggles */}
          <div>
            <p className="text-xs font-semibold text-gold mb-2">VIEWS</p>
            <div className="grid grid-cols-2 gap-2">
              <ViewToggle
                active={showWatchlistOnly}
                onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                icon={<Target className="w-3 h-3" />}
                label="Watchlist"
                testId="button-watchlist-filter-sheet"
              />
              <ViewToggle
                active={showTopAvailable}
                onClick={() => setShowTopAvailable(!showTopAvailable)}
                icon={<TrendingUp className="w-3 h-3" />}
                label="Top Available"
                testId="button-top-available-sheet"
              />
              <ViewToggle
                active={showTeamNeeds}
                onClick={() => setShowTeamNeeds(!showTeamNeeds)}
                icon={<Users className="w-3 h-3" />}
                label="Team Needs"
                testId="button-toggle-team-needs-sheet"
              />
              <ViewToggle
                active={showPipeline}
                onClick={() => setShowPipeline(!showPipeline)}
                icon={<BarChart3 className="w-3 h-3" />}
                label="Pipeline"
                testId="button-toggle-pipeline-sheet"
              />
              <ViewToggle
                active={showContested}
                onClick={() => setShowContested(!showContested)}
                icon={<Flame className="w-3 h-3" />}
                label="Contested"
                testId="button-toggle-contested-sheet"
              />
              <ViewToggle
                active={showStory}
                onClick={() => setShowStory(!showStory)}
                icon={<BookOpen className="w-3 h-3" />}
                label="Story"
                testId="button-toggle-story-sheet"
              />
              <ViewToggle
                active={showOfferedOnly}
                onClick={() => setShowOfferedOnly(!showOfferedOnly)}
                icon={<GraduationCap className="w-3 h-3" />}
                label="Offered"
                testId="button-offered-only-sheet"
              />
              <ViewToggle
                active={showInStateOnly}
                onClick={() => setShowInStateOnly(!showInStateOnly)}
                icon={<MapPin className="w-3 h-3" />}
                label="In-State"
                testId="button-in-state-sheet"
              />
              <ViewToggle
                active={showAffordableOnly}
                onClick={() => setShowAffordableOnly(!showAffordableOnly)}
                icon={<DollarSign className="w-3 h-3" />}
                label="Affordable"
                testId="button-affordable-sheet"
              />
              <ViewToggle
                active={showHighRivalPressure}
                onClick={() => setShowHighRivalPressure(!showHighRivalPressure)}
                icon={<Swords className="w-3 h-3" />}
                label="High Rivals"
                testId="button-high-rival-sheet"
              />
            </div>
          </div>

          <RetroButton
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full justify-center"
            data-testid="button-apply-filters"
          >
            Show {filteredRecruitsCount} Recruits
          </RetroButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Returns active-filter chip labels for display above the recruit list */
export function getActiveFilterChips(state: MobileFilterState & { sortBy: string }): string[] {
  const chips: string[] = [];
  if (state.positionFilter !== "all") chips.push(state.positionFilter);
  if (state.starFilter !== "all") chips.push(state.starFilter.replace("star", "★").replace("stars", "★"));
  if (state.typeFilter !== "all") chips.push(state.typeFilter);
  if (state.stateFilter !== "all") chips.push(state.stateFilter);
  if (state.sortBy !== "classRank") chips.push(`Sort: ${state.sortBy}`);
  if (state.showWatchlistOnly) chips.push("Watchlist");
  if (state.showTopAvailable) chips.push("Top Available");
  if (state.showTeamNeeds) chips.push("Needs");
  if (state.showPipeline) chips.push("Pipeline");
  if (state.showContested) chips.push("Contested");
  if (state.showStory) chips.push("Story");
  if (state.showOfferedOnly) chips.push("Offered");
  if (state.showInStateOnly) chips.push("In-State");
  if (state.showAffordableOnly) chips.push("Affordable");
  if (state.showHighRivalPressure) chips.push("High Rivals");
  return chips;
}
