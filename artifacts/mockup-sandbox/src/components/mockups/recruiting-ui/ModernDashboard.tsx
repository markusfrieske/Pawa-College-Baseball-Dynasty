import React, { useState } from 'react';
import { Mail, Phone, MapPin, Award, Star, Search, Shield, Target, Zap, Activity, Navigation, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

// Static mock data
const RECRUITS = [
  {
    id: 1,
    rank: 1,
    name: 'Jaxon "Thunder" Reed',
    position: 'CF',
    stars: 5,
    ovr: 412,
    state: 'TX',
    hometown: 'Austin',
    height: '6\'2"',
    weight: '210 lbs',
    bats: 'R',
    throws: 'R',
    classYear: 'HS SR',
    interest: 85,
    attributes: {
      power: 92,
      contact: 88,
      speed: 95,
      arm: 85,
      field: 90
    },
    abilities: ['Power Hitter', 'Gold Glove', 'Speed Demon'],
    scouted: true,
    offered: false,
    notes: 'Generational talent with elite bat speed. Can cover gap to gap in center field.'
  },
  {
    id: 2,
    rank: 2,
    name: 'Marcus Chen',
    position: 'SP',
    stars: 5,
    ovr: 395,
    state: 'CA',
    hometown: 'San Diego',
    height: '6\'4"',
    weight: '225 lbs',
    bats: 'L',
    throws: 'L',
    classYear: 'HS SR',
    interest: 92,
    attributes: {
      velocity: 94,
      control: 89,
      movement: 91,
      stamina: 88,
      clutch: 85
    },
    abilities: ['Strikeout Artist', 'Workhorse'],
    scouted: true,
    offered: true,
    notes: 'Topping out at 98mph. Devastating slider.'
  },
  {
    id: 3,
    rank: 4,
    name: 'Trey Morales',
    position: 'SS',
    stars: 4,
    ovr: 350,
    state: 'FL',
    hometown: 'Miami',
    height: '6\'0"',
    weight: '185 lbs',
    bats: 'S',
    throws: 'R',
    classYear: 'JUCO SO',
    interest: 45,
    attributes: {
      power: 65,
      contact: 92,
      speed: 88,
      arm: 94,
      field: 95
    },
    abilities: ['Switch Hitter', 'Captain'],
    scouted: true,
    offered: false,
    notes: 'Elite defender. Needs to add power but gets on base.'
  },
  {
    id: 4,
    rank: 9,
    name: 'DeShawn Washington',
    position: '1B',
    stars: 4,
    ovr: 340,
    state: 'GA',
    hometown: 'Atlanta',
    height: '6\'5"',
    weight: '240 lbs',
    bats: 'L',
    throws: 'R',
    classYear: 'HS SR',
    interest: 78,
    attributes: {
      power: 96,
      contact: 75,
      speed: 45,
      arm: 70,
      field: 80
    },
    abilities: ['Pull Hitter', 'Clutch'],
    scouted: false,
    offered: false,
    notes: 'Massive raw power. Profiles as middle-of-the-order bat.'
  },
  {
    id: 5,
    rank: 15,
    name: 'Elijah Stone',
    position: 'C',
    stars: 4,
    ovr: 325,
    state: 'OH',
    hometown: 'Columbus',
    height: '6\'1"',
    weight: '215 lbs',
    bats: 'R',
    throws: 'R',
    classYear: 'HS SR',
    interest: 60,
    attributes: {
      power: 80,
      contact: 82,
      speed: 40,
      arm: 92,
      field: 88
    },
    abilities: ['Pitch Caller', 'Cannon Arm'],
    scouted: true,
    offered: false,
    notes: 'Great game manager. High baseball IQ.'
  },
  {
    id: 6,
    rank: 22,
    name: 'Liam O\'Connor',
    position: '3B',
    stars: 3,
    ovr: 290,
    state: 'MA',
    hometown: 'Boston',
    height: '6\'3"',
    weight: '205 lbs',
    bats: 'R',
    throws: 'R',
    classYear: 'HS JR',
    interest: 88,
    attributes: {
      power: 85,
      contact: 78,
      speed: 60,
      arm: 88,
      field: 75
    },
    abilities: ['Power Hitter'],
    scouted: false,
    offered: false,
    notes: 'Raw but high ceiling. Needs development.'
  }
];

// Helper components
const StarRating = ({ count }: { count: number }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map(star => (
      <Star 
        key={star} 
        size={14} 
        className={star <= count ? 'fill-amber-500 text-amber-500' : 'text-slate-600'} 
      />
    ))}
  </div>
);

const SegmentedBar = ({ value, color = "bg-green-500" }: { value: number, color?: string }) => {
  const segments = 10;
  const activeSegments = Math.round((value / 100) * segments);
  
  return (
    <div className="flex gap-[2px] h-3 w-full">
      {Array.from({ length: segments }).map((_, i) => (
        <div 
          key={i} 
          className={`flex-1 rounded-sm ${i < activeSegments ? color : 'bg-slate-800'}`}
        />
      ))}
    </div>
  );
};

export function ModernDashboard() {
  const [selectedId, setSelectedId] = useState<number>(RECRUITS[0].id);
  const activeRecruit = RECRUITS.find(r => r.id === selectedId) || RECRUITS[0];

  return (
    <div 
      className="min-h-screen bg-[#0a0d14] text-slate-200 p-6 flex flex-col font-sans selection:bg-amber-500/30"
      style={{ fontFamily: '"Inter", "Rajdhani", sans-serif' }}
    >
      {/* Header */}
      <header className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
            <Award className="text-slate-900" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">Recruiting Hub</h1>
            <p className="text-sm text-slate-400 font-medium">National Signing Day: 45 Days</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="bg-[#131824] border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-2">
            <span className="text-slate-400 text-sm font-semibold uppercase">Scholarships:</span>
            <span className="text-white font-bold">12 / 15</span>
          </div>
          <div className="bg-[#131824] border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-2">
            <span className="text-slate-400 text-sm font-semibold uppercase">Budget:</span>
            <span className="text-amber-500 font-bold">14,500</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex gap-6 flex-1 h-[calc(100vh-120px)]">
        
        {/* Left Sidebar - Recruit List */}
        <div className="w-80 flex flex-col gap-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Top Targets</h2>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800">
              <Search size={18} />
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {RECRUITS.map(recruit => {
              const isActive = selectedId === recruit.id;
              return (
                <div 
                  key={recruit.id}
                  onClick={() => setSelectedId(recruit.id)}
                  className={cn(
                    "relative p-4 rounded-xl cursor-pointer transition-all duration-200 border group",
                    isActive 
                      ? "bg-[#1a1f2e] border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]" 
                      : "bg-[#131824] border-slate-800 hover:border-slate-600 hover:bg-[#161b28]"
                  )}
                >
                  {/* Active Indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-3 bottom-3 w-1 bg-amber-500 rounded-r-md" />
                  )}
                  
                  <div className="flex justify-between items-start mb-2 pl-1">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black text-slate-500">#{recruit.rank}</span>
                        <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-none text-[10px] px-1.5 py-0">
                          {recruit.position}
                        </Badge>
                      </div>
                      <h3 className={cn("font-bold truncate max-w-[160px]", isActive ? "text-white" : "text-slate-200 group-hover:text-white")}>
                        {recruit.name}
                      </h3>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{recruit.ovr} <span className="text-[10px] text-slate-500 font-normal">OVR</span></div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-end pl-1 mt-3">
                    <StarRating count={recruit.stars} />
                    <div className="w-16">
                      <div className="text-[10px] text-slate-400 font-bold mb-1 text-right">{recruit.interest}% INT</div>
                      <Progress value={recruit.interest} className="h-1.5 bg-slate-800" indicatorClassName={isActive ? "bg-amber-500" : "bg-slate-400"} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Main Panel */}
        <div className="flex-1 bg-[#131824] rounded-2xl border border-slate-800 overflow-hidden flex flex-col relative">
          {/* Top Hero Section */}
          <div className="h-48 bg-gradient-to-br from-[#1a1f2e] to-[#0d1117] relative border-b border-slate-800/50 flex items-end p-8">
            {/* Abstract Background pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10 flex w-full justify-between items-end gap-6">
              
              <div className="flex items-end gap-6">
                {/* OVR Badge */}
                <div className="relative shrink-0">
                  <div className="w-28 h-28 rounded-full bg-slate-900 border-4 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.2)] flex flex-col items-center justify-center z-10 relative">
                    <span className="text-4xl font-black text-white leading-none">{activeRecruit.ovr}</span>
                    <span className="text-xs font-bold text-amber-500 uppercase tracking-widest mt-1">Overall</span>
                  </div>
                </div>
                
                {/* Name & Details */}
                <div className="pb-2">
                  <div className="flex gap-2 mb-2">
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold border-none px-3 py-0.5 text-sm uppercase rounded-sm">
                      {activeRecruit.position}
                    </Badge>
                    <Badge variant="outline" className="border-slate-700 text-slate-300 font-bold px-3 py-0.5 text-sm rounded-sm bg-slate-900/50 backdrop-blur-sm">
                      {activeRecruit.classYear}
                    </Badge>
                  </div>
                  <h2 className="text-5xl font-black text-white tracking-tight uppercase mb-2 drop-shadow-md">
                    {activeRecruit.name}
                  </h2>
                  <div className="flex items-center gap-4 text-sm font-semibold text-slate-300">
                    <span className="flex items-center gap-1.5"><MapPin size={14} className="text-amber-500" /> {activeRecruit.hometown}, {activeRecruit.state}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                    <span>{activeRecruit.height} • {activeRecruit.weight}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                    <span>B/T: {activeRecruit.bats}/{activeRecruit.throws}</span>
                  </div>
                </div>
              </div>

              {/* Top Right Actions & Stars */}
              <div className="flex flex-col items-end gap-4 pb-2">
                <div className="flex gap-1.5 mb-2 scale-125 origin-right">
                  <StarRating count={activeRecruit.stars} />
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-400 uppercase mb-1">School Interest</div>
                  <div className="flex items-center gap-3">
                    <Progress value={activeRecruit.interest} className="w-32 h-2.5 bg-slate-800" indicatorClassName="bg-amber-500" />
                    <span className="text-xl font-black text-white">{activeRecruit.interest}%</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Content Body */}
          <div className="flex-1 p-8 grid grid-cols-12 gap-8 overflow-y-auto">
            
            {/* Attributes Column */}
            <div className="col-span-7 flex flex-col gap-6">
              <div className="bg-[#1a1f2e]/50 border border-slate-800/80 rounded-xl p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-white uppercase flex items-center gap-2">
                    <Activity size={18} className="text-amber-500" /> Player Attributes
                  </h3>
                  <Badge variant="outline" className="border-slate-700 text-slate-400">
                    {activeRecruit.scouted ? 'Fully Scouted' : 'Partially Scouted'}
                  </Badge>
                </div>
                
                <div className="space-y-5">
                  {Object.entries(activeRecruit.attributes).map(([key, value]) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-bold text-slate-300 uppercase tracking-wider">{key}</span>
                        <span className="font-black text-white">{value}</span>
                      </div>
                      <SegmentedBar 
                        value={value as number} 
                        color={
                          (value as number) >= 90 ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : 
                          (value as number) >= 80 ? "bg-green-500" : 
                          (value as number) >= 70 ? "bg-emerald-400" : 
                          "bg-slate-400"
                        } 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#1a1f2e]/50 border border-slate-800/80 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white uppercase flex items-center gap-2 mb-4">
                  <Zap size={18} className="text-amber-500" /> Special Abilities
                </h3>
                <div className="flex flex-wrap gap-3">
                  {activeRecruit.abilities.map((ability, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-full flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <span className="text-sm font-bold text-slate-200">{ability}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions & Info Column */}
            <div className="col-span-5 flex flex-col gap-6">
              
              <div className="bg-[#1a1f2e]/50 border border-slate-800/80 rounded-xl p-6">
                <h3 className="text-lg font-bold text-white uppercase mb-4">Recruiting Actions</h3>
                
                <div className="space-y-3">
                  <Button className="w-full justify-start h-12 bg-[#23293b] hover:bg-[#2d344b] text-white border border-slate-700 rounded-lg group">
                    <Search className="mr-3 text-slate-400 group-hover:text-amber-500 transition-colors" size={18} />
                    <span className="font-bold flex-1 text-left">Scout Player (100 Pts)</span>
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className="w-full h-12 bg-[#23293b] hover:bg-[#2d344b] text-white border border-slate-700 rounded-lg group">
                      <Mail className="mr-2 text-slate-400 group-hover:text-amber-500 transition-colors" size={16} />
                      <span className="font-bold">Email</span>
                    </Button>
                    <Button className="w-full h-12 bg-[#23293b] hover:bg-[#2d344b] text-white border border-slate-700 rounded-lg group">
                      <Phone className="mr-2 text-slate-400 group-hover:text-amber-500 transition-colors" size={16} />
                      <span className="font-bold">Call</span>
                    </Button>
                  </div>
                  <Button className="w-full justify-start h-12 bg-[#23293b] hover:bg-[#2d344b] text-white border border-slate-700 rounded-lg group">
                    <Navigation className="mr-3 text-slate-400 group-hover:text-amber-500 transition-colors" size={18} />
                    <span className="font-bold flex-1 text-left">Schedule Visit</span>
                  </Button>
                  
                  <div className="pt-4 mt-4 border-t border-slate-800">
                    {activeRecruit.offered ? (
                      <Button disabled className="w-full h-14 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg font-black uppercase tracking-wider">
                        <UserCheck className="mr-2" size={20} /> Scholarship Offered
                      </Button>
                    ) : (
                      <Button className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg font-black uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                        Offer Scholarship
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1f2e]/50 border border-slate-800/80 rounded-xl p-6 flex-1">
                <h3 className="text-lg font-bold text-white uppercase mb-4 flex items-center gap-2">
                  <Target size={18} className="text-amber-500" /> Scouting Notes
                </h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  {activeRecruit.notes}
                </p>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
