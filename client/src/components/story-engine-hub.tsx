import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Newspaper, Plus, X, Pin, Image as ImageIcon,
  AlertTriangle, BookOpen, Trophy, ChevronRight,
  Clock, Check, SkipForward, Sparkles,
} from "lucide-react";
import addieFriskImg from "@/assets/images/addie-frisk.png";
import sullyPumpImg from "@/assets/images/sully-pump.png";
import type { DynastyNews, StoryEvent, StoryArc, Moment, StoryArcChapter } from "@shared/schema";

type StoryArcWithChapters = StoryArc & { chapters: StoryArcChapter[] };

const journalistInfo: Record<string, { name: string; avatar: string; title: string }> = {
  addie: { name: "Addie Frisk", avatar: addieFriskImg, title: "Game & Conference Reporter" },
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

export function StoryEngineHub({ leagueId, teamId }: { leagueId: string; teamId?: string }) {
  const [activeTab, setActiveTab] = useState<"news" | "drama" | "stories" | "moments">("news");

  const { data: pendingEvents } = useQuery<StoryEvent[]>({
    queryKey: ["/api/leagues", leagueId, "story-events", "pending", teamId],
    queryFn: async () => {
      const url = teamId
        ? `/api/leagues/${leagueId}/story-events/pending?teamId=${teamId}`
        : `/api/leagues/${leagueId}/story-events/pending`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
  });

  const pendingCount = pendingEvents?.length || 0;

  const tabs = [
    { id: "news" as const, label: "News", icon: Newspaper, badge: 0 },
    { id: "drama" as const, label: "Drama", icon: AlertTriangle, badge: pendingCount },
    { id: "stories" as const, label: "Stories", icon: BookOpen, badge: 0 },
    { id: "moments" as const, label: "Moments", icon: Trophy, badge: 0 },
  ];

  return (
    <div data-testid="story-engine-hub">
      <div className="flex items-center gap-1 mb-4 flex-wrap" data-testid="story-engine-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-pixel transition-colors ${
                isActive
                  ? "bg-gold/20 text-gold border border-gold/40"
                  : "bg-muted/50 text-muted-foreground border border-transparent"
              }`}
              data-testid={`tab-story-${tab.id}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[8px]">{tab.label}</span>
              {tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[8px] rounded-full font-bold leading-none">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "news" && <NewsSubTab leagueId={leagueId} />}
      {activeTab === "drama" && <DramaSubTab leagueId={leagueId} teamId={teamId} />}
      {activeTab === "stories" && <StoriesSubTab leagueId={leagueId} />}
      {activeTab === "moments" && <MomentsSubTab leagueId={leagueId} />}
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
            <img src={addieFriskImg} alt="" className="w-4 h-4 rounded-sm" style={{ imageRendering: "pixelated" }} />
            Addie
          </button>
          <button
            onClick={() => setFilterJournalist("sully")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${filterJournalist === "sully" ? "bg-gold/20 text-gold border border-gold/40" : "bg-muted/50 text-muted-foreground border border-transparent"}`}
            data-testid="filter-news-sully"
          >
            <img src={sullyPumpImg} alt="" className="w-4 h-4 rounded-sm" style={{ imageRendering: "pixelated" }} />
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
  return (
    <div className="bg-muted/30 rounded-lg p-4 border border-border/50" data-testid={`card-news-${item.id}`}>
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
            <Badge className={`text-[9px] no-default-hover-elevate no-default-active-elevate ${categoryColors[item.category] || "bg-muted"}`}>
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
  );
}

function DramaSubTab({ leagueId, teamId }: { leagueId: string; teamId?: string }) {
  const { data: allEvents, isLoading } = useQuery<StoryEvent[]>({
    queryKey: ["/api/leagues", leagueId, "story-events"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/story-events`, { credentials: "include" });
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ eventId, choiceId }: { eventId: string; choiceId: string }) => {
      return await apiRequest("POST", `/api/story-events/${eventId}/resolve`, { choiceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "story-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "story-events", "pending"] });
    },
  });

  const pendingEvents = allEvents?.filter(e => e.status === "pending" && e.requiresChoice) || [];
  const resolvedEvents = allEvents?.filter(e => e.status === "resolved") || [];
  const automaticEvents = allEvents?.filter(e => !e.requiresChoice) || [];

  if (isLoading) {
    return (
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gold" />
            <span>Drama Events</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 mb-3" />)}
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard variant="bordered">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-gold" />
          <span>Drama Events</span>
          {pendingEvents.length > 0 && (
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-pixel rounded-md">
              {pendingEvents.length} PENDING
            </span>
          )}
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {pendingEvents.length > 0 && (
          <div className="mb-6">
            <h3 className="font-pixel text-[9px] text-gold mb-3 uppercase tracking-wider">Awaiting Your Decision</h3>
            <div className="space-y-4">
              {pendingEvents.map((event) => (
                <DramaChoiceCard
                  key={event.id}
                  event={event}
                  onResolve={(choiceId) => resolveMutation.mutate({ eventId: event.id, choiceId })}
                  isPending={resolveMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {automaticEvents.length > 0 && (
          <div className="mb-6">
            <h3 className="font-pixel text-[9px] text-muted-foreground mb-3 uppercase tracking-wider">Automatic Events</h3>
            <div className="space-y-2">
              {automaticEvents.slice(0, 10).map((event) => (
                <div key={event.id} className="bg-muted/30 rounded-lg p-3 border border-border/30" data-testid={`card-drama-auto-${event.id}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <h4 className="text-sm font-medium text-foreground">{event.title}</h4>
                    <Badge className="text-[8px] no-default-hover-elevate no-default-active-elevate bg-blue-500/20 text-blue-400">
                      {(event.eventType || "event").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground pl-5">{event.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {resolvedEvents.length > 0 && (
          <div>
            <h3 className="font-pixel text-[9px] text-muted-foreground mb-3 uppercase tracking-wider">Resolved</h3>
            <div className="space-y-2">
              {resolvedEvents.slice(0, 10).map((event) => (
                <div key={event.id} className="bg-muted/20 rounded-lg p-3 border border-border/20 opacity-80" data-testid={`card-drama-resolved-${event.id}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <h4 className="text-sm font-medium text-foreground/80">{event.title}</h4>
                    <Badge className="text-[8px] no-default-hover-elevate no-default-active-elevate bg-green-500/20 text-green-400">
                      Resolved
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground pl-5">{event.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!allEvents || allEvents.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No drama events yet. Advance the week to see events unfold.</p>
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function DramaChoiceCard({ event, onResolve, isPending }: { event: StoryEvent; onResolve: (choiceId: string) => void; isPending: boolean }) {
  const choices = (event.choices as any[] | null) || [];

  const eventTypeColors: Record<string, string> = {
    booster_pressure: "border-amber-500/40",
    recruit_flip: "border-purple-500/40",
    player_discipline: "border-red-500/40",
    nil_negotiation: "border-green-500/40",
  };

  return (
    <div
      className={`bg-muted/40 rounded-lg p-4 border-2 ${eventTypeColors[event.eventType || ""] || "border-gold/40"}`}
      data-testid={`card-drama-pending-${event.id}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h4 className="text-sm font-medium text-gold">{event.title}</h4>
        <Badge className="text-[8px] no-default-hover-elevate no-default-active-elevate bg-amber-500/20 text-amber-400">
          {(event.eventType || "drama").replace(/_/g, " ")}
        </Badge>
      </div>
      <p className="text-sm text-foreground/90 mb-4 pl-6">{event.description}</p>

      {event.journalist && journalistInfo[event.journalist] && (
        <div className="flex items-center gap-2 mb-3 pl-6">
          <img
            src={journalistInfo[event.journalist].avatar}
            alt=""
            className="w-6 h-6 rounded-sm"
            style={{ imageRendering: "pixelated" }}
          />
          <span className="text-xs text-muted-foreground italic">
            Reported by {journalistInfo[event.journalist].name}
          </span>
        </div>
      )}

      <div className="space-y-2 pl-6">
        {choices.map((choice: any) => (
          <button
            key={choice.id}
            onClick={() => onResolve(choice.id)}
            disabled={isPending}
            className="w-full text-left bg-background/50 border border-border rounded-md px-4 py-3 hover:border-gold/60 hover:bg-gold/5 transition-colors group"
            data-testid={`button-drama-choice-${choice.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground group-hover:text-gold transition-colors">
                {choice.label || choice.text}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-gold transition-colors flex-shrink-0" />
            </div>
            {choice.hint && (
              <p className="text-xs text-muted-foreground mt-1">{choice.hint}</p>
            )}
          </button>
        ))}
      </div>

      {event.requiresChoice && (
        <div className="flex items-center gap-1.5 mt-3 pl-6 text-xs text-amber-400">
          <Clock className="w-3 h-3" />
          <span>Decision required before advancing</span>
        </div>
      )}
    </div>
  );
}

function StoriesSubTab({ leagueId }: { leagueId: string }) {
  const { data: arcs, isLoading } = useQuery<StoryArcWithChapters[]>({
    queryKey: ["/api/leagues", leagueId, "story-arcs"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/story-arcs`, { credentials: "include" });
      return res.json();
    },
  });

  const activeArcs = arcs?.filter(a => a.status === "active") || [];
  const completedArcs = arcs?.filter(a => a.status === "completed") || [];

  if (isLoading) {
    return (
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-gold" />
            <span>Story Arcs</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {[1, 2].map((i) => <Skeleton key={i} className="h-32 mb-3" />)}
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard variant="bordered">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-gold" />
          <span>Story Arcs</span>
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {activeArcs.length > 0 && (
          <div className="mb-6">
            <h3 className="font-pixel text-[9px] text-gold mb-3 uppercase tracking-wider">Active Stories</h3>
            <div className="space-y-4">
              {activeArcs.map((arc) => (
                <StoryArcCard key={arc.id} arc={arc} />
              ))}
            </div>
          </div>
        )}

        {completedArcs.length > 0 && (
          <div>
            <h3 className="font-pixel text-[9px] text-muted-foreground mb-3 uppercase tracking-wider">Completed</h3>
            <div className="space-y-3">
              {completedArcs.map((arc) => (
                <StoryArcCard key={arc.id} arc={arc} />
              ))}
            </div>
          </div>
        )}

        {(!arcs || arcs.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No story arcs have begun yet. Keep playing to unlock narratives.</p>
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}

function StoryArcCard({ arc }: { arc: StoryArcWithChapters }) {
  const [expanded, setExpanded] = useState(arc.status === "active");
  const chapters = arc.chapters || [];

  const arcTypeLabels: Record<string, string> = {
    recruit_reveal: "Recruit Reveal",
    draft_watch: "Draft Watch",
    transfer_saga: "Transfer Saga",
    breakout_player: "Breakout Player",
  };

  const arcTypeColors: Record<string, string> = {
    recruit_reveal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    draft_watch: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    transfer_saga: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    breakout_player: "bg-green-500/20 text-green-400 border-green-500/30",
  };

  const progress = arc.totalChapters > 0 ? Math.round((arc.currentChapter / arc.totalChapters) * 100) : 0;

  return (
    <div
      className={`rounded-lg border ${arc.status === "completed" ? "border-border/30 opacity-80" : "border-border/60"} overflow-visible`}
      data-testid={`card-arc-${arc.id}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
        data-testid={`button-arc-toggle-${arc.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="text-sm font-medium text-gold">{arc.title}</h4>
            <Badge className={`text-[8px] no-default-hover-elevate no-default-active-elevate ${arcTypeColors[arc.arcType] || "bg-muted"}`}>
              {arcTypeLabels[arc.arcType] || arc.arcType}
            </Badge>
            {arc.status === "completed" && (
              <Badge className="text-[8px] no-default-hover-elevate no-default-active-elevate bg-green-500/20 text-green-400">
                Complete
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-pixel flex-shrink-0">
              {arc.currentChapter}/{arc.totalChapters}
            </span>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && chapters.length > 0 && (
        <div className="px-4 pb-4">
          <div className="border-l-2 border-border/50 ml-3 space-y-3">
            {chapters.map((chapter, idx) => {
              const isTriggered = chapter.status === "triggered";
              const isSkipped = chapter.status === "skipped";
              const isPending = chapter.status === "pending";

              const journalist = chapter.journalist ? journalistInfo[chapter.journalist] : null;

              return (
                <div
                  key={chapter.id}
                  className={`relative pl-6 ${isSkipped ? "opacity-40" : ""}`}
                  data-testid={`card-chapter-${chapter.id}`}
                >
                  <div className={`absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full border-2 ${
                    isTriggered ? "bg-gold border-gold" : isSkipped ? "bg-muted border-border" : "bg-background border-border"
                  }`} />

                  <div className="flex items-center gap-2 mb-0.5">
                    {isTriggered && <Check className="w-3 h-3 text-green-400" />}
                    {isSkipped && <SkipForward className="w-3 h-3 text-muted-foreground" />}
                    {isPending && <Clock className="w-3 h-3 text-muted-foreground" />}
                    <span className={`text-xs font-medium ${isTriggered ? "text-foreground" : "text-muted-foreground"}`}>
                      Ch. {chapter.chapterNumber}: {chapter.title}
                    </span>
                  </div>

                  {isTriggered && (
                    <div className="mt-1">
                      {journalist && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <img src={journalist.avatar} alt="" className="w-4 h-4 rounded-sm" style={{ imageRendering: "pixelated" }} />
                          <span className="text-[10px] text-muted-foreground">{journalist.name}</span>
                        </div>
                      )}
                      <p className="text-xs text-foreground/80 leading-relaxed">{chapter.content}</p>
                      {chapter.traitRevealed && (
                        <div className="mt-1.5">
                          <Badge className="text-[8px] no-default-hover-elevate no-default-active-elevate bg-gold/20 text-gold border border-gold/30">
                            Trait Revealed: {chapter.traitRevealed}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}

                  {isPending && (
                    <p className="text-[10px] text-muted-foreground italic mt-0.5">
                      Week {chapter.triggerWeek}, Season {chapter.triggerSeason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {arc.revealedTraits && (arc.revealedTraits as string[]).length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <span className="text-[9px] font-pixel text-muted-foreground uppercase tracking-wider">Revealed Traits:</span>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {(arc.revealedTraits as string[]).map((trait, i) => (
                  <Badge key={i} className="text-[8px] no-default-hover-elevate no-default-active-elevate bg-gold/20 text-gold">
                    {trait}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MomentsSubTab({ leagueId }: { leagueId: string }) {
  const { data: allMoments, isLoading } = useQuery<Moment[]>({
    queryKey: ["/api/leagues", leagueId, "moments"],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/moments`, { credentials: "include" });
      return res.json();
    },
  });

  const momentTypeLabels: Record<string, string> = {
    program_first: "Program First",
    player_record: "Player Record",
    coach_milestone: "Coach Milestone",
    dynasty_achievement: "Dynasty Achievement",
  };

  const momentTypeIcons: Record<string, string> = {
    program_first: "bg-gold/20 text-gold border-gold/40",
    player_record: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    coach_milestone: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    dynasty_achievement: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  };

  if (isLoading) {
    return (
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" />
            <span>Moments</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {[1, 2].map((i) => <Skeleton key={i} className="h-24 mb-3" />)}
        </RetroCardContent>
      </RetroCard>
    );
  }

  return (
    <RetroCard variant="bordered">
      <RetroCardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-gold" />
          <span>Moments</span>
          {allMoments && allMoments.length > 0 && (
            <span className="text-xs text-muted-foreground">({allMoments.length})</span>
          )}
        </div>
      </RetroCardHeader>
      <RetroCardContent>
        {(!allMoments || allMoments.length === 0) ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No milestone moments yet. Achievements are recorded as your dynasty progresses.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {allMoments.map((moment) => {
              const journalist = moment.journalist ? journalistInfo[moment.journalist] : null;
              const typeStyle = momentTypeIcons[moment.momentType] || "bg-muted text-muted-foreground border-border";

              return (
                <div
                  key={moment.id}
                  className={`rounded-lg border-2 ${typeStyle} p-4 relative`}
                  data-testid={`card-moment-${moment.id}`}
                >
                  <div className="absolute top-2 right-2">
                    <Trophy className="w-5 h-5 opacity-20" />
                  </div>

                  <Badge className={`text-[8px] mb-2 no-default-hover-elevate no-default-active-elevate ${typeStyle}`}>
                    {momentTypeLabels[moment.momentType] || moment.momentType}
                  </Badge>

                  <h4 className="text-sm font-medium text-gold mb-1 pr-6">{moment.title}</h4>
                  <p className="text-xs text-foreground/80 leading-relaxed mb-2">{moment.description}</p>

                  <div className="flex items-center justify-between">
                    {journalist && (
                      <div className="flex items-center gap-1.5">
                        <img src={journalist.avatar} alt="" className="w-4 h-4 rounded-sm" style={{ imageRendering: "pixelated" }} />
                        <span className="text-[10px] text-muted-foreground">{journalist.name}</span>
                      </div>
                    )}
                    <span className="text-[10px] text-muted-foreground font-pixel">
                      S{moment.season}{moment.week ? ` W${moment.week}` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </RetroCardContent>
    </RetroCard>
  );
}
