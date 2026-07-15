import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Copy, Link2, XCircle, RefreshCw, Share2, Lock, Unlock, BookOpen, CheckCircle2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectVersion {
  id: string;
  versionNumber: number;
  isSealed: boolean;
  sourceType: string;
  publishedAt: string;
  contentHash: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  currentDraftRevision: number;
  versions: ProjectVersion[];
}

interface ShareRecord {
  id: string;
  token?: string | null;
  tokenHash?: string | null;
  versionId?: string | null;
  label: string | null;
  status: string;
  importCount: number;
  maxImports?: number | null;
  expiresAt?: string | null;
  createdAt: string | null;
}

interface ShareClassDialogProps {
  classId: string | null;
  open: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ShareClassDialog({ classId, open, onClose }: ShareClassDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // New share form state
  const [isSealed, setIsSealed] = useState(true);
  const [labelInput, setLabelInput] = useState("");
  const [expiresAfterDays, setExpiresAfterDays] = useState("");
  const [maxImportsInput, setMaxImportsInput] = useState("");

  // After creation: hold plaintext token shown ONCE
  const [newPlaintextToken, setNewPlaintextToken] = useState<string | null>(null);
  const [copiedNewToken, setCopiedNewToken] = useState(false);

  // ── Lazy migration: promote saved class to project+version ─────────────────

  const migrateMutation = useMutation({
    mutationFn: async () => {
      if (!classId) throw new Error("No class selected");
      const res = await apiRequest("POST", `/api/class-projects/from-saved/${classId}`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to prepare class for sharing");
      }
      return res.json() as Promise<{ project: Project; versions: ProjectVersion[] }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-projects", classId, "migration"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: migration, isLoading: migrationLoading } = useQuery<{
    project: Project;
    versions: ProjectVersion[];
  }>({
    queryKey: ["/api/class-projects", classId, "migration"],
    queryFn: async () => {
      if (!classId) throw new Error("No class");
      const res = await fetch(`/api/class-projects/from-saved/${classId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load project");
      }
      return res.json();
    },
    enabled: !!classId && open,
    staleTime: Infinity,
    retry: false,
  });

  const project = migration?.project;
  const versions = migration?.versions ?? [];
  const latestVersion = versions.length > 0 ? versions[versions.length - 1] : null;

  // ── Shares for project ─────────────────────────────────────────────────────

  const { data: shares = [], isLoading: sharesLoading, refetch: refetchShares } = useQuery<ShareRecord[]>({
    queryKey: ["/api/class-projects", project?.id, "shares"],
    queryFn: async () => {
      if (!project?.id) return [];
      const res = await fetch(`/api/class-projects/${project.id}/shares`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load share links");
      return res.json();
    },
    enabled: !!project?.id && open,
    staleTime: 0,
  });

  // Also fetch V1 shares from the old endpoint for backward display
  const { data: v1Shares = [] } = useQuery<ShareRecord[]>({
    queryKey: ["/api/saved-recruiting-classes", classId, "shares"],
    queryFn: async () => {
      if (!classId) return [];
      const res = await fetch(`/api/saved-recruiting-classes/${classId}/shares`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!classId && open,
    staleTime: 0,
  });

  useEffect(() => {
    if (open) {
      setNewPlaintextToken(null);
      setCopiedNewToken(false);
      setLabelInput("");
      setExpiresAfterDays("");
      setMaxImportsInput("");
    }
  }, [open, classId]);

  // ── Publish ────────────────────────────────────────────────────────────────

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!project?.id) throw new Error("No project");
      const res = await apiRequest("POST", `/api/class-projects/${project.id}/publish`, {
        isSealed,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to publish");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-projects", classId, "migration"] });
      toast({ title: "Version Published", description: "You can now create share links." });
    },
    onError: (err: Error) => {
      toast({ title: "Publish Failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Create hardened share ──────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!project?.id) throw new Error("No project");

      const body: Record<string, unknown> = { isSealed, label: labelInput.trim() || null };
      if (expiresAfterDays.trim()) {
        const d = parseInt(expiresAfterDays.trim(), 10);
        if (!isNaN(d) && d > 0) {
          const dt = new Date();
          dt.setDate(dt.getDate() + d);
          body.expiresAt = dt.toISOString();
        }
      }
      if (maxImportsInput.trim()) {
        const n = parseInt(maxImportsInput.trim(), 10);
        if (!isNaN(n) && n > 0) body.maxImports = n;
      }

      const res = await apiRequest("POST", `/api/class-projects/${project.id}/shares`, body);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || "Failed to create link");
      }
      return res.json() as Promise<ShareRecord & { plaintextToken: string }>;
    },
    onSuccess: (data) => {
      setNewPlaintextToken(data.plaintextToken);
      queryClient.invalidateQueries({ queryKey: ["/api/class-projects", project?.id, "shares"] });
      setLabelInput("");
      setExpiresAfterDays("");
      setMaxImportsInput("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Revoke ─────────────────────────────────────────────────────────────────

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => {
      if (!project?.id) throw new Error("No project");
      const res = await apiRequest("DELETE", `/api/class-projects/${project.id}/shares/${shareId}`, undefined);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || "Failed to revoke link");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/class-projects", project?.id, "shares"] });
      toast({ title: "Link Revoked", description: "The share link has been disabled." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // V1 revoke
  const revokeV1Mutation = useMutation({
    mutationFn: async (shareId: string) => {
      const res = await apiRequest("DELETE", `/api/saved-recruiting-classes/${classId}/shares/${shareId}`, undefined);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || "Failed to revoke link");
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

  // ── Copy helpers ───────────────────────────────────────────────────────────

  function copyNewToken() {
    if (!newPlaintextToken) return;
    const url = `${window.location.origin}/class-share/${newPlaintextToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedNewToken(true);
      setTimeout(() => setCopiedNewToken(false), 3000);
    }).catch(() => {
      toast({ title: "Link", description: url });
    });
  }

  function copyV1Url(token: string) {
    const url = `${window.location.origin}/import-class/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Copied!", description: "Share link copied." });
    }).catch(() => {
      toast({ title: "Link", description: url });
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeShares = shares.filter(s => s.status === "active");
  const activeV1Shares = v1Shares.filter(s => s.status === "active" && !s.tokenHash);
  const hasPublishedVersion = versions.length > 0;
  const isLoading = migrationLoading || sharesLoading;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-share-class">
        <DialogHeader>
          <DialogTitle className="text-gold flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Share Recruiting Class
          </DialogTitle>
          <DialogDescription>
            Publish your class, then create shareable links. Sealed packs hide OVR and ratings from recipients.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 mt-2">

            {/* ── Version status ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/10">
              {hasPublishedVersion ? (
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-gold" />
                  <span className="text-xs text-muted-foreground">
                    Published as{" "}
                    <span className="text-gold font-semibold">v{latestVersion!.versionNumber}</span>
                    {latestVersion!.isSealed && (
                      <Badge variant="secondary" className="ml-2 text-xs px-1 py-0">
                        <Lock className="w-2.5 h-2.5 mr-1" />Sealed
                      </Badge>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Draft — publish to enable sharing</span>
                </div>
              )}
              {!hasPublishedVersion && (
                <RetroButton
                  size="sm"
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                  data-testid="button-publish-version"
                >
                  {publishMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Publish
                </RetroButton>
              )}
            </div>

            {/* ── New share token shown once after creation ──────────────── */}
            {newPlaintextToken && (
              <div className="p-3 rounded border border-gold/40 bg-gold/5 space-y-2" data-testid="panel-new-token">
                <div className="flex items-center gap-2 text-xs text-gold font-semibold">
                  <Link2 className="w-3.5 h-3.5" />
                  Share Link Created — Copy Now
                </div>
                <p className="text-xs text-muted-foreground">
                  This token will not be shown again. Copy it before closing.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs bg-background/80 border border-border px-2 py-1.5 rounded truncate text-foreground" data-testid="text-new-token">
                    {`${window.location.origin}/class-share/${newPlaintextToken}`}
                  </code>
                  <RetroButton
                    size="sm"
                    variant={copiedNewToken ? "outline" : "primary"}
                    onClick={copyNewToken}
                    data-testid="button-copy-new-token"
                  >
                    {copiedNewToken ? (
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </RetroButton>
                </div>
              </div>
            )}

            {/* ── Create new share form ──────────────────────────────────── */}
            {hasPublishedVersion && (
              <div className="space-y-3 p-3 rounded border border-border bg-muted/10">
                <p className="text-xs font-semibold text-muted-foreground uppercase">New Share Link</p>

                {/* Sealed toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isSealed ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <Label className="text-xs cursor-pointer" htmlFor="sealed-toggle">
                      {isSealed ? "Sealed (recipient sees fog-of-war)" : "Open (recipient sees full data)"}
                    </Label>
                  </div>
                  <Switch
                    id="sealed-toggle"
                    checked={isSealed}
                    onCheckedChange={setIsSealed}
                    data-testid="switch-sealed-mode"
                  />
                </div>

                {/* Optional label */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Label (optional)</Label>
                  <Input
                    placeholder="e.g. Discord share"
                    value={labelInput}
                    onChange={e => setLabelInput(e.target.value)}
                    className="h-7 text-xs"
                    data-testid="input-share-label"
                  />
                </div>

                {/* Expiry + max imports row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Expires in (days)</Label>
                    <Input
                      placeholder="Never"
                      value={expiresAfterDays}
                      onChange={e => setExpiresAfterDays(e.target.value)}
                      type="number"
                      min="1"
                      className="h-7 text-xs"
                      data-testid="input-expires-days"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Max imports</Label>
                    <Input
                      placeholder="Unlimited"
                      value={maxImportsInput}
                      onChange={e => setMaxImportsInput(e.target.value)}
                      type="number"
                      min="1"
                      className="h-7 text-xs"
                      data-testid="input-max-imports"
                    />
                  </div>
                </div>

                <RetroButton
                  size="sm"
                  onClick={() => { setNewPlaintextToken(null); createMutation.mutate(); }}
                  disabled={createMutation.isPending}
                  className="w-full"
                  data-testid="button-create-share-link"
                >
                  {createMutation.isPending ? (
                    <RefreshCw className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="w-3 h-3 mr-2" />
                  )}
                  Generate Share Link
                </RetroButton>
              </div>
            )}

            {/* ── Active V2 shares list ──────────────────────────────────── */}
            {activeShares.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase">Active Links ({activeShares.length})</p>
                {activeShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center gap-2 p-2 rounded border border-border bg-muted/20"
                    data-testid={`share-link-row-${share.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {share.label && (
                          <span className="text-xs font-medium text-foreground">{share.label}</span>
                        )}
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {share.importCount} import{share.importCount !== 1 ? "s" : ""}
                        </Badge>
                        {share.maxImports != null && (
                          <span className="text-xs text-muted-foreground/60">
                            / {share.maxImports} max
                          </span>
                        )}
                        {share.expiresAt && (
                          <span className="text-xs text-muted-foreground/60">
                            Expires {new Date(share.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                        {share.createdAt && (
                          <span className="text-xs text-muted-foreground/60">
                            {new Date(share.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/50 mt-0.5 font-mono">
                        {share.tokenHash ? "••• hardened token" : share.token ? `token: ${share.token}` : ""}
                      </p>
                    </div>
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
                ))}
              </div>
            )}

            {/* ── Legacy V1 shares ───────────────────────────────────────── */}
            {activeV1Shares.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase">Legacy Links ({activeV1Shares.length})</p>
                {activeV1Shares.map((share) => {
                  const url = share.token
                    ? `${window.location.origin}/import-class/${share.token}`
                    : null;
                  return (
                    <div
                      key={share.id}
                      className="flex items-center gap-2 p-2 rounded border border-border/50 bg-muted/10"
                      data-testid={`v1-share-link-row-${share.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        {url && (
                          <p className="font-mono text-xs text-muted-foreground truncate">{url}</p>
                        )}
                        <Badge variant="secondary" className="text-xs px-1 py-0 mt-0.5">
                          {share.importCount} import{share.importCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {url && (
                          <RetroButton
                            variant="ghost"
                            size="sm"
                            onClick={() => copyV1Url(share.token!)}
                            data-testid={`button-copy-v1-link-${share.id}`}
                            title="Copy link"
                          >
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </RetroButton>
                        )}
                        <RetroButton
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeV1Mutation.mutate(share.id)}
                          disabled={revokeV1Mutation.isPending}
                          data-testid={`button-revoke-v1-link-${share.id}`}
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

            {!hasPublishedVersion && activeShares.length === 0 && activeV1Shares.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground text-center py-2" data-testid="text-no-share-links">
                Publish a version first to create share links.
              </p>
            )}

            <div className="pt-1 flex justify-end">
              <RetroButton variant="outline" size="sm" onClick={onClose} data-testid="button-close-share-dialog">
                Close
              </RetroButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
