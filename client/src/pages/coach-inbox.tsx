import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, MailOpen, Archive, Target, Eye, Gamepad2,
  FileText, ShieldCheck, TrendingUp, Cpu, ChevronRight,
  MailCheck, Inbox, RefreshCw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { RetroCard, RetroCardContent } from "@/components/ui/retro-card";
import { RetroButton } from "@/components/ui/retro-button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

type CoachMessageCategory =
  | "recruiting" | "scouting" | "game_prep" | "reports"
  | "commissioner" | "player_development" | "system";

interface CoachMessage {
  id: string;
  leagueId: string;
  userId: string | null;
  teamId: string | null;
  category: CoachMessageCategory;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

const CATEGORY_META: Record<CoachMessageCategory, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = {
  recruiting:        { label: "Recruiting",      icon: Target,       color: "text-green-400",  bg: "bg-green-400/10" },
  scouting:          { label: "Scouting",        icon: Eye,          color: "text-blue-400",   bg: "bg-blue-400/10"  },
  game_prep:         { label: "Game Prep",       icon: Gamepad2,     color: "text-yellow-400", bg: "bg-yellow-400/10"},
  reports:           { label: "Reports",         icon: FileText,     color: "text-orange-400", bg: "bg-orange-400/10"},
  commissioner:      { label: "Commissioner",    icon: ShieldCheck,  color: "text-gold",       bg: "bg-gold/10"      },
  player_development:{ label: "Player Dev",      icon: TrendingUp,   color: "text-purple-400", bg: "bg-purple-400/10"},
  system:            { label: "System",          icon: Cpu,          color: "text-gray-400",   bg: "bg-gray-400/10"  },
};

type FilterTab = "all" | "unread" | CoachMessageCategory;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all",               label: "All"        },
  { key: "unread",            label: "Unread"     },
  { key: "recruiting",        label: "Recruiting" },
  { key: "scouting",          label: "Scouting"   },
  { key: "game_prep",         label: "Game Prep"  },
  { key: "reports",           label: "Reports"    },
  { key: "commissioner",      label: "Commissioner" },
  { key: "player_development",label: "Player Dev" },
  { key: "system",            label: "System"     },
];

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function MessageCard({
  msg,
  leagueId,
  onRead,
  onArchive,
}: {
  msg: CoachMessage;
  leagueId: string;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const [, navigate] = useLocation();
  const meta = CATEGORY_META[msg.category] ?? CATEGORY_META.system;
  const Icon = meta.icon;
  const isUnread = !msg.readAt;

  function handleCta() {
    if (!msg.readAt) onRead(msg.id);
    if (msg.ctaUrl) navigate(msg.ctaUrl);
  }

  return (
    <RetroCard
      className={`transition-colors ${isUnread ? "border-gold/30" : "border-border/40 opacity-80"}`}
      data-testid={`card-inbox-msg-${msg.id}`}
    >
      <RetroCardContent className="p-3 sm:p-4">
        <div className="flex gap-3">
          {/* Category icon */}
          <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-md flex items-center justify-center ${meta.bg}`}>
            <Icon className={`w-4 h-4 ${meta.color}`} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isUnread && (
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gold" aria-label="Unread" />
                )}
                <Badge
                  variant="outline"
                  className={`text-xs px-1.5 py-0 ${meta.color} border-current/30 font-medium`}
                >
                  {meta.label}
                </Badge>
              </div>
              <span className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo(msg.createdAt)}
              </span>
            </div>

            <p
              className={`mt-1 text-sm font-semibold leading-tight ${isUnread ? "text-foreground" : "text-muted-foreground"}`}
              data-testid={`text-msg-title-${msg.id}`}
            >
              {msg.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {msg.body}
            </p>

            {/* Action row */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {msg.ctaLabel && msg.ctaUrl && (
                <RetroButton
                  variant="primary"
                  size="sm"
                  onClick={handleCta}
                  className="text-xs px-3 py-1.5 min-h-[36px]"
                  data-testid={`btn-msg-cta-${msg.id}`}
                >
                  {msg.ctaLabel}
                  <ChevronRight className="w-3 h-3 ml-1" />
                </RetroButton>
              )}
              {isUnread && (
                <button
                  type="button"
                  onClick={() => onRead(msg.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[36px] px-2"
                  data-testid={`btn-msg-read-${msg.id}`}
                  aria-label="Mark as read"
                >
                  <MailOpen className="w-3.5 h-3.5" />
                  <span>Mark read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onArchive(msg.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[36px] px-2 ml-auto"
                data-testid={`btn-msg-archive-${msg.id}`}
                aria-label="Archive"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive</span>
              </button>
            </div>
          </div>
        </div>
      </RetroCardContent>
    </RetroCard>
  );
}

export default function CoachInboxPage() {
  const leagueMatch = window.location.pathname.match(/^\/league\/([^/]+)/);
  const leagueId = leagueMatch?.[1] ?? "";
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;

  const qc = useQueryClient();

  const queryParams = new URLSearchParams({
    limit: String(LIMIT),
    offset: String(offset),
    ...(activeTab === "unread" ? { unread: "true" } : {}),
    ...(activeTab !== "all" && activeTab !== "unread" ? { category: activeTab } : {}),
    ...(showArchived ? { archived: "true" } : {}),
  });

  const queryKey = ["/api/leagues", leagueId, "messages", activeTab, showArchived, offset];

  const { data, isLoading, refetch } = useQuery<{ messages: CoachMessage[]; hasMore: boolean }>({
    queryKey,
    queryFn: () => fetch(`/api/leagues/${leagueId}/messages?${queryParams}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!leagueId,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/leagues", leagueId, "messages", "unread-count"],
    queryFn: () => fetch(`/api/leagues/${leagueId}/messages/unread-count`, { credentials: "include" }).then(r => r.json()),
    enabled: !!leagueId,
    refetchInterval: 60_000,
  });
  const unreadCount = countData?.count ?? 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "messages"] });
  };

  const readMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/leagues/${leagueId}/messages/${id}/read`),
    onSuccess: invalidate,
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/leagues/${leagueId}/messages/${id}/archive`),
    onSuccess: invalidate,
  });

  const markAllReadMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/leagues/${leagueId}/messages/mark-all-read`),
    onSuccess: invalidate,
  });

  function switchTab(tab: FilterTab) {
    setActiveTab(tab);
    setOffset(0);
  }

  const messages = data?.messages ?? [];
  const hasMore = data?.hasMore ?? false;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3 max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-gold" />
            <h1 className="font-pixel text-gold text-xs sm:text-sm">COACH INBOX</h1>
            {unreadCount > 0 && (
              <span
                className="flex items-center justify-center w-5 h-5 rounded-full bg-gold text-xs font-bold text-black"
                data-testid="badge-inbox-unread"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              data-testid="btn-inbox-refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {unreadCount > 0 && (
              <RetroButton
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMut.mutate()}
                disabled={markAllReadMut.isPending}
                className="text-xs min-h-[36px]"
                data-testid="btn-mark-all-read"
              >
                <MailCheck className="w-3.5 h-3.5 mr-1" />
                Mark all read
              </RetroButton>
            )}
          </div>
        </div>

        {/* Filter tabs — horizontal scroll */}
        <div className="mt-2 max-w-2xl mx-auto -mx-1 px-1">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide" role="tablist">
            {FILTER_TABS.map(({ key, label }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchTab(key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors min-h-[36px] whitespace-nowrap ${
                    isActive
                      ? "bg-gold text-black"
                      : "bg-card text-muted-foreground hover:text-foreground hover:bg-card/80"
                  }`}
                  data-testid={`tab-inbox-${key}`}
                >
                  {label}
                  {key === "unread" && unreadCount > 0 && (
                    <span className="ml-1.5 bg-black/20 text-xs px-1 rounded-full">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Archive toggle */}
        <div className="mt-2 max-w-2xl mx-auto flex items-center justify-end">
          <button
            type="button"
            onClick={() => { setShowArchived(v => !v); setOffset(0); }}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors min-h-[32px] ${
              showArchived ? "text-gold" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="btn-toggle-archived"
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? "Showing archived" : "Show archived"}
          </button>
        </div>
      </div>

      {/* Message list */}
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-card/60 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="py-16 text-center" data-testid="empty-inbox">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="font-pixel text-xs text-muted-foreground">
              {showArchived ? "No archived messages" : activeTab === "unread" ? "All caught up!" : "No messages yet"}
            </p>
            {activeTab !== "all" && !showArchived && (
              <button
                type="button"
                onClick={() => switchTab("all")}
                className="mt-3 text-xs text-gold hover:underline"
              >
                View all messages
              </button>
            )}
          </div>
        )}

        {messages.map(msg => (
          <MessageCard
            key={msg.id}
            msg={msg}
            leagueId={leagueId}
            onRead={id => readMut.mutate(id)}
            onArchive={id => archiveMut.mutate(id)}
          />
        ))}

        {/* Pagination */}
        {(hasMore || offset > 0) && (
          <div className="flex gap-3 justify-center pt-2 pb-4">
            {offset > 0 && (
              <RetroButton
                variant="ghost"
                size="sm"
                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
                data-testid="btn-inbox-prev"
              >
                Previous
              </RetroButton>
            )}
            {hasMore && (
              <RetroButton
                variant="ghost"
                size="sm"
                onClick={() => setOffset(o => o + LIMIT)}
                data-testid="btn-inbox-next"
              >
                Load more
              </RetroButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
