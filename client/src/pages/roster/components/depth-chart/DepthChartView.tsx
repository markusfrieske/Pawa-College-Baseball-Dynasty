import { useEffect, useRef, useState } from "react";
import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";
import { RetroButton } from "@/components/ui/retro-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLineupMutations } from "../../hooks/useLineupMutations";
import { usePitcherAvailability } from "../../hooks/usePitcherAvailability";
import { AvailStrip } from "./AvailStrip";
import "../../roster-workspace.css";

const POSITIONS = ["LF", "CF", "RF", "3B", "SS", "2B", "1B", "C", "DH"];
const ROLES = ["FRI", "SAT", "SUN", "MID", "LRP", "MR1", "MR2", "MR3", "SU", "CP"];
const ROLE_NAMES: Record<string, string> = { FRI: "Friday", SAT: "Saturday", SUN: "Sunday", MID: "Midweek", LRP: "Long relief", MR1: "Middle relief 1", MR2: "Middle relief 2", MR3: "Middle relief 3", SU: "Setup", CP: "Closer" };
type Slot = { type: "batting" | "defense" | "pitching"; value: string };
const name = (p: Player) => `${p.firstName} ${p.lastName}`;

export function DepthChartView({ players, onSelectPlayer, leagueId, isOwnTeam, rosterUrl, initialLineupTab = "field", currentWeek = 1 }: {
  players: Player[]; onSelectPlayer: (p: Player) => void; teamPrimaryColor?: string; leagueId?: string;
  isOwnTeam?: boolean; rosterUrl?: string; initialLineupTab?: "field" | "lineup" | "pitching"; currentWeek?: number;
}) {
  const [tab, setTab] = useState(initialLineupTab);
  useEffect(() => { setTab(initialLineupTab); }, [initialLineupTab]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [choice, setChoice] = useState("");
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const { battingOrderMutation: batting, pitchingRoleMutation: pitching, lineupPositionMutation: defense } = useLineupMutations(leagueId, rosterUrl);
  const pending = batting.isPending || pitching.isPending || defense.isPending;
  const availMap = usePitcherAvailability(players, currentWeek);
  const hitters = players.filter(p => !isPitcher(p.position));
  const pitchers = players.filter(p => isPitcher(p.position));
  const active = hitters.filter(p => p.battingOrder != null && p.battingOrder >= 1 && p.battingOrder <= 9);
  const occupants = (s: Slot) => (s.type === "pitching" ? pitchers : s.type === "defense" ? active : hitters).filter(p =>
    s.type === "batting" ? p.battingOrder === Number(s.value) : s.type === "pitching" ? p.pitchingRole === s.value : p.lineupPosition === s.value);
  const candidates = slot?.type === "pitching" ? pitchers : slot?.type === "defense" ? active : hitters;
  const resetErrors = () => { batting.reset(); pitching.reset(); defense.reset(); };
  const open = (s: Slot, button: HTMLButtonElement) => {
    resetErrors(); returnFocus.current = button; setChoice(occupants(s)[0]?.id || ""); setSlot(s);
  };
  const save = () => {
    if (!slot || !isOwnTeam || pending) return;
    const source = candidates.find(p => p.id === choice);
    const previous = occupants(slot).filter(p => p.id !== choice);
    const done = { onSuccess: () => setSlot(null) };
    // Each player occurs once. Swaps preserve the displaced player's slot when possible.
    if (slot.type === "batting") {
      batting.mutate([...previous.map((p, i) => ({ playerId: p.id, battingOrder: i === 0 ? source?.battingOrder ?? null : null })), ...(source ? [{ playerId: source.id, battingOrder: Number(slot.value) }] : [])], done);
    } else if (slot.type === "pitching") {
      pitching.mutate([...previous.map((p, i) => ({ playerId: p.id, pitchingRole: i === 0 ? source?.pitchingRole && [...ROLES, "MR"].includes(source.pitchingRole) ? source.pitchingRole : null : null })), ...(source ? [{ playerId: source.id, pitchingRole: slot.value }] : [])], done);
    } else {
      defense.mutate([...previous.map((p, i) => ({ playerId: p.id, lineupPosition: i === 0 ? source?.lineupPosition ?? null : null })), ...(source ? [{ playerId: source.id, lineupPosition: slot.value }] : [])], done);
    }
  };
  const renderSlot = (s: Slot, label: string) => {
    const people = occupants(s);
    return <div className={`c9-slot ${people.length > 1 ? "c9-conflict" : ""}`} key={s.value} data-testid={s.type === "batting" ? `slot-batting-${s.value}` : s.type === "pitching" ? `slot-pitching-${s.value}` : `field-slot-${s.value}`}>
      <strong className="c9-slot-label">{label}</strong>
      <div className="c9-slot-people">{people.length ? people.map(p => <button type="button" className="c9-player-link" key={p.id} onClick={() => onSelectPlayer(p)} aria-label={`View ${name(p)}`} data-testid={`slot-profile-${s.type}-${p.id}`}>{name(p)}<small>{p.position} · {p.eligibility} · OVR {p.overall}</small></button>) : <span className="c9-empty">Unassigned</span>}
        {people.length > 1 && <span role="status" className="text-amber-300 text-xs">Conflicting assignments</span>}
        {s.type === "pitching" && people.map(p => <AvailStrip key={p.id} playerId={p.id} availMap={availMap} />)}
      </div>
      {isOwnTeam && <button type="button" className="c9-slot-change" disabled={pending} onClick={e => open(s, e.currentTarget)} aria-label={`Assign ${label}`} data-testid={`assign-${s.type}-${s.value}`}>{people.length ? "Change" : "Assign"}</button>}
    </div>;
  };
  const error = slot?.type === "batting" ? batting.isError : slot?.type === "pitching" ? pitching.isError : defense.isError;
  const reserves = tab === "pitching" ? pitchers.filter(p => !ROLES.includes(p.pitchingRole || "")) : hitters.filter(p => !active.includes(p));
  return <section className="c9-lineup" data-testid="depth-chart-view">
    <div className="c9-view-tabs" aria-label="Lineup views">{([['field','Field'],['lineup','Batting order'],['pitching','Pitching']] as const).map(([value,label]) => <RetroButton key={value} size="sm" variant={tab === value ? "primary" : "outline"} aria-pressed={tab === value} onClick={() => setTab(value)} data-testid={`tab-${value}`}>{label}</RetroButton>)}</div>
    <p className="c9-workspace-help">{tab === "field" ? "Saved defensive assignments for your batting nine. Open a player to inspect; choose a position to assign." : tab === "lineup" ? "Choose a slot, select a player, then save. Moving an assigned player swaps places." : "Rotation and bullpen roles, with availability for the current week."}{!isOwnTeam && " Viewing another team's saved lineup."}</p>
    {tab === "field" ? <>
      <div className="c9-diamond" aria-label="Saved defensive lineup">
        <div className="c9-infield" aria-hidden="true" />
        {POSITIONS.filter(p => p !== "DH").map(pos => <div className={`c9-field-position c9-pos-${pos}`} key={pos}>{renderSlot({type:"defense",value:pos},pos)}</div>)}
        <span className="c9-mound">Pitching staff → Pitching tab</span>
      </div>
      <div className="c9-dh">{renderSlot({type:"defense",value:"DH"},"Designated hitter")}</div>
      {active.some(p => !POSITIONS.includes(p.lineupPosition || "")) && <div className="c9-unassigned"><h3>Batters needing a defensive assignment</h3>{active.filter(p => !POSITIONS.includes(p.lineupPosition || "")).map(p => <button key={p.id} onClick={() => onSelectPlayer(p)}>{name(p)} <small>Natural position: {p.position}</small></button>)}<p>Natural positions are not automatically treated as saved lineup assignments.</p></div>}
    </> : <div className="c9-lineup-columns"><div className="c9-order" data-testid={tab === "lineup" ? "batting-order-section" : "pitching-roles-section"}>{tab === "lineup" ? Array.from({length:9},(_,i)=>renderSlot({type:"batting",value:String(i+1)},`Batting ${i+1}`)) : ROLES.map(role=>renderSlot({type:"pitching",value:role},ROLE_NAMES[role]))}</div><aside className="c9-reserves"><h3>{tab === "pitching" ? "Other pitchers" : "Bench"}</h3><p>Open a profile, or use Change on a slot to assign.</p>{reserves.map(p=><button key={p.id} onClick={()=>onSelectPlayer(p)}>{name(p)}<small>{p.position} · OVR {p.overall}{p.pitchingRole ? ` · Saved role: ${p.pitchingRole}` : ""}</small>{tab === "pitching" && <AvailStrip playerId={p.id} availMap={availMap} />}</button>)}{!reserves.length && <p>Everyone has an assignment.</p>}</aside></div>}
    <Dialog open={!!slot} onOpenChange={open => { if (!open && !pending) setSlot(null); }}><DialogContent onCloseAutoFocus={e=>{e.preventDefault();returnFocus.current?.focus();}}><DialogHeader><DialogTitle>Assign {slot?.type === "batting" ? `batting slot ${slot.value}` : slot?.value}</DialogTitle><DialogDescription>{slot?.type === "defense" ? "Choose from the batting nine. Set batting order first to add a bench player." : "Choose a player or leave this slot unassigned. Existing assignments will swap."}</DialogDescription></DialogHeader><label htmlFor="lineup-player">Player</label><select id="lineup-player" data-testid="select-lineup-player" value={choice} onChange={e=>setChoice(e.target.value)} disabled={pending} className="c9-select"><option value="">Unassigned</option>{candidates.map(p=><option key={p.id} value={p.id}>{name(p)} · {p.position} · OVR {p.overall}</option>)}</select>{error && <p role="alert">Assignment was not saved. Your selection is retained; retry or cancel.</p>}<div className="flex gap-3 justify-end"><RetroButton variant="outline" disabled={pending} onClick={()=>setSlot(null)}>Cancel</RetroButton><RetroButton data-testid="save-lineup-assignment" disabled={pending || (!choice && !!slot && !occupants(slot).length)} onClick={save}>{pending ? "Saving…" : "Save assignment"}</RetroButton></div></DialogContent></Dialog>
  </section>;
}
