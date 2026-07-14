import { useRef, useState, useEffect, type MutableRefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Loader2, CheckCircle2, XCircle, Sparkles, Image as ImageIcon, Trash2, X, AlertTriangle, Camera,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseErrorMessage } from "@/lib/errorUtils";
import { useUpload } from "@/hooks/use-upload";
import { SCREENSHOT_CATEGORIES, type ScreenshotCategory } from "@shared/schema";

export interface GameReportImage {
  id: string;
  gameId: string;
  leagueId: string;
  uploadedByUserId: string;
  category: ScreenshotCategory;
  objectPath: string;
  ocrStatus: "pending" | "processing" | "done" | "failed";
  ocrResult: Record<string, unknown> | null;
  ocrError: string | null;
  createdAt: string;
}

export const CATEGORY_LABELS: Record<ScreenshotCategory, string> = {
  final_score: "Final Score",
  home_batting: "Home Batting",
  away_batting: "Away Batting",
  home_pitching: "Home Pitching",
  away_pitching: "Away Pitching",
  advanced_stats: "Advanced Stats",
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function useGameReportImages(leagueId: string | undefined, gameId: string | undefined, poll = false) {
  return useQuery<GameReportImage[]>({
    queryKey: ["/api/leagues", leagueId, "games", gameId, "report-images"],
    enabled: !!leagueId && !!gameId,
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/games/${gameId}/report-images`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch screenshots");
      return res.json();
    },
    refetchInterval: poll
      ? (query) => {
          const data = query.state.data as GameReportImage[] | undefined;
          const hasPending = data?.some((img) => img.ocrStatus === "pending" || img.ocrStatus === "processing");
          return hasPending ? 2500 : false;
        }
      : false,
  });
}

/**
 * Shared lightbox overlay used by both CategoryUploadTile and GameScreenshotGallery.
 */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="overlay-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center text-white hover:text-gold rounded-full bg-black/40"
        data-testid="button-close-lightbox"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={url}
        alt="Screenshot"
        className="max-w-full max-h-[90vh] rounded shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/**
 * Per-category upload tile: lets a coach snap/pick a screenshot for one category,
 * shows real image thumbnails, OCR status, and offers an "Apply to form" action once
 * OCR finishes. OCR output is a draft only — nothing is written to the report until
 * the coach explicitly applies it, and every applied field remains editable afterward.
 *
 * When the coach has already corrected fields in this category, the tile shows a
 * "Corrections detected — not auto-applied" note and requires explicit confirmation
 * before overwriting those corrections with a later OCR result.
 */
function CategoryUploadTile({
  leagueId, gameId, category, images, onApply, correctedCategories,
}: {
  leagueId: string; gameId: string; category: ScreenshotCategory;
  images: GameReportImage[];
  onApply: (category: ScreenshotCategory, data: Record<string, unknown>, imageId?: string) => void;
  correctedCategories?: ReadonlySet<ScreenshotCategory>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const categoryImages = images.filter((img) => img.category === category);
  const imagesKey = ["/api/leagues", leagueId, "games", gameId, "report-images"];
  const hasCorrections = correctedCategories?.has(category) ?? false;
  const [pendingConfirmId, setPendingConfirmId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const registerMutation = useMutation({
    mutationFn: async (objectPath: string) =>
      apiRequest("POST", `/api/leagues/${leagueId}/games/${gameId}/report-images`, { category, objectPath }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: imagesKey }),
    onError: (error: Error) => toast({ title: "Upload failed", description: parseErrorMessage(error), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageId: string) => apiRequest("DELETE", `/api/leagues/${leagueId}/games/${gameId}/report-images/${imageId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: imagesKey }),
    onError: (error: Error) => toast({ title: "Delete failed", description: parseErrorMessage(error), variant: "destructive" }),
  });

  const retryOcrMutation = useMutation({
    mutationFn: async (imageId: string) => apiRequest("POST", `/api/leagues/${leagueId}/games/${gameId}/report-images/${imageId}/ocr`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: imagesKey }),
    onError: (error: Error) => toast({ title: "Retry failed", description: parseErrorMessage(error), variant: "destructive" }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Client-side validation: images only, max 10 MB.
    // The <input accept="image/*"> is the first layer; this JS check is belt-and-suspenders.
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Only image files (JPG, PNG, GIF, WebP, HEIC) are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({ title: "File too large", description: "Maximum screenshot size is 10 MB.", variant: "destructive" });
      return;
    }

    const result = await uploadFile(file);
    if (result) registerMutation.mutate(result.objectPath);
    else toast({ title: "Upload failed", description: "Could not upload the screenshot. Try again.", variant: "destructive" });
  }

  function handleApplyClick(img: GameReportImage) {
    if (!img.ocrResult) return;
    if (hasCorrections) {
      setPendingConfirmId(img.id);
    } else {
      onApply(category, img.ocrResult, img.id);
    }
  }

  function handleConfirmApply(img: GameReportImage) {
    if (img.ocrResult) onApply(category, img.ocrResult, img.id);
    setPendingConfirmId(null);
  }

  const busy = isUploading || registerMutation.isPending;
  const hasDoneImages = categoryImages.some((img) => img.ocrStatus === "done" && img.ocrResult);

  return (
    <div className="border border-border rounded-lg p-3 space-y-2" data-testid={`tile-screenshot-${category}`}>
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* Header row: label + upload button */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-pixel text-gold leading-none">{CATEGORY_LABELS[category]}</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="min-h-[44px] px-3 text-xs bg-muted/40 border border-border rounded hover:border-gold hover:text-gold transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          data-testid={`button-upload-${category}`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {categoryImages.length > 0 ? "Add" : "Upload"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
          data-testid={`input-file-${category}`}
        />
      </div>

      {/* Corrections warning */}
      {hasCorrections && hasDoneImages && (
        <div
          className="flex items-start gap-1.5 text-xs text-yellow-400/80 bg-yellow-900/20 border border-yellow-700/30 rounded px-2 py-1.5"
          data-testid={`note-corrections-skipped-${category}`}
        >
          <AlertTriangle className="w-3 h-3 shrink-0 mt-px text-yellow-500" />
          <span>Corrections detected — not auto-applied. Use "Apply" to merge manually.</span>
        </div>
      )}

      {/* Empty state */}
      {categoryImages.length === 0 && (
        <p className="text-xs text-muted-foreground">No screenshot yet</p>
      )}

      {/* Thumbnail grid */}
      {categoryImages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categoryImages.map((img) => (
            <div key={img.id} className="relative group" data-testid={`row-screenshot-${img.id}`}>
              {/* Thumbnail button — tap to open lightbox */}
              <button
                type="button"
                onClick={() => setLightboxUrl(img.objectPath)}
                className="w-16 h-16 rounded border border-border overflow-hidden hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold transition-colors block"
                data-testid={`thumb-${img.id}`}
                aria-label={`View ${CATEGORY_LABELS[category]} screenshot`}
              >
                <img
                  src={img.objectPath}
                  alt={CATEGORY_LABELS[category]}
                  className="w-full h-full object-cover"
                />
              </button>

              {/* OCR status badge overlaid on corner */}
              <div className="absolute top-0.5 left-0.5 pointer-events-none">
                {(img.ocrStatus === "pending" || img.ocrStatus === "processing") && (
                  <span className="flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5">
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-yellow-400" />
                  </span>
                )}
                {img.ocrStatus === "done" && (
                  <span className="flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />
                  </span>
                )}
                {img.ocrStatus === "failed" && (
                  <span className="flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5">
                    <XCircle className="w-2.5 h-2.5 text-red-400" />
                  </span>
                )}
              </div>

              {/* Delete button overlaid on top-right corner */}
              <button
                type="button"
                onClick={() => deleteMutation.mutate(img.id)}
                disabled={deleteMutation.isPending}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 border border-border flex items-center justify-center text-muted-foreground hover:text-red-400 hover:border-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                data-testid={`button-delete-${img.id}`}
                aria-label="Delete screenshot"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Per-image action rows: Apply / Retry / Confirm-overwrite */}
      {categoryImages.map((img) => (
        <div key={`actions-${img.id}`} className="text-xs">
          {img.ocrStatus === "done" && img.ocrResult && (
            pendingConfirmId === img.id ? (
              <span className="flex items-center gap-1.5 flex-wrap" data-testid={`confirm-apply-${img.id}`}>
                <AlertTriangle className="w-3 h-3 shrink-0 text-yellow-500" />
                <span className="text-yellow-400/90">This will overwrite your corrections.</span>
                <button
                  type="button"
                  onClick={() => handleConfirmApply(img)}
                  className="text-gold hover:underline font-medium"
                  data-testid={`button-confirm-apply-${img.id}`}
                >
                  Confirm
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={() => setPendingConfirmId(null)}
                  className="text-muted-foreground hover:text-white"
                  data-testid={`button-cancel-apply-${img.id}`}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => handleApplyClick(img)}
                className="text-gold hover:underline flex items-center gap-1"
                data-testid={`button-apply-${img.id}`}
              >
                <Sparkles className="w-3 h-3" /> Apply to form
              </button>
            )
          )}
          {img.ocrStatus === "failed" && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs border-red-600 text-red-400 gap-1 py-0" title={img.ocrError ?? undefined}>
                  <XCircle className="w-2.5 h-2.5" /> Failed to read
                </Badge>
                <button
                  type="button"
                  onClick={() => retryOcrMutation.mutate(img.id)}
                  disabled={retryOcrMutation.isPending}
                  className="text-muted-foreground hover:text-gold text-xs"
                  data-testid={`button-retry-${img.id}`}
                >
                  Retry
                </button>
              </div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`text-ocr-fallback-${img.id}`}>
                <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-yellow-500" />
                Enter this section manually below
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Full categorized upload panel for the "score" phase of report-game.tsx.
 * Coaches upload screenshots per stat category; OCR auto-fills the form fields
 * as soon as each screenshot is processed. All auto-filled fields remain fully
 * editable and are reviewed by the coach before submission.
 *
 * autoAppliedIdsRef MUST be a parent-level ref (not created here) so it survives
 * unmount/remount when the user navigates between score and review phases.
 * enableAutoApply should be false in edit mode so existing corrected report data
 * is not overwritten by OCR results on load.
 */
export function GameScreenshotUpload({
  leagueId, gameId, onApply, autoAppliedIdsRef, enableAutoApply = true, correctedCategories,
}: {
  leagueId: string; gameId: string;
  onApply: (category: ScreenshotCategory, data: Record<string, unknown>, imageId?: string) => void;
  autoAppliedIdsRef: MutableRefObject<Set<string>>;
  enableAutoApply?: boolean;
  correctedCategories?: ReadonlySet<ScreenshotCategory>;
}) {
  const { data: images } = useGameReportImages(leagueId, gameId, true);
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  useEffect(() => {
    if (!enableAutoApply || !images) return;
    for (const img of images) {
      if (
        img.ocrStatus === "done" &&
        img.ocrResult &&
        !autoAppliedIdsRef.current.has(img.id) &&
        !correctedCategories?.has(img.category)
      ) {
        autoAppliedIdsRef.current.add(img.id);
        onApplyRef.current(img.category, img.ocrResult, img.id);
      }
    }
  }, [images, enableAutoApply, autoAppliedIdsRef, correctedCategories]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Camera className="w-3.5 h-3.5 text-gold" />
        <span className="text-xs font-pixel text-gold">Evidence Screenshots</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload Power Pros screenshots — the app reads your stats and auto-fills the form. Screenshots are stored permanently as proof and shown to your opponent and the commissioner.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCREENSHOT_CATEGORIES.map((category) => (
          <CategoryUploadTile
            key={category}
            leagueId={leagueId}
            gameId={gameId}
            category={category}
            images={images ?? []}
            onApply={onApply}
            correctedCategories={correctedCategories}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only categorized screenshot gallery for the box score view, the
 * opposing coach confirmation screen, and the commissioner review screen.
 * Opens a full-screen lightbox on tap.
 */
export function GameScreenshotGallery({ leagueId, gameId }: { leagueId: string; gameId: string }) {
  const { data: images, isLoading } = useGameReportImages(leagueId, gameId, false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (isLoading || !images || images.length === 0) return null;

  const byCategory = SCREENSHOT_CATEGORIES.map((category) => ({
    category,
    items: images.filter((img) => img.category === category),
  })).filter((g) => g.items.length > 0);

  if (byCategory.length === 0) return null;

  const total = images.length;

  return (
    <div className="space-y-2" data-testid="section-screenshot-gallery">
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
      <div className="flex items-center gap-2">
        <Camera className="w-3.5 h-3.5 text-gold" />
        <span className="text-xs font-pixel text-gold">Evidence Screenshots</span>
        <Badge variant="outline" className="text-xs border-gold/40 text-gold/70 py-0 px-1.5">{total}</Badge>
      </div>
      <div className="space-y-2">
        {byCategory.map(({ category, items }) => (
          <div key={category}>
            <p className="text-xs text-muted-foreground mb-1.5">{CATEGORY_LABELS[category]}</p>
            <div className="flex flex-wrap gap-2">
              {items.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setLightbox(img.objectPath)}
                  className="w-20 h-20 rounded border border-border overflow-hidden hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold transition-colors"
                  data-testid={`thumb-${img.id}`}
                  aria-label={`View ${CATEGORY_LABELS[category]} screenshot`}
                >
                  <img src={img.objectPath} alt={CATEGORY_LABELS[category]} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
