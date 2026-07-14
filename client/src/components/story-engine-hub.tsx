import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArtPanel } from "@/components/art-panel";
import { getStorylineArt } from "@/lib/art-assets";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Newspaper, Plus, X, Pin, Image as ImageIcon } from "lucide-react";
import addieFriskImg from "@/assets/images/addie-frisk.png";
import sullyPumpImg from "@/assets/images/sully-pump.png";
import type { DynastyNews } from "@shared/schema";

const journalistInfo: Record<string, { name: string; avatar: string; title: string }> = {
  addie: { name: "Addie Frisk", avatar: addieFriskImg, title: "Dynasty & Conference Reporter" },
  sully: { name: "Sully Pump", avatar: sullyPumpImg, title: "Recruiting Analyst" },
};

const categoryLabels: Record<string, string> = {
  general: "General", recruiting: "Recruiting", game: "Game Result",
  postseason: "Postseason", conference: "Conference", recap: "Weekly Recap",
  trade: "Trade", announcement: "Announcement", moment: "Moment",
};

const categoryColors: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  recruiting: "bg-blue-500/20 text-blue-400",
  game: "bg-green-500/20 text-green-400",
  postseason: "bg-amber-500/20 text-amber-400",
  conference: "bg-cyan-500/20 text-cyan-400",
  recap: "bg-indigo-500/20 text-indigo-400",
  trade: "bg-purple-500/20 text-purple-400",
  announcement: "bg-yellow-500/20 text-yellow-400",
  moment: "bg-gold/20 text-gold",
};

export function StoryEngineHub({ leagueId }: { leagueId: string; teamId?: string }) {
  return (
    <div data-testid="story-engine-hub">
      <NewsSubTab leagueId={leagueId} />
    </div>
  );
}

function NewsSubTab({ leagueId }: { leagueId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [filterJournalist, setFilterJournalist] = useState<string>("all");

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const { data: news, isLoading } = useQuery<DynastyNews[]>({
    queryKey: ["/api/leagues", leagueId, "news"],
  });

  const createNewsMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; category: string; imageUrl?: string | null }) => {
      return await apiRequest("POST", `/api/leagues/${leagueId}/news`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "news"] });
      setShowForm(false);
      setTitle("");
      setContent("");
      setCategory("general");
      setImageUrl(null);
    },
  });

  const filteredNews = news?.filter(item => {
    if (filterJournalist === "all") return true;
    if (filterJournalist === "user") return !item.journalist;
    return item.journalist === filterJournalist;
  });

  if (isLoading) {
    return (
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-gold" />
            <span>Dynasty News</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 mb-3" />
          ))}
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard variant="bordered">
      <RetroCardHeader className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gold" />
          <span>Dynasty News</span>
        </div>
        <RetroButton
          size="sm"
          onClick={() => setShowForm(!showForm)}
          data-testid="button-create-news"
        >
          <Plus className="w-4 h-4 mr-1" />
          Post
        </RetroButton>
      </RetroCardHeader>
      <RetroCardContent>
        <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="news-filters">
          <button
            onClick={() => setFilterJournalist("all")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "all" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-all"
          >
            All
          </button>
          <button
            onClick={() => setFilterJournalist("addie")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "addie" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-addie"
          >
            <img src={addieFriskImg} alt="" className="w-4 h-4 rounded-sm" />
            Addie
          </button>
          <button
            onClick={() => setFilterJournalist("sully")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "sully" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-sully"
          >
            <img src={sullyPumpImg} alt="" className="w-4 h-4 rounded-sm" />
            Sully
          </button>
          <button
            onClick={() => setFilterJournalist("user")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "user" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-user"
          >
            Commissioner
          </button>
        </div>

        {showForm && (
          <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-3">
            <RetroInput
              placeholder="News title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-news-title"
            />
            <textarea
              placeholder="Write your news post..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-background border border-border rounded p-2 text-sm min-h-[100px] resize-none focus:outline-none focus:border-gold"
              data-testid="input-news-content"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-background border border-border rounded px-2 py-1 text-sm hover:border-gold transition-colors">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Add Image</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" data-testid="input-news-image" />
              </label>
              {imageUrl && (
                <div className="flex items-center gap-2">
                  <img src={imageUrl} alt="Preview" className="w-10 h-10 object-cover rounded" />
                  <button onClick={() => setImageUrl(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-background border border-border rounded px-2 py-1 text-sm"
                data-testid="select-news-category"
              >
                <option value="general">General</option>
                <option value="recruiting">Recruiting</option>
                <option value="game">Game Result</option>
                <option value="trade">Trade</option>
                <option value="announcement">Announcement</option>
              </select>
              <div className="flex-1" />
              <RetroButton variant="outline" size="sm" onClick={() => setShowForm(false)} data-testid="button-cancel-news">
                Cancel
              </RetroButton>
              <RetroButton
                size="sm"
                onClick={() => createNewsMutation.mutate({ title, content, category, imageUrl })}
                disabled={!title.trim() || !content.trim() || createNewsMutation.isPending}
                data-testid="button-submit-news"
              >
                {createNewsMutation.isPending ? "Posting..." : "Post"}
              </RetroButton>
            </div>
          </div>
        )}

        {(!filteredNews || filteredNews.length === 0) ? (
          <div className="text-center py-8 text-muted-foreground">
            <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{filterJournalist !== "all" ? "No stories from this reporter yet." : "No news yet. Be the first to post!"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNews.map((item) => (
              <NewsArticle key={item.id} item={item} />
            ))}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function NewsArticle({ item }: { item: DynastyNews }) {
  const journalist = item.journalist ? journalistInfo[item.journalist] : null;
  const artSrc = getStorylineArt(item.category);
  return (
    <div className="bg-muted/30 rounded-lg border border-border/50 overflow-hidden" data-testid={`card-news-${item.id}`}>
      <div
        className="relative h-16 sm:h-20 overflow-hidden"
        aria-hidden="true"
      >
        <img
          src={artSrc}
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{ objectPosition: "center center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-background/80 pointer-events-none" />
      </div>
      <div className="p-4">
      <div className="flex items-start gap-3 mb-2">
        {journalist ? (
          <img
            src={journalist.avatar}
            alt={journalist.name}
            className="w-10 h-10 rounded-md flex-shrink-0 border border-gold/30"
            style={{ imageRendering: "pixelated" }}
            data-testid={`avatar-journalist-${item.journalist}`}
          />
        ) : (
          <div className="w-10 h-10 rounded-md flex-shrink-0 bg-muted border border-border flex items-center justify-center">
            <Newspaper className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.isSticky && <Pin className="w-3 h-3 text-gold flex-shrink-0" />}
            <h4 className="font-medium text-gold text-sm leading-tight">{item.title}</h4>
            <Badge className={`text-xs no-default-hover-elevate no-default-active-elevate ${categoryColors[item.category] || "bg-muted"}`}>
              {categoryLabels[item.category] || item.category}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {journalist ? (
              <>
                <span className="text-foreground/80">{journalist.name}</span>
                <span className="mx-1 opacity-50">|</span>
                <span className="italic">{journalist.title}</span>
              </>
            ) : (
              <span>{item.authorName}</span>
            )}
            {item.season && (
              <>
                <span className="mx-1 opacity-50">|</span>
                Season {item.season}{item.week ? `, Week ${item.week}` : ""}
              </>
            )}
            {!item.season && (
              <>
                <span className="mx-1 opacity-50">|</span>
                {new Date(item.createdAt).toLocaleDateString()}
              </>
            )}
          </p>
        </div>
      </div>
      {item.imageUrl && (
        <div className="my-3 pl-[52px]">
          <img src={item.imageUrl} alt={item.title} className="max-w-full max-h-64 rounded-lg object-cover" />
        </div>
      )}
      <p className="text-sm text-foreground/90 whitespace-pre-wrap pl-[52px] leading-relaxed">{item.content}</p>
      </div>
    </div>
  );
}

