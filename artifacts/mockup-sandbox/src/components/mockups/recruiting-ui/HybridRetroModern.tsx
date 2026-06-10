import React, { useState, useEffect } from 'react';
import { ChevronRight, Star, StarHalf, Trophy, ChevronLeft, MapPin, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

// Mock Data
const MOCK_RECRUITS = [
  {
    id: '1',
    rank: 1,
    name: 'Jaxon "Nuke" Miller',
    position: 'CF',
    state: 'TX',
    ovr: 88,
    stars: 5,
    interest: 85,
    attributes: {
      Contact: 'A-',
      Power: 'S',
      Speed: 'A',
      Fielding: 'B+',
      Arm: 'B'
    },
    abilities: [
      { name: 'Crusher', tier: 'gold' },
      { name: 'Clutch', tier: 'blue' },
      { name: 'Cocky', tier: 'red' }
    ]
  },
  {
    id: '2',
    rank: 2,
    name: 'Tyler Vance',
    position: 'SP',
    state: 'FL',
    ovr: 85,
    stars: 5,
    interest: 45,
    attributes: {
      Velocity: 'S',
      Control: 'B',
      Movement: 'A-',
      Stamina: 'A',
      Pickoff: 'C'
    },
    abilities: [
      { name: 'Fireballer', tier: 'gold' },
      { name: 'Intimidator', tier: 'blue' }
    ]
  },
  {
    id: '3',
    rank: 3,
    name: 'Sammy "Slick" O\'Connor',
    position: 'SS',
    state: 'CA',
    ovr: 82,
    stars: 4,
    interest: 92,
    attributes: {
      Contact: 'B+',
      Power: 'C+',
      Speed: 'S',
      Fielding: 'S',
      Arm: 'A'
    },
    abilities: [
      { name: 'Vacuum', tier: 'gold' },
      { name: 'Speed Demon', tier: 'gold' }
    ]
  },
  {
    id: '4',
    rank: 4,
    name: 'Marcus Reynolds',
    position: '1B',
    state: 'GA',
    ovr: 81,
    stars: 4,
    interest: 60,
    attributes: {
      Contact: 'B',
      Power: 'A+',
      Speed: 'D',
      Fielding: 'C',
      Arm: 'D'
    },
    abilities: [
      { name: 'Pull Hitter', tier: 'blue' },
      { name: 'Slow Start', tier: 'red' }
    ]
  },
  {
    id: '5',
    rank: 5,
    name: 'Diego Morales',
    position: 'C',
    state: 'FL',
    ovr: 79,
    stars: 4,
    interest: 75,
    attributes: {
      Contact: 'B',
      Power: 'B',
      Speed: 'F',
      Fielding: 'A',
      Arm: 'S'
    },
    abilities: [
      { name: 'Cannon', tier: 'gold' },
      { name: 'Pitch Caller', tier: 'blue' }
    ]
  },
  {
    id: '6',
    rank: 6,
    name: 'Beau Jenkins',
    position: 'RF',
    state: 'NC',
    ovr: 78,
    stars: 3,
    interest: 30,
    attributes: {
      Contact: 'C+',
      Power: 'B+',
      Speed: 'A',
      Fielding: 'B',
      Arm: 'B'
    },
    abilities: [
      { name: 'Gap Hitter', tier: 'blue' }
    ]
  },
  {
    id: '7',
    rank: 7,
    name: 'Willis Greene',
    position: 'RP',
    state: 'TX',
    ovr: 76,
    stars: 3,
    interest: 100,
    attributes: {
      Velocity: 'A',
      Control: 'C',
      Movement: 'B',
      Stamina: 'D',
      Pickoff: 'B'
    },
    abilities: [
      { name: 'Rubber Arm', tier: 'blue' },
      { name: 'Wild Pitch', tier: 'red' }
    ]
  }
];

export function HybridRetroModern() {
  const [selectedId, setSelectedId] = useState(MOCK_RECRUITS[0].id);
  
  useEffect(() => {
    // Inject pixel font
    if (!document.getElementById('pixel-font')) {
      const link = document.createElement('link');
      link.id = 'pixel-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  const selectedRecruit = MOCK_RECRUITS.find(r => r.id === selectedId) || MOCK_RECRUITS[0];

  const pixelFont = { fontFamily: "'Press Start 2P', monospace" };
  const getInterestColor = (val: number) => {
    if (val >= 80) return 'bg-[#10b981]'; // Green
    if (val >= 50) return 'bg-[#fbbf24]'; // Gold
    return 'bg-[#ef4444]'; // Red
  };

  const getAttributeColor = (grade: string) => {
    if (grade.startsWith('S')) return 'text-[#c084fc] drop-shadow-[0_0_5px_rgba(192,132,252,0.8)]'; // Purple glow
    if (grade.startsWith('A')) return 'text-[#10b981]';
    if (grade.startsWith('B')) return 'text-[#3b82f6]';
    if (grade.startsWith('C')) return 'text-[#fbbf24]';
    if (grade.startsWith('D')) return 'text-[#f97316]';
    return 'text-[#ef4444]';
  };

  const renderStars = (count: number) => {
    return Array.from({ length: 5 }).map((_, i) => (
      <Star 
        key={i} 
        size={14} 
        className={i < count ? "fill-[#fbbf24] text-[#fbbf24]" : "fill-transparent text-[#3f6212]"} 
      />
    ));
  };

  const renderPixelProgress = (value: number) => {
    const bars = 20;
    const filledBars = Math.round((value / 100) * bars);
    
    return (
      <div className="flex gap-[2px] h-3 w-full items-center">
        {Array.from({ length: bars }).map((_, i) => (
          <div 
            key={i} 
            className={`flex-1 h-full border border-black/20 ${i < filledBars ? getInterestColor(value) : 'bg-[#0a1a0f]'}`}
            style={{ borderRadius: '1px' }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a1a0f] text-slate-200 font-sans p-6 overflow-hidden flex flex-col selection:bg-[#fbbf24] selection:text-[#0a1a0f]">
      
      {/* Header / Breadcrumbs */}
      <header className="flex items-center justify-between pb-6 border-b border-[#166534]/50 mb-6">
        <div className="flex items-center text-[#fbbf24] gap-2 text-xs" style={pixelFont}>
          <span className="text-[#84cc16]">MAIN</span>
          <ChevronRight size={14} className="text-[#84cc16]" />
          <span>RECRUITING HUB</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-[#0f2318] border border-[#166534] px-4 py-2 rounded flex items-center gap-3">
            <span className="text-[#84cc16] text-[10px]" style={pixelFont}>PTS:</span>
            <span className="text-[#fbbf24] font-bold tracking-wider text-xl">4,250</span>
          </div>
        </div>
      </header>

      <div className="flex gap-6 flex-1 h-[calc(100vh-120px)]">
        
        {/* Sidebar */}
        <aside className="w-[340px] flex flex-col gap-4 h-full">
          <h2 className="text-[#fbbf24] text-xs mb-2 flex items-center gap-2" style={pixelFont}>
            <Trophy size={16} /> TOP TARGETS
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {MOCK_RECRUITS.map((recruit) => (
              <div 
                key={recruit.id}
                onClick={() => setSelectedId(recruit.id)}
                className={`
                  relative overflow-hidden cursor-pointer transition-all duration-200
                  rounded border ${selectedId === recruit.id ? 'border-[#fbbf24] bg-[#0f2318]' : 'border-[#166534] bg-[#0a1a0f]/80 hover:bg-[#0f2318]'}
                  p-3 flex items-center gap-3
                `}
              >
                {selectedId === recruit.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fbbf24]" />
                )}
                
                <div className="w-8 h-8 rounded bg-[#0a1a0f] border border-[#166534] flex items-center justify-center text-[#84cc16] text-xs shadow-inner" style={pixelFont}>
                  {recruit.rank}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="truncate text-[#fbbf24] text-[10px] leading-tight pt-1" style={pixelFont}>{recruit.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="bg-[#166534]/40 text-[#84cc16] px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-[#166534]/50">
                      {recruit.position}
                    </span>
                    <span className="flex items-center">{renderStars(recruit.stars)}</span>
                    <span className="ml-auto font-mono text-[#fbbf24] font-bold border-b border-[#fbbf24]/30">{recruit.ovr} OVR</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 bg-[#0f2318] border border-[#166534] rounded-lg relative overflow-hidden flex flex-col shadow-2xl">
          {/* subtle scanline overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 4px, 3px 100%' }}></div>
          
          {/* Header Profile Area */}
          <div className="p-8 border-b border-[#166534] bg-gradient-to-b from-[#0a1a0f] to-transparent relative">
            <div className="absolute top-0 right-0 p-8 opacity-10 font-bold text-9xl tracking-tighter" style={pixelFont}>
              {selectedRecruit.position}
            </div>
            
            <div className="flex gap-6 relative z-10">
              {/* Avatar placeholder / retro box */}
              <div className="w-32 h-32 border-2 border-[#fbbf24] bg-[#0a1a0f] p-1 shadow-[0_0_15px_rgba(251,191,36,0.15)] flex flex-col justify-end relative overflow-hidden group">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMwYTFhMGYiLz48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMTY2NTM0Ii8+PC9zdmc+')] opacity-50"></div>
                <div className="w-full h-3/4 bg-[#166534]/20 border-t border-[#166534]/50 relative z-10 flex items-center justify-center">
                  <span className="text-[#84cc16]/20 text-4xl" style={pixelFont}>?</span>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-[#166534] text-[#fbbf24] px-2 py-1 text-[10px] rounded-sm border border-[#4ade80]/30 shadow-sm" style={pixelFont}>
                    {selectedRecruit.position}
                  </span>
                  <div className="flex gap-0.5">
                    {renderStars(selectedRecruit.stars)}
                  </div>
                </div>
                
                <h1 className="text-3xl text-white mb-2 tracking-wide drop-shadow-md" style={pixelFont}>
                  {selectedRecruit.name}
                </h1>
                
                <div className="flex items-center gap-6 text-sm text-[#84cc16]">
                  <div className="flex items-center gap-1.5 font-mono">
                    <MapPin size={14} className="text-[#fbbf24]" />
                    {selectedRecruit.state}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <Activity size={14} className="text-[#fbbf24]" />
                    POTENTIAL: <span className="text-[#fbbf24]">A-</span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col items-center justify-center bg-[#0a1a0f] border-2 border-[#fbbf24] px-6 py-4 rounded-sm shadow-[0_0_20px_rgba(251,191,36,0.1)]">
                <span className="text-[#fbbf24] text-[10px] mb-2" style={pixelFont}>OVR</span>
                <span className="text-5xl text-white" style={pixelFont}>{selectedRecruit.ovr}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 p-8 flex gap-8 overflow-y-auto custom-scrollbar z-10">
            
            {/* Left Col: Attributes & Badges */}
            <div className="flex-1 space-y-8">
              
              {/* Attributes Grid */}
              <section>
                <h3 className="text-[#84cc16] text-[10px] border-b border-[#166534] pb-2 mb-4 uppercase tracking-widest" style={pixelFont}>
                  Scouting Report
                </h3>
                
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  {Object.entries(selectedRecruit.attributes).map(([attr, grade]) => (
                    <div key={attr} className="flex items-center justify-between border-b border-[#166534]/30 pb-2 group">
                      <span className="text-slate-400 font-mono text-sm tracking-wide group-hover:text-slate-200 transition-colors">{attr}</span>
                      <span className={`text-xl font-bold font-mono tracking-tighter ${getAttributeColor(grade)}`} style={pixelFont}>
                        {grade}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Special Abilities */}
              <section>
                <h3 className="text-[#84cc16] text-[10px] border-b border-[#166534] pb-2 mb-4 uppercase tracking-widest" style={pixelFont}>
                  Traits & Quirks
                </h3>
                
                <div className="flex flex-wrap gap-3">
                  {selectedRecruit.abilities.map((ability, idx) => {
                    let badgeClass = '';
                    let icon = '';
                    if (ability.tier === 'gold') {
                      badgeClass = 'bg-[#fbbf24]/10 border-[#fbbf24] text-[#fbbf24] shadow-[0_0_10px_rgba(251,191,36,0.2)]';
                      icon = '★';
                    } else if (ability.tier === 'blue') {
                      badgeClass = 'bg-[#3b82f6]/10 border-[#3b82f6] text-[#60a5fa] shadow-[0_0_10px_rgba(59,130,246,0.2)]';
                      icon = '♦';
                    } else {
                      badgeClass = 'bg-[#ef4444]/10 border-[#ef4444] text-[#f87171] shadow-[0_0_10px_rgba(239,68,68,0.2)]';
                      icon = '⚠';
                    }

                    return (
                      <div key={idx} className={`px-3 py-1.5 border flex items-center gap-2 rounded-sm ${badgeClass}`}>
                        <span className="text-[10px]" style={pixelFont}>{icon}</span>
                        <span className="text-[10px] tracking-wider font-bold" style={pixelFont}>{ability.name}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

            </div>

            {/* Right Col: Interest & Actions */}
            <div className="w-[320px] space-y-6">
              
              {/* Interest Meter */}
              <div className="bg-[#0a1a0f] border border-[#166534] p-5 rounded-sm relative overflow-hidden">
                <div className="flex justify-between items-end mb-3">
                  <span className="text-[#84cc16] text-[10px]" style={pixelFont}>Interest Level</span>
                  <span className="text-white text-sm" style={pixelFont}>{selectedRecruit.interest}%</span>
                </div>
                {renderPixelProgress(selectedRecruit.interest)}
                
                <div className="mt-4 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>Cold</span>
                  <span>Warm</span>
                  <span className="text-[#fbbf24]">Committed</span>
                </div>
              </div>

              {/* Action Panel */}
              <div className="bg-[#0a1a0f] border border-[#fbbf24]/30 p-5 rounded-sm shadow-[inset_0_0_20px_rgba(251,191,36,0.05)]">
                <h3 className="text-[#fbbf24] text-[10px] mb-5 text-center tracking-widest" style={pixelFont}>
                  ACTIONS
                </h3>
                
                <div className="space-y-3">
                  {['SCOUT', 'EMAIL', 'CALL', 'VISIT', 'OFFER'].map((action, idx) => {
                    const isOffer = action === 'OFFER';
                    return (
                      <button 
                        key={action}
                        className={`
                          w-full py-3 px-4 flex items-center justify-between
                          border transition-all duration-150 relative overflow-hidden group
                          ${isOffer 
                            ? 'bg-[#fbbf24] border-[#fbbf24] text-[#0a1a0f] hover:bg-[#f59e0b] shadow-[0_0_15px_rgba(251,191,36,0.4)]' 
                            : 'bg-[#0f2318] border-[#166534] text-[#84cc16] hover:border-[#fbbf24] hover:text-[#fbbf24] hover:bg-[#166534]/30'
                          }
                        `}
                      >
                        {/* Hover scanline effect */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-white/5 to-white/0 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-700 pointer-events-none"></div>
                        
                        <span className="text-[10px] tracking-wider relative z-10" style={pixelFont}>{action}</span>
                        <span className={`text-xs font-mono font-bold relative z-10 ${isOffer ? 'text-[#0a1a0f]/70' : 'text-slate-500'}`}>
                          -{idx === 0 ? 50 : idx * 100} PTS
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

            </div>
            
          </div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0a1a0f;
          border-left: 1px solid #166534;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #166534;
          border: 1px solid #0a1a0f;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #fbbf24;
        }
      `}} />
    </div>
  );
}
