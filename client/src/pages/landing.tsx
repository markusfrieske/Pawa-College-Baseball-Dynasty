import { Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { Trophy, Users, Target, Calendar, Star, TrendingUp } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gold rounded-full flex items-center justify-center">
              <span className="text-navy-dark font-pixel text-xs">CBD</span>
            </div>
            <span className="font-pixel text-gold text-sm hidden sm:block">
              College Baseball Dynasty
            </span>
          </div>
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
        </div>
      </header>

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
              Core Features
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={<Users className="w-8 h-8" />}
                title="League Management"
                description="Create leagues with up to 16 teams. Mix human coaches with CPU opponents across multiple conferences."
              />
              <FeatureCard
                icon={<Target className="w-8 h-8" />}
                title="Deep Recruiting"
                description="Scout recruits with hidden ratings. Use points wisely on visits, pitches, and NIL deals to land top talent."
              />
              <FeatureCard
                icon={<Trophy className="w-8 h-8" />}
                title="Dynasty Building"
                description="20-season dynasties with full historical archives. Build a program that dominates for generations."
              />
              <FeatureCard
                icon={<Calendar className="w-8 h-8" />}
                title="Full Season Structure"
                description="Preseason through College World Series. Weekly advances with recruiting phases and story events."
              />
              <FeatureCard
                icon={<Star className="w-8 h-8" />}
                title="Coach Progression"
                description="Level up your coach each season. Choose permanent skills from scouting, recruiting, and academic branches."
              />
              <FeatureCard
                icon={<TrendingUp className="w-8 h-8" />}
                title="Story Engine"
                description="Dynamic narratives that affect recruiting and gameplay. Respond to scandals, rumors, and breakout stories."
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
          <p className="font-pixel text-[10px] mb-2">College Baseball Dynasty</p>
          <p>A league-first dynasty simulator</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border-2 border-border p-6 hover:border-gold/50 transition-colors">
      <div className="text-gold mb-4">{icon}</div>
      <h3 className="font-pixel text-[10px] text-foreground uppercase mb-3">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}
