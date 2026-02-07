import { Link } from "wouter";
import { useState } from "react";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroSelect } from "@/components/ui/retro-select";
import { Trophy, Users, Target, Calendar, Star, TrendingUp, User, Bug, Layers, LogOut, DollarSign, X, GraduationCap, Building2, Search, Settings, CalendarDays, Binoculars, Newspaper, Crown, Eye, Zap, Swords } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DynastyLogo } from "@/components/dynasty-logo";

export default function LandingPage() {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: string; email: string }>({
    queryKey: ["/api/auth/me"],
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Signed out successfully" });
    },
  });

  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 pr-14 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DynastyLogo className="w-10 h-10" />
            <span className="font-pixel text-gold text-sm hidden sm:block">
              パワプロ College Baseball Dynasty
            </span>
          </div>
          
          {isLoggedIn ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2 text-gold" data-testid="display-user">
                <User className="w-5 h-5" />
                <span className="font-pixel text-[8px] sm:text-[10px] hidden sm:block truncate max-w-[100px]">
                  {user.email.split("@")[0]}
                </span>
              </div>
              <RetroButton
                variant="ghost"
                size="icon"
                onClick={() => setShowFeedbackModal(true)}
                title="Submit Feedback"
                data-testid="button-feedback"
              >
                <Bug className="w-4 h-4" />
              </RetroButton>
              <Link href="/dashboard">
                <RetroButton
                  variant="ghost"
                  size="icon"
                  title="My Dynasties"
                  data-testid="button-my-dynasties"
                >
                  <Layers className="w-4 h-4" />
                </RetroButton>
              </Link>
              <RetroButton
                variant="ghost"
                size="icon"
                onClick={() => logoutMutation.mutate()}
                title="Sign Out"
                data-testid="button-signout"
              >
                <LogOut className="w-4 h-4" />
              </RetroButton>
              <a
                href="https://www.paypal.com/donate?business=Markusfrieske%40gmail.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <RetroButton
                  variant="ghost"
                  size="icon"
                  title="Donate"
                  data-testid="link-donate"
                >
                  <DollarSign className="w-4 h-4" />
                </RetroButton>
              </a>
            </div>
          ) : (
            <div className="flex gap-3">
              <Link href="/login">
                <RetroButton variant="outline" size="sm" data-testid="link-login">
                  Sign In
                </RetroButton>
              </Link>
              <Link href="/register">
                <RetroButton size="sm" data-testid="link-register">
                  Sign Up
                </RetroButton>
              </Link>
            </div>
          )}
        </div>
      </header>

      {showFeedbackModal && (
        <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
      )}

      <main>
        <section className="py-20 px-4">
          <div className="container mx-auto text-center">
            <div className="flex justify-center mb-6">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className="w-6 h-6 text-gold fill-gold animate-pulse"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            </div>
            <h1 className="font-pixel text-gold text-2xl sm:text-4xl mb-6 leading-relaxed">
              College Baseball<br />Dynasty
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-10 text-lg leading-relaxed">
              Build your dynasty. Recruit the best talent. Compete against other coaches in
              a league-first, story-driven college baseball simulator.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <RetroButton size="lg" data-testid="button-get-started">
                  Start Your Dynasty
                </RetroButton>
              </Link>
              <Link href="/guest">
                <RetroButton variant="outline" size="lg" data-testid="button-guest-mode">
                  Try as Guest
                </RetroButton>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-card/50">
          <div className="container mx-auto">
            <h2 className="font-pixel text-gold text-xl text-center mb-12">
              Features
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCardWithIcons
                icon={<Settings className="w-8 h-8" />}
                title="Dynasty Management"
                description="Create dynasties with up to 16 teams. Mix human coaches with CPU opponents across multiple conferences."
                subIcons={[
                  { icon: Users, name: "Teams", color: "text-blue-400" },
                  { icon: Settings, name: "Settings", color: "text-green-400" },
                  { icon: Layers, name: "Conferences", color: "text-purple-400" },
                  { icon: Crown, name: "Commissioner", color: "text-orange-400" },
                ]}
              />
              <FeatureCardWithIcons
                icon={<Binoculars className="w-8 h-8" />}
                title="Deep Recruiting"
                description="Scout recruits with hidden ratings. Use points wisely on visits, pitches, and NIL deals to land top talent."
                subIcons={[
                  { icon: Search, name: "Scout", color: "text-blue-400" },
                  { icon: Target, name: "Target", color: "text-green-400" },
                  { icon: DollarSign, name: "NIL", color: "text-purple-400" },
                  { icon: Star, name: "Rankings", color: "text-orange-400" },
                ]}
              />
              <FeatureCardWithIcons
                icon={<Crown className="w-8 h-8" />}
                title="Dynasty Building"
                description="20-season dynasties with full historical archives. Build a program that dominates for generations."
                subIcons={[
                  { icon: Trophy, name: "Titles", color: "text-blue-400" },
                  { icon: TrendingUp, name: "Growth", color: "text-green-400" },
                  { icon: Building2, name: "Program", color: "text-purple-400" },
                  { icon: Star, name: "Legacy", color: "text-orange-400" },
                ]}
              />
              <FeatureCardWithIcons
                icon={<CalendarDays className="w-8 h-8" />}
                title="Full Season Structure"
                description="Preseason through College World Series. Weekly advances with recruiting phases and story events."
                subIcons={[
                  { icon: Calendar, name: "Schedule", color: "text-blue-400" },
                  { icon: Trophy, name: "Playoffs", color: "text-green-400" },
                  { icon: Target, name: "Recruiting", color: "text-purple-400" },
                  { icon: Star, name: "CWS", color: "text-orange-400" },
                ]}
              />
              <CoachProgressionCard />
              <FeatureCardWithIcons
                icon={<Newspaper className="w-8 h-8" />}
                title="Story Engine"
                description="Dynamic narratives that affect recruiting and gameplay. Respond to scandals, rumors, and breakout stories."
                subIcons={[
                  { icon: Newspaper, name: "News", color: "text-blue-400" },
                  { icon: TrendingUp, name: "Drama", color: "text-green-400" },
                  { icon: User, name: "Stories", color: "text-purple-400" },
                  { icon: Star, name: "Moments", color: "text-orange-400" },
                ]}
              />
            </div>
          </div>
        </section>

        <section className="py-16 px-4">
          <div className="container mx-auto text-center">
            <h2 className="font-pixel text-gold text-xl mb-6">
              Ready to Build Your Legacy?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join coaches from around the world competing in the most immersive
              college baseball management experience available.
            </p>
            <Link href="/register">
              <RetroButton size="lg" data-testid="button-join-now">
                Create Your Account
              </RetroButton>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground text-sm">
          <p className="font-pixel text-[10px] mb-2">パワプロ College Baseball Dynasty</p>
          <p>A league-first dynasty simulator</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCardWithIcons({
  icon,
  title,
  description,
  subIcons,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  subIcons: Array<{ icon: React.ComponentType<{ className?: string }>; name: string; color: string }>;
}) {
  return (
    <div className="bg-card border-2 border-border p-6 hover:border-gold/50 transition-colors">
      <div className="text-gold mb-4">{icon}</div>
      <h3 className="font-pixel text-[10px] text-foreground uppercase mb-3">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed mb-4">{description}</p>
      <div className="grid grid-cols-4 gap-2 mt-4">
        {subIcons.map((item) => (
          <div key={item.name} className="flex flex-col items-center gap-1" data-testid={`feature-${title.toLowerCase().replace(/\s+/g, '-')}-${item.name.toLowerCase()}`}>
            <div className={`p-2 bg-background/50 border border-border rounded ${item.color}`}>
              <item.icon className="w-4 h-4" />
            </div>
            <span className="text-[8px] text-muted-foreground font-pixel">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoachProgressionCard() {
  const skillTrees = [
    { icon: Search, name: "Scouting", color: "text-blue-400", value: 2 },
    { icon: Eye, name: "Evaluation", color: "text-purple-400", value: 3 },
    { icon: Zap, name: "Pitching", color: "text-green-400", value: 1 },
    { icon: Swords, name: "Hitting", color: "text-orange-400", value: 2 },
  ];

  return (
    <div className="bg-card border-2 border-border p-6 hover:border-gold/50 transition-colors">
      <div className="text-gold mb-4">
        <Star className="w-8 h-8" />
      </div>
      <h3 className="font-pixel text-[10px] text-foreground uppercase mb-3">Starting Skill Grades</h3>
      <p className="text-muted-foreground text-sm leading-relaxed mb-4">
        Coaches start with skill ratings from 1-3 based on archetype. Level up to improve scouting, evaluation, pitching and hitting skills.
      </p>
      <div className="grid grid-cols-4 gap-2 mt-4">
        {skillTrees.map((tree) => (
          <div key={tree.name} className="flex flex-col items-center gap-1" data-testid={`skill-tree-${tree.name.toLowerCase()}`}>
            <div className={`p-2 bg-background/50 border border-border rounded ${tree.color}`}>
              <tree.icon className="w-4 h-4" />
            </div>
            <span className="text-[8px] text-muted-foreground font-pixel">{tree.name}</span>
            <div className="flex gap-0.5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className={`w-2 h-3 rounded-sm ${n <= tree.value ? "bg-gold" : "bg-border"}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !details) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    toast({ title: "Feedback submitted! Thank you for your input." });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-card border-2 border-border max-w-md w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <RetroButton
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground"
          data-testid="button-close-feedback"
        >
          <X className="w-5 h-5" />
        </RetroButton>

        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-6 h-6 text-gold" />
          <h2 className="font-pixel text-gold text-sm">Submit Feedback</h2>
        </div>

        <p className="text-muted-foreground text-sm mb-6">
          Report a bug, request a feature, or share your feedback.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">
              Topic <span className="text-red-400">*</span>
            </label>
            <RetroSelect
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              options={[
                { value: "", label: "Select a topic" },
                { value: "bug", label: "Bug Report" },
                { value: "feature", label: "Feature Request" },
                { value: "feedback", label: "General Feedback" },
                { value: "question", label: "Question" },
              ]}
            />
          </div>

          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">
              Details <span className="text-red-400">*</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe your bug, feature request, or feedback..."
              className="w-full h-24 bg-card border-2 border-border text-foreground p-3 text-sm resize-none focus:border-gold focus:outline-none"
              data-testid="input-feedback-details"
            />
          </div>

          <div>
            <label className="font-pixel text-[10px] text-foreground block mb-2">
              Your Name (optional)
            </label>
            <RetroInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              data-testid="input-feedback-name"
            />
          </div>

          <RetroButton type="submit" className="w-full" data-testid="button-submit-feedback">
            Submit Feedback
          </RetroButton>
        </form>
      </div>
    </div>
  );
}
