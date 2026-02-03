import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { CoachAvatar } from "@/components/coach-avatar";
import { 
  ArrowLeft,
  Trophy,
  Award,
  Target,
  Users,
  Star,
  Zap,
  Shield,
  Swords,
  GraduationCap
} from "lucide-react";
import type { Coach, Team } from "@shared/schema";

interface CoachData {
  coach: Coach;
  team: Team;
}

const XP_PER_LEVEL = 1000;

function getXpForNextLevel(level: number): number {
  return level * XP_PER_LEVEL;
}

function getXpProgress(xp: number, level: number): number {
  const xpForCurrentLevel = (level - 1) * XP_PER_LEVEL;
  const xpForNextLevel = level * XP_PER_LEVEL;
  const currentLevelXp = xp - xpForCurrentLevel;
  const xpNeeded = xpForNextLevel - xpForCurrentLevel;
  return Math.min(100, (currentLevelXp / xpNeeded) * 100);
}

export default function CoachProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<"career" | "attributes" | "skills">("career");

  const { data, isLoading } = useQuery<CoachData>({
    queryKey: ["/api/leagues", id, "coach"],
  });

  if (isLoading) {
    return <CoachProfileSkeleton />;
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RetroCard className="text-center p-8">
          <p className="text-muted-foreground mb-4">Coach not found</p>
          <Link href="/dashboard">
            <RetroButton variant="outline">Back to Dashboard</RetroButton>
          </Link>
        </RetroCard>
      </div>
    );
  }

  const { coach, team } = data;
  const xpProgress = getXpProgress(coach.xp, coach.level);
  const xpForNext = getXpForNextLevel(coach.level);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Link href={`/league/${id}`}>
            <RetroButton variant="ghost" size="sm" data-testid="button-back-league">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to League
            </RetroButton>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <RetroCard variant="bordered" className="mb-6">
          <RetroCardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <CoachAvatar
                    skinTone={coach.skinTone}
                    hairColor={coach.hairColor}
                    hairStyle={coach.hairStyle}
                    facialHair={coach.facialHair}
                    className="w-24 h-24"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: team.primaryColor, color: team.secondaryColor }}
                    >
                      {team.abbreviation}
                    </div>
                    <div>
                      <h1 className="font-pixel text-gold text-lg">
                        HC {coach.firstName} {coach.lastName}
                      </h1>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{coach.archetype}</Badge>
                        <span>Level {coach.level}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>{team.name}</span>
                  </div>
                </div>
              </div>
            </div>
          </RetroCardContent>
        </RetroCard>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["career", "attributes", "skills"] as const).map((tab) => (
            <RetroButton
              key={tab}
              variant={activeTab === tab ? "primary" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab)}
              data-testid={`button-tab-${tab}`}
            >
              {tab === "career" && <Trophy className="w-4 h-4 mr-2" />}
              {tab === "attributes" && <Target className="w-4 h-4 mr-2" />}
              {tab === "skills" && <GraduationCap className="w-4 h-4 mr-2" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </RetroButton>
          ))}
        </div>

        {activeTab === "career" && (
          <CareerTab coach={coach} />
        )}

        {activeTab === "attributes" && (
          <AttributesTab coach={coach} xpProgress={xpProgress} xpForNext={xpForNext} />
        )}

        {activeTab === "skills" && (
          <SkillsTab coach={coach} />
        )}
      </main>
    </div>
  );
}

function CareerTab({ coach }: { coach: Coach }) {
  return (
    <div className="space-y-6">
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" />
            <span>Head Coaching Career Stats</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Career head coaching records and awards. Team wins/losses as coordinator are not included.
          </p>

          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-muted/50 rounded-lg px-6 py-3">
              <Trophy className="w-5 h-5 text-gold" />
              <span className="font-pixel text-sm text-muted-foreground">HEAD COACH LEGACY SCORE:</span>
              <span className="font-pixel text-gold text-xl">{coach.legacyScore}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard 
              label="Overall Record" 
              value={`${coach.careerWins}-${coach.careerLosses}`}
              subLabel={coach.careerWins + coach.careerLosses > 0 
                ? `${((coach.careerWins / (coach.careerWins + coach.careerLosses)) * 100).toFixed(1)}%` 
                : "N/A"
              }
            />
            <StatCard 
              label="Conf Record" 
              value={`${coach.confWins}-${coach.confLosses}`}
              subLabel={coach.confWins + coach.confLosses > 0 
                ? `${((coach.confWins / (coach.confWins + coach.confLosses)) * 100).toFixed(1)}%` 
                : "N/A"
              }
            />
            <StatCard 
              label="Conf Championships" 
              value={coach.confChampionships.toString()}
              subLabel={coach.confChampionships > 0 ? "" : "N/A"}
            />
            <StatCard 
              label="CWS Appearances" 
              value={coach.cwsAppearances.toString()}
              subLabel={coach.cwsAppearances > 0 ? "" : "N/A"}
            />
            <StatCard 
              label="Natl Championships" 
              value={coach.nationalChampionships.toString()}
              subLabel={coach.nationalChampionships > 0 ? "" : "N/A"}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <StatCard 
              label="Coach of Year" 
              value={coach.coachOfYearAwards > 0 ? coach.coachOfYearAwards.toString() : "None"}
            />
            <StatCard 
              label="All-Americans" 
              value={coach.allAmericans.toString()}
            />
            <StatCard 
              label="Draft Picks" 
              value={coach.draftPicks.toString()}
            />
            <StatCard 
              label="Skill Points" 
              value={coach.skillPoints.toString()}
            />
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function AttributesTab({ coach, xpProgress, xpForNext }: { coach: Coach; xpProgress: number; xpForNext: number }) {
  const skillTrees = [
    { key: "offense", label: "Offense", value: coach.offenseSkill, color: "bg-green-500", icon: Swords },
    { key: "defense", label: "Defense", value: coach.defenseSkill, color: "bg-blue-500", icon: Shield },
    { key: "training", label: "Training", value: coach.trainingSkill, color: "bg-yellow-500", icon: Zap },
    { key: "recruiting", label: "Recruiting", value: coach.recruitingSkill, color: "bg-red-500", icon: Target },
  ];

  return (
    <div className="space-y-6">
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-gold" />
            <span>Coach Attributes</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-sm text-muted-foreground mb-6">
            View the coach's current attributes and skills, as well as the history of their levels through the years.
          </p>

          <div className="text-center mb-6">
            <h3 className="font-pixel text-gold text-xl mb-4">Level {coach.level}</h3>
            <div className="flex items-center gap-4 max-w-md mx-auto">
              <span className="text-sm text-muted-foreground">Level {coach.level}</span>
              <div className="flex-1">
                <Progress value={xpProgress} className="h-2" />
              </div>
              <span className="text-sm text-muted-foreground">Level {coach.level + 1}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {coach.xp.toLocaleString()} xp / -{(xpForNext - coach.xp).toLocaleString()} xp to next level
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {skillTrees.map((skill) => (
              <div 
                key={skill.key}
                className={`${skill.color} rounded-lg p-4 text-center text-white`}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <skill.icon className="w-4 h-4" />
                  </div>
                  <span className="text-3xl font-bold">{skill.value}</span>
                </div>
                <p className="text-sm font-medium">{skill.label}</p>
              </div>
            ))}
          </div>

          {coach.skillPoints > 0 && (
            <div className="mt-6 text-center">
              <Badge className="bg-gold text-forest-dark">
                {coach.skillPoints} Skill Points Available
              </Badge>
            </div>
          )}
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function SkillsTab({ coach }: { coach: Coach }) {
  const skillBadges = [
    { 
      name: "Player Developer",
      description: "+5% to player development during offseason",
      requirement: "Training 5+",
      unlocked: coach.trainingSkill >= 5
    },
    { 
      name: "Elite Recruiter",
      description: "+10% recruiting points per interaction",
      requirement: "Recruiting 5+",
      unlocked: coach.recruitingSkill >= 5
    },
    { 
      name: "Offensive Guru",
      description: "+5% batting average for all hitters",
      requirement: "Offense 5+",
      unlocked: coach.offenseSkill >= 5
    },
    { 
      name: "Defensive Specialist",
      description: "-10% errors for all fielders",
      requirement: "Defense 5+",
      unlocked: coach.defenseSkill >= 5
    },
    { 
      name: "Master Trainer",
      description: "+10% to player development",
      requirement: "Training 10+",
      unlocked: coach.trainingSkill >= 10
    },
    { 
      name: "5-Star Magnet",
      description: "+20% chance to land 5-star recruits",
      requirement: "Recruiting 10+",
      unlocked: coach.recruitingSkill >= 10
    },
  ];

  const unlockedBadges = skillBadges.filter(b => b.unlocked);
  const nextBadge = skillBadges.find(b => !b.unlocked);

  return (
    <div className="space-y-6">
      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-gold" />
              <span>{unlockedBadges.length} Skill Badges</span>
            </div>
            {nextBadge && (
              <span className="text-xs text-muted-foreground">
                Next badge: {nextBadge.requirement}
              </span>
            )}
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          {unlockedBadges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Award className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No skill badges unlocked yet.</p>
              <p className="text-xs mt-2">Level up your skill trees to unlock badges!</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {unlockedBadges.map((badge) => (
                <div 
                  key={badge.name}
                  className="bg-muted/50 border border-gold/30 rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-gold" />
                    <h4 className="font-medium text-gold">{badge.name}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{badge.description}</p>
                </div>
              ))}
            </div>
          )}
        </RetroCardContent>
      </RetroCard>

      <RetroCard variant="bordered">
        <RetroCardHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-gold" />
            <span>Coaching Tree</span>
          </div>
        </RetroCardHeader>
        <RetroCardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Spend skill points to upgrade your coaching abilities. Earn XP by winning games and signing recruits.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <SkillTreeBranch
              name="Offense"
              level={coach.offenseSkill}
              color="bg-green-500"
              icon={<Swords className="w-4 h-4" />}
              effects={[
                "Level 1-4: +1% batting average per level",
                "Level 5: Unlock 'Offensive Guru' badge",
                "Level 6-9: +2% power per level",
                "Level 10: Unlock 'Slugger Factory' badge"
              ]}
            />
            <SkillTreeBranch
              name="Defense"
              level={coach.defenseSkill}
              color="bg-blue-500"
              icon={<Shield className="w-4 h-4" />}
              effects={[
                "Level 1-4: -1% errors per level",
                "Level 5: Unlock 'Defensive Specialist' badge",
                "Level 6-9: +2% fielding per level",
                "Level 10: Unlock 'Gold Glove Factory' badge"
              ]}
            />
            <SkillTreeBranch
              name="Training"
              level={coach.trainingSkill}
              color="bg-yellow-500"
              icon={<Zap className="w-4 h-4" />}
              effects={[
                "Level 1-4: +1% player development per level",
                "Level 5: Unlock 'Player Developer' badge",
                "Level 6-9: +2% player development per level",
                "Level 10: Unlock 'Master Trainer' badge"
              ]}
            />
            <SkillTreeBranch
              name="Recruiting"
              level={coach.recruitingSkill}
              color="bg-red-500"
              icon={<Target className="w-4 h-4" />}
              effects={[
                "Level 1-4: +2% recruiting points per level",
                "Level 5: Unlock 'Elite Recruiter' badge",
                "Level 6-9: +5% 5-star interest per level",
                "Level 10: Unlock '5-Star Magnet' badge"
              ]}
            />
          </div>
        </RetroCardContent>
      </RetroCard>
    </div>
  );
}

function SkillTreeBranch({ 
  name, 
  level, 
  color, 
  icon,
  effects 
}: { 
  name: string; 
  level: number; 
  color: string; 
  icon: React.ReactNode;
  effects: string[];
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 ${color} rounded-full flex items-center justify-center text-white`}>
          {icon}
        </div>
        <div>
          <h4 className="font-medium">{name}</h4>
          <p className="text-sm text-muted-foreground">Level {level}/10</p>
        </div>
        <div className="ml-auto">
          <span className={`text-2xl font-bold ${level >= 5 ? "text-gold" : "text-foreground"}`}>
            {level}
          </span>
        </div>
      </div>
      <Progress value={(level / 10) * 100} className="h-2 mb-3" />
      <ul className="space-y-1">
        {effects.map((effect, idx) => (
          <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
            <span className={idx < Math.ceil(level / 2.5) ? "text-gold" : ""}>•</span>
            <span className={idx < Math.ceil(level / 2.5) ? "text-foreground" : ""}>{effect}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({ label, value, subLabel }: { label: string; value: string; subLabel?: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-4 text-center">
      <p className="text-2xl font-bold text-gold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {subLabel && (
        <p className="text-xs text-muted-foreground/70">{subLabel}</p>
      )}
    </div>
  );
}

function CoachProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-8 w-32" />
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <Skeleton className="h-40 mb-6" />
        <div className="flex gap-2 mb-6">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-96" />
      </main>
    </div>
  );
}
