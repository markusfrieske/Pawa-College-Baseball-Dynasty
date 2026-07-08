import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Loader2, CheckCircle2, XCircle, Sparkles, Image as ImageIcon, Trash2, X,
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
 * Per-category upload tile: lets a coach snap/pick a screenshot for one category,
 * shows OCR status, and offers an "Apply to form" action once OCR finishes.
 * OCR output is a draft only — nothing is written to the report until the coach
 * explicitly applies it, and every applied field remains editable afterward.
 */
function CategoryUploadTile({
  leagueId, gameId, category, images, onApply,
}: {
  leagueId: string; gameId: string; category: ScreenshotCategory;
  images: GameReportImage[]; onApply: (category: ScreenshotCategory, data: Record<string, unknown>) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const categoryImages = images.filter((img) => img.category === category);
  const imagesKey = ["/api/leagues", leagueId, "games", gameId, "report-images"];

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
    const result = await uploadFile(file);
    if (result) registerMutation.mutate(result.objectPath);
    else toast({ title: "Upload failed", description: "Could not upload the screenshot. Try again.", variant: "destructive" });
  }

  const busy = isUploading || registerMutation.isPending;

  return (
    <div className="border border-border rounded p-2 space-y-1.5" data-testid={`tile-screenshot-${category}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-pixel text-gold">{CATEGORY_LABELS[category]}</span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="text-[9px] px-2 py-1 bg-muted/40 border border-border rounded hover:border-gold hover:text-gold transition-colors flex items-center gap-1 disabled:opacity-50"
          data-testid={`button-upload-${category}`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {categoryImages.length > 0 ? "Add another" : "Upload"}
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
      {categoryImages.length === 0 && (
        <p className="text-[9px] text-muted-foreground">No screenshot uploaded yet</p>
      )}
      {categoryImages.map((img) => (
        <div key={img.id} className="flex items-center gap-2 text-[9px] flex-wrap" data-testid={`row-screenshot-${img.id}`}>
          <a
            href={img.objectPath}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-muted-foreground hover:text-gold"
            data-testid={`link-view-${img.id}`}
          >
            <ImageIcon className="w-3 h-3" /> View
          </a>
          {(img.ocrStatus === "pending" || img.ocrStatus === "processing") && (
            <Badge variant="outline" className="text-[8px] border-yellow-600 text-yellow-400 gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Reading...
            </Badge>
          )}
          {img.ocrStatus === "done" && (
            <>
              <Badge variant="outline" className="text-[8px] border-green-600 text-green-400 gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Read
              </Badge>
              <button
                type="button"
                onClick={() => img.ocrResult && onApply(category, img.ocrResult)}
                className="text-gold hover:underline flex items-center gap-0.5"
                data-testid={`button-apply-${img.id}`}
              >
                <Sparkles className="w-3 h-3" /> Apply to form
              </button>
            </>
          )}
          {img.ocrStatus === "failed" && (
            <>
              <Badge variant="outline" className="text-[8px] border-red-600 text-red-400 gap-1" title={img.ocrError ?? undefined}>
                <XCircle className="w-2.5 h-2.5" /> Failed
              </Badge>
              <button
                type="button"
                onClick={() => retryOcrMutation.mutate(img.id)}
                disabled={retryOcrMutation.isPending}
                className="text-muted-foreground hover:text-gold"
                data-testid={`button-retry-${img.id}`}
              >
                Retry
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => deleteMutation.mutate(img.id)}
            disabled={deleteMutation.isPending}
            className="text-muted-foreground hover:text-red-400 ml-auto"
            data-testid={`button-delete-${img.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Full categorized upload panel for the "score" phase of report-game.tsx.
 * Coaches upload one screenshot per stat category; OCR drafts extracted stats
 * which the coach can apply into the existing box-score form fields (still
 * fully editable afterward — nothing here writes to the report directly).
 */
export function GameScreenshotUpload({
  leagueId, gameId, onApply,
}: {
  leagueId: string; gameId: string;
  onApply: (category: ScreenshotCategory, data: Record<string, unknown>) => void;
}) {
  const { data: images } = useGameReportImages(leagueId, gameId, true);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-3.5 h-3.5 text-gold" />
        <span className="text-[10px] font-pixel text-gold">Screenshot Import (Optional)</span>
      </div>
      <p className="text-[9px] text-muted-foreground">
        Upload eBaseball Power Pros screenshots and let OCR draft the stats for you. Review and correct everything before submitting.
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
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Read-only categorized screenshot gallery for the box score view and the
 * commissioner review screen. Opens a lightweight lightbox on click.
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

  return (
    <div className="space-y-2" data-testid="section-screenshot-gallery">
      <span className="text-[10px] font-pixel text-gold">Submitted Screenshots</span>
      <div className="space-y-2">
        {byCategory.map(({ category, items }) => (
          <div key={category}>
            <p className="text-[9px] text-muted-foreground mb-1">{CATEGORY_LABELS[category]}</p>
            <div className="flex flex-wrap gap-2">
              {items.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setLightbox(img.objectPath)}
                  className="w-16 h-16 rounded border border-border overflow-hidden hover:border-gold transition-colors"
                  data-testid={`thumb-${img.id}`}
                >
                  <img src={img.objectPath} alt={CATEGORY_LABELS[category]} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          data-testid="overlay-lightbox"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white hover:text-gold"
            data-testid="button-close-lightbox"
          >
            <X className="w-6 h-6" />
          </button>
          <img src={lightbox} alt="Screenshot" className="max-w-full max-h-full rounded" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
