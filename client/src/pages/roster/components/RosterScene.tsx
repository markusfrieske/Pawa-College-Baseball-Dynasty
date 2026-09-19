import { useEffect, useRef, useState } from "react";
import type { Player } from "@shared/schema";
import { isPitcher } from "@shared/positions";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import { PositionSection } from "./PositionSection";

type Props = React.ComponentProps<typeof PositionSection>;

export function RosterScene(props: Props) {
  const [pageSize, setPageSize] = useState(() => window.innerHeight >= 1000 ? 12 : 8);
  useEffect(() => { const resize = () => setPageSize(window.innerHeight >= 1000 ? 12 : 8); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const ledger = useRef<HTMLDivElement>(null);
  const restorePageFocus = useRef(false);
  const pages = Math.max(1, Math.ceil(props.players.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = props.players.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const active = visible.find(p => p.id === activeId) ?? visible[0];
  useEffect(() => { if (restorePageFocus.current) { ledger.current?.querySelector<HTMLButtonElement>('[data-testid^="link-player-"]')?.focus(); restorePageFocus.current = false; } }, [currentPage]);
  const movePage = (next: number, keyboard = false) => { const bounded = Math.max(0, Math.min(pages - 1, next)); if (bounded === currentPage) return; restorePageFocus.current = keyboard; setPage(bounded); setActiveId(null); };
  return <section className="c9-roster-scene" aria-label="Roster comparison and selected athlete">
    <div className="c9-ledger" ref={ledger}>
      <div onKeyDown={event => {
        if (!(event.target instanceof HTMLElement) || !event.target.closest('[data-testid^="link-player-"]')) return;
        const index = visible.findIndex(p => p.id === active?.id);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next = visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
          if (next) { setActiveId(next.id); event.currentTarget.querySelector<HTMLButtonElement>(`[data-testid="link-player-${next.id}"]`)?.focus(); }
        }
        if (event.key === 'PageDown' || event.key === 'PageUp') { event.preventDefault(); movePage(currentPage + (event.key === 'PageDown' ? 1 : -1), true); }
      }}>
        <PositionSection {...props} players={visible} totalCount={props.players.length} activeId={active?.id} onHighlight={p => setActiveId(p.id)} />
      </div>
      <div className="c9-roster-range" aria-label="Roster pages">
        <span aria-live="polite">{props.players.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, props.players.length)} / {props.players.length} players</span>
        <button disabled={currentPage === 0} onClick={() => movePage(currentPage - 1)}>Previous</button>
        <button disabled={currentPage === pages - 1} onClick={() => movePage(currentPage + 1)}>Next</button>
      </div>
      <p className="c9-roster-input-hint">Focus a player · ↑ ↓ select · Enter profile · Page Up / Down browse</p>
    </div>
    {active && <aside className="c9-athlete-stage" aria-label="Selected athlete" data-testid="selected-athlete">
      <div className="c9-athlete-art">
        <span className="c9-athlete-number" aria-hidden="true">{active.jerseyNumber}</span>
        <PlayerPortrait portraitId={active.portraitId} playerId={active.id} skinTone={active.skinTone ?? undefined} hairColor={active.hairColor ?? undefined} hairStyle={active.hairStyle ?? undefined} facialHair={active.facialHair ?? undefined} eyeStyle={active.eyeStyle ?? undefined} eyebrowStyle={active.eyebrowStyle ?? undefined} mouthStyle={active.mouthStyle ?? undefined} eyeBlack={active.eyeBlack ?? undefined} jerseyColor={props.teamPrimaryColor} className="c9-athlete-portrait" />
      </div>
      <div className="c9-athlete-copy">
        <p className="c9-roster-kicker">{active.position} / {active.eligibility}{active.captainRole ? ' / CAPTAIN' : ''}</p>
        <h2><span>{active.firstName}</span>{active.lastName}</h2>
        <p className="c9-athlete-origin">{[active.hometown, active.homeState].filter(Boolean).join(', ') || 'Hometown not recorded'} · B/T {active.batHand}/{active.throwHand}</p>
        <dl className="c9-athlete-ratings">
          {([['Overall', active.overall], ...(isPitcher(active.position) ? [['Control', active.control], ['Stamina', active.stamina]] : [['Hit for avg', active.hitForAvg], ['Power', active.power]])] as Array<[string, number | null | undefined]>).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}
        </dl>
        <button className="c9-athlete-inspect" onClick={() => props.onSelectPlayer(active)}>Open player profile →</button>
      </div>
    </aside>}
  </section>;
}

