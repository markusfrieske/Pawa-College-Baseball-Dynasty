import { Link } from "wouter";
import { useState } from "react";
import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";
import { getPotentialGrade } from "@shared/potential";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import "./team-diamond.css";

const positions = ["LF", "CF", "RF", "SS", "2B", "3B", "1B", "C", "DH"];
const roles: Record<string, string> = { FRI: "Friday", SAT: "Saturday", SUN: "Sunday", MID: "Midweek", LRP: "Long relief", MR: "Middle relief", MR1: "Middle relief 1", MR2: "Middle relief 2", MR3: "Middle relief 3", SU: "Setup", CP: "Closer" };

/** Inspection of persisted assignments, never an inferred starting lineup. */
export function TeamDiamond({ players, color, onSelectPlayer, lineupUrl }: {
  players: Player[]; color: string; lineupUrl: string; onSelectPlayer: (player: Player) => void;
}) {
  const [group, setGroup] = useState<"staff" | "bench" | "all">("staff");
  const [page, setPage] = useState(0);
  const hitters = players.filter(p => !isPitcher(p.position));
  const active = hitters.filter(p => p.battingOrder != null && p.battingOrder >= 1 && p.battingOrder <= 9);
  const candidates = group === "staff" ? players.filter(p => isPitcher(p.position)) : group === "bench" ? hitters.filter(p => !active.includes(p)) : players;
  const roleOrder = Object.keys(roles);
  const rank = (p: Player) => roleOrder.includes(p.pitchingRole ?? '') ? roleOrder.indexOf(p.pitchingRole!) : roleOrder.length;
  const ordered = [...candidates].sort((a, b) => (group === 'staff' ? rank(a) - rank(b) : 0) || a.depthOrder - b.depthOrder || a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(ordered.length / 5));
  const current = Math.min(page, pages - 1);
  const metric = (p: Player) => <small>OVR <b>{p.overall ?? "—"}</b> · POT <b>{p.potential == null ? "—" : getPotentialGrade(p.potential)}</b></small>;
  const person = (p: Player, portrait = false) => <button type="button" key={p.id} onClick={() => onSelectPlayer(p)} aria-label={`View ${p.firstName} ${p.lastName}`}>
    {portrait && <PlayerPortrait {...p} playerId={p.id} jerseyColor={color} className="c9-team-face" />}
    <span><strong>{p.firstName} {p.lastName}</strong>{metric(p)}</span>
  </button>;
  return <section className="c9-team-board" aria-label="Team diamond and saved assignments" data-testid="team-diamond">
    <div className="c9-team-caption"><strong>THE STARTING NINE</strong><span>Saved lineup · Select a player for ratings, abilities & stats</span><span>{players.length} players</span></div>
    {!players.length && <p role="status">No players on roster yet.</p>}
    <div className="c9-team-layout">
      <aside className="c9-team-order" aria-label="Saved batting order"><h2>Batting order</h2>
        {Array.from({length:9}, (_, i) => {
          const occupants = active.filter(p => p.battingOrder === i + 1);
          return <div className="c9-team-batter" key={i}><b>{i+1}</b><div>{occupants.length ? occupants.map(p => person(p)) : <small>Unassigned</small>}{occupants.length > 1 && <small className="c9-team-conflict">Conflicting assignments</small>}</div></div>;
        })}
      </aside>
      <div className="c9-team-field" aria-label="Saved field positions">
        <div className="c9-team-dirt" aria-hidden="true" />
        {positions.map(position => {
          const occupants = active.filter(p => p.lineupPosition === position);
          return <section className={`c9-team-position c9-team-${position}`} key={position} data-testid={`team-field-${position}`}><h3>{position === "DH" ? "Designated hitter" : position}</h3>
            {occupants.length ? occupants.map(p => person(p, true)) : <span className="c9-team-vacancy">Unassigned</span>}
            {occupants.length > 1 && <small className="c9-team-conflict">Conflicting assignments</small>}
          </section>;
        })}
        <div className="c9-team-mound">PITCHING STAFF<span>Rotation & bullpen →</span></div>
      </div>
      <aside className="c9-team-dugout"><div className="c9-team-groups" aria-label="Team personnel groups">{([['staff','Staff'],['bench','Bench'],['all','All']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={group===value} onClick={()=>{setGroup(value);setPage(0)}}>{label}</button>)}</div>
        <p>{group==='staff'?'Rotation & bullpen':group==='bench'?'Outside the batting nine':'Complete roster'} · {ordered.length}</p>
        <div className="c9-team-personnel">{ordered.slice(current*5,current*5+5).map(p => <div key={p.id} data-testid={`row-player-${p.id}`}><span>{p.position} · {p.eligibility} · {isPitcher(p.position) ? (roles[p.pitchingRole ?? ''] ?? p.pitchingRole ?? 'Role unassigned') : p.lineupPosition ?? 'Field unassigned'}</span>{person(p,true)}</div>)}</div>
        {!ordered.length && <p>No players in this group.</p>}
        <nav className="c9-team-pages" aria-label="Personnel pages"><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><span aria-live="polite">{current+1} / {pages}</span><button type="button" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next</button></nav>
      </aside>
    </div>
    {active.some(p=>!positions.includes(p.lineupPosition ?? '')) && <div className="c9-team-unplaced"><strong>Batters needing a field assignment</strong>{active.filter(p=>!positions.includes(p.lineupPosition ?? '')).map(p=>person(p))}</div>}
    <p className="c9-team-footnote">Inspection view. <Link href={lineupUrl}>Open lineup workspace →</Link> · Assignment controls are available for your own team. Natural positions do not fill vacant slots automatically.</p>
  </section>;
}
