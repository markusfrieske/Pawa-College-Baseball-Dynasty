import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, XCircle, RefreshCw, Share2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShareRecord {
  id: string;
  token: string;
  label: string | null;
  status: string;
  importCount: number;
  createdAt: string | null;
}

interface ShareClassDialogProps {
  classId: string | null;
  open: boolean;
  onClose: () => void;
}

export function ShareClassDialog({ classId, open, onClose }: ShareClassDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: shares = [], isLoading, refetch } = useQuery<ShareRecord[]>({
    queryKey: ["/api/saved-recruiting-classes", classId, "shares"],
    queryFn: async () => {
      if (!classId) return [];
      const res = await fetch(`/api/saved-recruiting-classes/${classId}/shares`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load share links");
      return res.json();
    },
    enabled: !!classId && open,
    staleTime: 0,
  });

  useEffect(() => {
    if (open && classId) refetch();
  }, [open, classId]);

  const activeShares = shares.filter(s => s.status === "active");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/saved-recruiting-classes/${classId}/shares`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to create link");
      }
      return res.json();
    },
    onSuccess: (share: ShareRecord) => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes", classId, "shares"] });
      const url = `${window.location.origin}/import-class/${share.token}`;
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: "Share Link Created", description: "Link copied to clipboard." });
      }).catch(() => {
        toast({ title: "Share Link Created", description: url });
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const res = await apiRequest("DELETE", `/api/saved-recruiting-classes/${classId}/shares/${shareId}`, undefined);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to revoke link");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-recruiting-classes", classId, "shares"] });
      toast({ title: "Link Revoked", description: "The share link has been disabled." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function copyUrl(token: string) {
    const url = `${window.location.origin}/import-class/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
      toast({ title: "Copied!", description: "Share link copied to clipboard." });
    }).catch(() => {
      toast({ title: "Link", description: url });
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-share-class">
        <DialogHeader>
          <DialogTitle className="text-gold flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Share Recruiting Class
          </DialogTitle>
          <DialogDescription>
            Create shareable links that let others preview and save a copy of this class. Links can be revoked at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <RetroButton
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full"
            data-testid="button-create-share-link"
          >
            {createMutation.isPending ? (
              <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
            ) : (
              <Link2 className="w-3 h-3 mr-2" />
            )}
            Create New Share Link
          </RetroButton>

          {isLoading ? (
            <div className="text-center py-4">
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : activeShares.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3" data-testid="text-no-share-links">
              No active share links. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase">Active Links ({activeShares.length})</p>
              {activeShares.map((share) => {
                const url = `${window.location.origin}/import-class/${share.token}`;
                const isCopied = copiedToken === share.token;
                return (
                  <div
                    key={share.id}
                    className="flex items-center gap-2 p-2 rounded border border-border bg-muted/20"
                    data-testid={`share-link-row-${share.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-muted-foreground truncate">{url}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {share.importCount} import{share.importCount !== 1 ? "s" : ""}
                        </Badge>
                        {share.createdAt && (
                          <span className="text-xs text-muted-foreground/60">
                            {new Date(share.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <RetroButton
                        variant="ghost"
                        size="sm"
                        onClick={() => copyUrl(share.token)}
                        data-testid={`button-copy-link-${share.id}`}
                        title="Copy link"
                      >
                        {isCopied ? (
                          <span className="text-xs text-green-400">✓</span>
                        ) : (
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        )}
                      </RetroButton>
                      <RetroButton
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeMutation.mutate(share.id)}
                        disabled={revokeMutation.isPending}
                        data-testid={`button-revoke-link-${share.id}`}
                        title="Revoke link"
                      >
                        <XCircle className="w-3 h-3 text-red-400" />
                      </RetroButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-1 flex justify-end">
            <RetroButton variant="outline" size="sm" onClick={onClose} data-testid="button-close-share-dialog">
              Close
            </RetroButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
