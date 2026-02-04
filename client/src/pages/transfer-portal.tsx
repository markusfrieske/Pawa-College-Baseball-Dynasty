import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamBadge } from "@/components/ui/team-badge";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionBadge } from "@/components/ui/position-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  ArrowRightLeft,
  Target,
  UserPlus,
  FileText,
  Users,
  Star
} from "lucide-react";
import type { Player, Team, TransferPortalInterest } from "@shared/schema";

interface PortalPlayer extends Player {
  originalTeam: Team | null;
  myInterest: TransferPortalInterest | null;
}

interface TransferPortalData {
  players: PortalPlayer[];
  myTeamId: string | null;
  isCommissioner: boolean;
}

function PortalPlayerCard({ 
  player, 
  onTarget, 
  onSign,
  onNotes,
  hasTeam 
}: { 
  player: PortalPlayer;
  onTarget: () => void;
  onSign: () => void;
  onNotes: () => void;
  hasTeam: boolean;
}) {
  const isTargeted = player.myInterest?.isTargeted || false;

  return (
    <RetroCard className="h-fit">
      <RetroCardContent className="p-3 space-y-3">
        <div className="flex items-start gap-3">
          <PlayerPortrait
            skinTone={player.skinTone}
            hairColor={player.hairColor}
            hairStyle={player.hairStyle}
            className="w-12 h-12"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-1">
              <PositionBadge position={player.position} size="sm" />
              <span className="font-['Press_Start_2P'] text-xs text-white truncate">
                {player.firstName} {player.lastName}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="text-[#C4A35A]">{"★".repeat(player.starRating)}</span>
              <span>{player.overall} OVR</span>
              <span>{player.eligibility}</span>
            </div>
            {player.originalTeam && (
              <div className="flex items-center gap-1 mt-1">
                <TeamBadge
                  abbreviation={player.originalTeam.abbreviation}
                  primaryColor={player.originalTeam.primaryColor}
                  secondaryColor={player.originalTeam.secondaryColor}
                  size="sm"
                />
                <span className="text-xs text-gray-400">
                  {player.originalTeam.abbreviation}
                </span>
              </div>
            )}
            {player.portalReason && (
              <p className="text-xs text-gray-500 mt-1 italic">
                "{player.portalReason}"
              </p>
            )}
          </div>
        </div>

        {hasTeam && (
          <div className="flex flex-wrap gap-2">
            <RetroButton
              variant={isTargeted ? "primary" : "outline"}
              size="sm"
              onClick={onTarget}
              data-testid={`button-target-${player.id}`}
            >
              <Target className="w-3 h-3 mr-1" />
              {isTargeted ? "Targeted" : "Target"}
            </RetroButton>
            <RetroButton
              variant="outline"
              size="sm"
              onClick={onNotes}
              data-testid={`button-notes-${player.id}`}
            >
              <FileText className="w-3 h-3 mr-1" />
              Notes
            </RetroButton>
            <RetroButton
              variant="primary"
              size="sm"
              onClick={onSign}
              data-testid={`button-sign-${player.id}`}
            >
              <UserPlus className="w-3 h-3 mr-1" />
              Sign
            </RetroButton>
          </div>
        )}

        {player.myInterest?.notes && (
          <div className="text-xs text-gray-400 bg-[#1a2b1a] p-2 rounded border border-[#2d3d2d]">
            <strong>Notes:</strong> {player.myInterest.notes}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

export default function TransferPortalPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [notesPlayer, setNotesPlayer] = useState<PortalPlayer | null>(null);
  const [notesText, setNotesText] = useState("");
  const [confirmSign, setConfirmSign] = useState<PortalPlayer | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");

  const { data, isLoading } = useQuery<TransferPortalData>({
    queryKey: [`/api/leagues/${id}/transfer-portal`],
  });

  const targetMutation = useMutation({
    mutationFn: async ({ playerId, isTargeted }: { playerId: string; isTargeted: boolean }) => {
      const response = await apiRequest("POST", `/api/leagues/${id}/transfer-portal/${playerId}/interest`, { isTargeted });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/transfer-portal`] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const notesMutation = useMutation({
    mutationFn: async ({ playerId, notes }: { playerId: string; notes: string }) => {
      const response = await apiRequest("POST", `/api/leagues/${id}/transfer-portal/${playerId}/interest`, { notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/transfer-portal`] });
      setNotesPlayer(null);
      toast({ title: "Notes saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const signMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await apiRequest("POST", `/api/leagues/${id}/transfer-portal/${playerId}/sign`, {});
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/transfer-portal`] });
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${id}/roster`] });
      setConfirmSign(null);
      toast({ title: "Transfer Complete", description: result.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleTarget = (player: PortalPlayer) => {
    targetMutation.mutate({ 
      playerId: player.id, 
      isTargeted: !player.myInterest?.isTargeted 
    });
  };

  const handleOpenNotes = (player: PortalPlayer) => {
    setNotesPlayer(player);
    setNotesText(player.myInterest?.notes || "");
  };

  const handleSaveNotes = () => {
    if (notesPlayer) {
      notesMutation.mutate({ playerId: notesPlayer.id, notes: notesText });
    }
  };

  const handleSign = () => {
    if (confirmSign) {
      signMutation.mutate(confirmSign.id);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a2b1a] p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-[#243524]" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-48 bg-[#243524]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#1a2b1a] flex items-center justify-center">
        <p className="text-gray-400">Failed to load data</p>
      </div>
    );
  }

  const positions = ["all", ...Array.from(new Set(data.players.map(p => p.position)))];
  const filteredPlayers = positionFilter === "all" 
    ? data.players 
    : data.players.filter(p => p.position === positionFilter);

  return (
    <div className="min-h-screen bg-[#1a2b1a] p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Link href={`/league/${id}`}>
            <RetroButton variant="outline" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to League
            </RetroButton>
          </Link>
          <div className="flex-1">
            <h1 className="font-['Press_Start_2P'] text-lg sm:text-xl text-[#C4A35A] flex items-center gap-2">
              <ArrowRightLeft className="w-6 h-6" />
              Transfer Portal
            </h1>
            <p className="text-sm text-gray-400">
              {data.players.length} player{data.players.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <Link href={`/league/${id}/players-leaving`}>
            <RetroButton variant="outline" size="sm" data-testid="link-players-leaving">
              <Users className="w-4 h-4 mr-2" />
              Players Leaving
            </RetroButton>
          </Link>
        </div>

        {!data.myTeamId && (
          <RetroCard>
            <RetroCardContent className="py-4 text-center text-yellow-400">
              You need to have a team to recruit from the transfer portal
            </RetroCardContent>
          </RetroCard>
        )}

        <div className="flex flex-wrap gap-2">
          {positions.map(pos => (
            <RetroButton
              key={pos}
              variant={positionFilter === pos ? "primary" : "outline"}
              size="sm"
              onClick={() => setPositionFilter(pos)}
              data-testid={`filter-position-${pos}`}
            >
              {pos === "all" ? "All Positions" : pos}
            </RetroButton>
          ))}
        </div>

        {filteredPlayers.length === 0 ? (
          <RetroCard>
            <RetroCardContent className="py-12 text-center">
              <ArrowRightLeft className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">
                {data.players.length === 0 
                  ? "No players in the transfer portal" 
                  : "No players match your filter"}
              </p>
            </RetroCardContent>
          </RetroCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlayers.map(player => (
              <PortalPlayerCard
                key={player.id}
                player={player}
                hasTeam={!!data.myTeamId}
                onTarget={() => handleTarget(player)}
                onSign={() => setConfirmSign(player)}
                onNotes={() => handleOpenNotes(player)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!notesPlayer} onOpenChange={() => setNotesPlayer(null)}>
        <DialogContent className="bg-[#243524] border-[#2d3d2d]">
          <DialogHeader>
            <DialogTitle className="font-['Press_Start_2P'] text-sm text-[#C4A35A]">
              Notes: {notesPlayer?.firstName} {notesPlayer?.lastName}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Add notes about this player..."
            className="bg-[#1a2b1a] border-[#2d3d2d] text-white min-h-[100px]"
            data-testid="input-notes"
          />
          <DialogFooter>
            <RetroButton variant="outline" onClick={() => setNotesPlayer(null)}>
              Cancel
            </RetroButton>
            <RetroButton 
              onClick={handleSaveNotes}
              disabled={notesMutation.isPending}
              data-testid="button-save-notes"
            >
              Save Notes
            </RetroButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmSign} onOpenChange={() => setConfirmSign(null)}>
        <DialogContent className="bg-[#243524] border-[#2d3d2d]">
          <DialogHeader>
            <DialogTitle className="font-['Press_Start_2P'] text-sm text-[#C4A35A]">
              Confirm Signing
            </DialogTitle>
          </DialogHeader>
          <p className="text-white text-sm">
            Are you sure you want to sign{" "}
            <span className="text-[#C4A35A] font-bold">
              {confirmSign?.firstName} {confirmSign?.lastName}
            </span>{" "}
            from the transfer portal? This will add them to your roster.
          </p>
          <DialogFooter>
            <RetroButton variant="outline" onClick={() => setConfirmSign(null)}>
              Cancel
            </RetroButton>
            <RetroButton 
              onClick={handleSign}
              disabled={signMutation.isPending}
              data-testid="button-confirm-sign"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Sign Player
            </RetroButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
