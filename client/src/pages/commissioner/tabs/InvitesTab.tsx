import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link as LinkIcon, UserPlus, X } from "lucide-react";
import { RetroCard, RetroCardContent, RetroCardHeader } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import { EXPIRY_OPTIONS } from "../helpers/phaseHelpers";
import type { LeagueInvite } from "@shared/schema";

interface InvitesTabProps {
  leagueId: string;
  invites: LeagueInvite[];
}

export function InvitesTab({ leagueId, invites }: InvitesTabProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [expiresIn, setExpiresIn] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leagues/${leagueId}/invites`, {
        label: label || undefined,
        expiresIn: expiresIn || undefined,
      });
      return res.json();
    },
    onSuccess: (data: LeagueInvite) => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      setLabel("");
      setExpiresIn("");
      const link = `${window.location.origin}/invite/${data.inviteCode}`;
      navigator.clipboard.writeText(link);
      toast({ title: "Invite Link Created", description: "Link copied to clipboard." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", `/api/invites/${code}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "commissioner"] });
      toast({ title: "Invite Revoked", description: "The invite link has been disabled." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: parseErrorMessage(error), variant: "destructive" });
    },
  });

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(link);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Link Copied", description: "Invite link copied to clipboard." });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="text-yellow-400 border-yellow-400/50">
            Active
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="outline" className="text-green-400 border-green-400/50">
            Accepted
          </Badge>
        );
      case "revoked":
        return (
          <Badge variant="outline" className="text-red-400 border-red-400/50">
            Revoked
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingInvites = invites.filter((i) => i.status === "pending");
  const pastInvites = invites.filter((i) => i.status !== "pending");

  return (
    <div className="space-y-6">
      <RetroCard>
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-gold" />
            <span>Generate Invite Link</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-muted-foreground mb-4">
            Generate a shareable link that anyone can use to join your dynasty and claim an
            available CPU team.
          </p>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <RetroInput
              type="text"
              placeholder="Label (optional, e.g. 'For Mike')"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1 min-w-0"
              data-testid="input-invite-label"
            />
            <select
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-gold shrink-0"
              data-testid="select-invite-expiry"
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-forest-card">
                  {o.label}
                </option>
              ))}
            </select>
            <RetroButton
              onClick={() => generateLinkMutation.mutate()}
              disabled={generateLinkMutation.isPending}
              data-testid="button-generate-invite"
              className="shrink-0"
            >
              <LinkIcon className="w-4 h-4 mr-2" />
              {generateLinkMutation.isPending ? "Generating..." : "Generate Link"}
            </RetroButton>
          </div>
        </RetroCardContent>
      </RetroCard>

      {pendingInvites.length > 0 && (
        <RetroCard>
          <RetroCardHeader className="flex items-center justify-between gap-4">
            <span>Active Links</span>
            <Badge variant="outline" className="text-[8px]">
              {pendingInvites.length} active
            </Badge>
          </RetroCardHeader>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex flex-col gap-2 p-3 bg-muted/30 rounded">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <LinkIcon className="w-3.5 h-3.5 text-gold shrink-0" />
                    <span className="text-xs truncate text-muted-foreground">
                      {invite.label || `Invite ${invite.inviteCode.substring(0, 6)}...`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge(invite.status)}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(invite.createdAt).toLocaleDateString()}
                      {invite.expiresAt && (
                        <span
                          className={
                            new Date(invite.expiresAt) <= new Date()
                              ? " text-red-400"
                              : " text-yellow-400/80"
                          }
                        >
                          {" · "}Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/invite/${invite.inviteCode}`}
                    className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground font-mono select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    data-testid={`input-invite-url-${invite.inviteCode}`}
                  />
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => copyInviteLink(invite.inviteCode)}
                    data-testid={`button-copy-invite-${invite.inviteCode}`}
                  >
                    {copied === invite.inviteCode ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </RetroButton>
                  <RetroButton
                    variant="outline"
                    size="sm"
                    onClick={() => revokeMutation.mutate(invite.inviteCode)}
                    disabled={revokeMutation.isPending}
                    data-testid={`button-revoke-invite-${invite.inviteCode}`}
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </RetroButton>
                </div>
              </div>
            ))}
          </div>
        </RetroCard>
      )}

      {pastInvites.length > 0 && (
        <RetroCard>
          <RetroCardHeader className="flex items-center justify-between gap-4">
            <span>Past Invites</span>
            <Badge variant="outline" className="text-[8px]">
              {pastInvites.length} total
            </Badge>
          </RetroCardHeader>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {pastInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded opacity-60"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {invite.label || `Invite ${invite.inviteCode.substring(0, 6)}...`}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Created: {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {statusBadge(invite.status)}
              </div>
            ))}
          </div>
        </RetroCard>
      )}

      {invites.length === 0 && (
        <RetroCard>
          <RetroCardContent>
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No invite links yet</p>
              <p className="text-sm mt-2">
                Generate a link above and share it with friends to invite them to your dynasty
              </p>
            </div>
          </RetroCardContent>
        </RetroCard>
      )}
    </div>
  );
}
