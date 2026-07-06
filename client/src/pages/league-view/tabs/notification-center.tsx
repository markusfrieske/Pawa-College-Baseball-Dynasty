import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell, Timer } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RetroButton } from "@/components/ui/retro-button";

export function NotificationCenter({ leagueId }: { leagueId: string }) {
  const [lastSeenCount, setLastSeenCount] = useState(() =>
    parseInt(localStorage.getItem(`notif-seen-${leagueId}`) || "0", 10)
  );

  const { data: news } = useQuery<{ news: { id: string; headline: string; body: string; createdAt: string; newsType: string }[] }>({
    queryKey: ["/api/leagues", leagueId, "news"],
  });

  const { data: eventsData } = useQuery<{ events: { id: string; eventType: string; description: string; createdAt: string }[] }>({
    queryKey: ["/api/leagues", leagueId, "events"],
  });

  type NotifItem = { id: string; headline: string; body: string; createdAt: string; dotColor: string };
  const items: NotifItem[] = [
    ...(news?.news?.slice(0, 6).map(n => ({
      id: `news-${n.id}`,
      headline: n.headline,
      body: n.body,
      createdAt: n.createdAt,
      dotColor: n.newsType === "commit" ? "bg-green-500" : n.newsType === "decommit" ? "bg-red-500" : n.newsType === "transfer" ? "bg-blue-500" : "bg-gold",
    })) || []),
    ...(eventsData?.events?.slice(0, 6).map(e => ({
      id: `event-${e.id}`,
      headline: e.eventType.replace(/_/g, " "),
      body: e.description,
      createdAt: e.createdAt,
      dotColor: e.eventType === "PHASE_CHANGE" ? "bg-purple-500" : (e.eventType === "GAME_RESULT" || e.eventType === "RIVALRY_RESULT") ? "bg-blue-400" : "bg-muted-foreground",
    })) || []),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const unreadCount = Math.max(0, items.length - lastSeenCount);

  const handleOpen = (open: boolean) => {
    if (open) {
      setLastSeenCount(items.length);
      localStorage.setItem(`notif-seen-${leagueId}`, String(items.length));
    }
  };

  return (
    <Popover onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded hover:bg-gold/10 transition-colors" data-testid="button-notifications">
          <Bell className="w-5 h-5 text-muted-foreground hover:text-gold" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-card border-border p-0" align="end">
        <div className="p-3 border-b border-border">
          <span className="font-pixel text-gold text-xs">NOTIFICATIONS</span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No recent notifications
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="p-3 border-b border-border/50 hover:bg-gold/5">
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium capitalize line-clamp-1">{item.headline}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <div className="p-2 border-t border-border">
            <Link href={`/league/${leagueId}`}>
              <button className="w-full text-center text-xs text-gold hover:underline">
                View all in News tab
              </button>
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PhaseDeadline({ deadline }: { deadline: Date | string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [passed, setPassed] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const end = new Date(deadline).getTime();

  useEffect(() => {
    const diffMs = end - Date.now();
    const isNear = diffMs > 0 && diffMs < 86400000;
    const warnKey = `deadline-warned-${end}`;
    if (isNear && !localStorage.getItem(warnKey)) {
      setShowWarning(true);
      localStorage.setItem(warnKey, "1");
    }

    // #31 — browser Notification API: fire a native notification when < 1 hour remains
    const notifyKey = `deadline-notified-${end}`;
    const isVeryNear = diffMs > 0 && diffMs < 3600000;
    if (isVeryNear && !localStorage.getItem(notifyKey) && "Notification" in window) {
      localStorage.setItem(notifyKey, "1");
      const fireNotification = () => {
        const mins = Math.max(1, Math.floor(diffMs / 60000));
        new Notification("Phase Deadline — College Baseball Dynasty", {
          body: `You have ${mins} minute${mins !== 1 ? "s" : ""} left to complete your actions or you may be auto-advanced.`,
          icon: "/favicon.ico",
        });
      };
      if (Notification.permission === "granted") {
        fireNotification();
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(perm => {
          if (perm === "granted") fireNotification();
        });
      }
    }
  }, [end]);

  useEffect(() => {
    const compute = () => {
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setPassed(true);
        setTimeLeft("Deadline passed");
        return;
      }
      setPassed(false);
      const totalMins = Math.floor(diff / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      if (days > 0) {
        setTimeLeft(`${days}d ${remHours}h remaining`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m remaining`);
      } else {
        setTimeLeft(`${mins}m remaining`);
      }
    };
    compute();
    const interval = setInterval(compute, 60000);
    return () => clearInterval(interval);
  }, [end]);

  const diffMs = end - Date.now();
  const colorClass = passed
    ? "text-red-400"
    : diffMs < 3600000
    ? "text-red-400"
    : diffMs < 14400000
    ? "text-amber-400"
    : "text-gold";

  return (
    <>
      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-pixel text-amber-400 text-sm flex items-center gap-2">
              <Timer className="w-4 h-4" /> Phase Deadline Approaching
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            The commissioner has set a deadline for this phase. You have less than 24 hours to complete your actions — mark yourself ready or you may be auto-advanced.
          </p>
          <div className={`font-pixel text-xs mt-1 ${colorClass}`}>{timeLeft}</div>
          <RetroButton onClick={() => setShowWarning(false)} className="mt-3 w-full" data-testid="button-dismiss-deadline-warning">
            Got It
          </RetroButton>
        </DialogContent>
      </Dialog>
      <div className={`flex items-center gap-1.5 mt-1.5 text-xs ${colorClass}`} data-testid="text-phase-deadline">
        <Timer className="w-3 h-3 shrink-0" />
        <span>{timeLeft}</span>
      </div>
    </>
  );
}
