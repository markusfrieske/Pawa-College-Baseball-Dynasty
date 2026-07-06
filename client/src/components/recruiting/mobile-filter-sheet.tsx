import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RetroSelect } from "@/components/ui/retro-select";
import { RetroButton } from "@/components/ui/retro-button";
import { Target, TrendingUp, Users, BarChart3, Flame, BookOpen, X } from "lucide-react";

interface MobileFilterSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  positionFilter: string;
  setPositionFilter: (val: string) => void;
  starFilter: string;
  setStarFilter: (val: string) => void;
  typeFilter: string;
  setTypeFilter: (val: string) => void;
  stateFilter: string;
  setStateFilter: (val: string) => void;
  showWatchlistOnly: boolean;
  setShowWatchlistOnly: (val: boolean) => void;
  showTopAvailable: boolean;
  setShowTopAvailable: (val: boolean) => void;
  showTeamNeeds: boolean;
  setShowTeamNeeds: (val: boolean) => void;
  showPipeline: boolean;
  setShowPipeline: (val: boolean) => void;
  showContested: boolean;
  setShowContested: (val: boolean) => void;
  showStory: boolean;
  setShowStory: (val: boolean) => void;
  filteredRecruitsCount: number;
  positionOptions: { label: string; value: string }[];
  starOptions: { label: string; value: string }[];
  stateOptions: { label: string; value: string }[];
  onReset: () => void;
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
  filteredRecruitsCount,
  positionOptions,
  starOptions,
  stateOptions,
  onReset,
}: MobileFilterSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-card border-border p-0 max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="font-pixel text-gold text-xs">FILTERS</SheetTitle>
        </SheetHeader>
        <div className="p-4 space-y-5">
          <div>
            <p className="font-pixel text-[9px] text-gold mb-2">POSITION</p>
            <RetroSelect
              options={positionOptions}
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-full"
              data-testid="select-position-filter-sheet"
            />
          </div>
          <div>
            <p className="font-pixel text-[9px] text-gold mb-2">STARS</p>
            <RetroSelect
              options={starOptions}
              value={starFilter}
              onChange={(e) => setStarFilter(e.target.value)}
              className="w-full"
              data-testid="select-star-filter-sheet"
            />
          </div>
          <div>
            <p className="font-pixel text-[9px] text-gold mb-2">TYPE</p>
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
          <div>
            <p className="font-pixel text-[9px] text-gold mb-2">HOME STATE</p>
            <RetroSelect
              options={stateOptions}
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-full"
              data-testid="select-state-filter-sheet"
            />
          </div>
          <div>
            <p className="font-pixel text-[9px] text-gold mb-2">VIEWS</p>
            <div className="grid grid-cols-2 gap-2">
              <RetroButton
                variant={showWatchlistOnly ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                className="w-full justify-center"
                data-testid="button-watchlist-filter-sheet"
              >
                <Target className="w-3 h-3 mr-1" />
                Watchlist
              </RetroButton>
              <RetroButton
                variant={showTopAvailable ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowTopAvailable(!showTopAvailable)}
                className="w-full justify-center"
                data-testid="button-top-available-sheet"
              >
                <TrendingUp className="w-3 h-3 mr-1" />
                Top Available
              </RetroButton>
              <RetroButton
                variant={showTeamNeeds ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowTeamNeeds(!showTeamNeeds)}
                className="w-full justify-center"
                data-testid="button-toggle-team-needs-sheet"
              >
                <Users className="w-3 h-3 mr-1" />
                Team Needs
              </RetroButton>
              <RetroButton
                variant={showPipeline ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowPipeline(!showPipeline)}
                className="w-full justify-center"
                data-testid="button-toggle-pipeline-sheet"
              >
                <BarChart3 className="w-3 h-3 mr-1" />
                Pipeline
              </RetroButton>
              <RetroButton
                variant={showContested ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowContested(!showContested)}
                className="w-full justify-center"
                data-testid="button-toggle-contested-sheet"
              >
                <Flame className="w-3 h-3 mr-1" />
                Contested
              </RetroButton>
              <RetroButton
                variant={showStory ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowStory(!showStory)}
                className="w-full justify-center"
                data-testid="button-toggle-story-sheet"
              >
                <BookOpen className="w-3 h-3 mr-1" />
                Story
              </RetroButton>
            </div>
          </div>
          <RetroButton
            variant="outline"
            size="sm"
            onClick={onReset}
            className="w-full justify-center"
            data-testid="button-clear-all-filters"
          >
            Reset to Defaults
          </RetroButton>
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
