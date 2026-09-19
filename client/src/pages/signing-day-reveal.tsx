import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { PlayerCardFront } from "@/components/player-card-front";
import type { Player } from "@/components/player-profile-card";
import type { RevealRecruit } from "@/components/recruit-card";
import { PlayerPortrait } from "@/components/ui/player-portrait";
import campus from "@/assets/art/varsity-campus.png";
import "./signing-day-reveal.css";

type ArrivalRecruit = RevealRecruit & Partial<Pick<Player, "jerseyNumber" | "eligibility" | "hairColor" | "hairStyle" | "facialHair" | "eyeStyle" | "eyebrowStyle" | "mouthStyle" | "eyeBlack">> & { signingDayRevealed?: boolean; rosterPlayerId?: string | null; rosterTeamId?: string | null; arrivalTeam?: TeamEntry["team"] };
interface TeamEntry { team: { id: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string }; recruits: ArrivalRecruit[]; canCompleteReveal?: boolean }
interface RevealData { league: { id: string; name: string; currentSeason: number }; teamData: TeamEntry[]; myTeamId: string | null; recordSeason?: number | null; seasons?: number[] }
type Spotlight = { recruit: ArrivalRecruit; team: TeamEntry["team"]; season: number };
const fullName = (r: ArrivalRecruit) => `${r.firstName} ${r.lastName}`;
const entryType = (r: ArrivalRecruit) => r.recruitType === "TRANSFER" ? "Transfer" : r.recruitType === "JUCO" ? "Junior college" : "Incoming recruit";
function toPlayer(recruit: ArrivalRecruit): Player {
  // Recruit IDs are not roster-player IDs. No invented jersey, class or statistics.
  return { ...recruit, jerseyNumber: recruit.jerseyNumber, eligibility: recruit.eligibility ?? "" } as Player;
}
function Portrait({ recruit, color }: { recruit: ArrivalRecruit; color: string }) {
  return <PlayerPortrait portraitId={recruit.portraitId} playerId={recruit.id} skinTone={recruit.skinTone} hairColor={recruit.hairColor} hairStyle={recruit.hairStyle} facialHair={recruit.facialHair ?? undefined} eyeStyle={recruit.eyeStyle ?? undefined} eyebrowStyle={recruit.eyebrowStyle ?? undefined} mouthStyle={recruit.mouthStyle ?? undefined} eyeBlack={recruit.eyeBlack ?? undefined} jerseyColor={color} className="c9-arrival-portrait" />;
}
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  return reduced;
}
async function readResponse(response: Response) {
  if (response.ok) return response.json();
  let message = "The class could not be loaded. Please retry.";
  try { const body = await response.json(); if (typeof body.message === "string") message = body.message; else if (typeof body.error === "string") message = body.error; } catch { /* Readable fallback. */ }
  throw new Error(message);
}

export default function SigningDayRevealPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const initialSeason = () => { const value = new URLSearchParams(window.location.search).get("season"); return value && /^[1-9]\d*$/.test(value) ? value : "live"; };
  const [seasonView,setSeasonView]=useState(initialSeason);
  useEffect(() => { setSeasonView(initialSeason()); }, [leagueId]);
  const [teamId, setTeamId] = useState(""), [search, setSearch] = useState("");
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [playing, setPlaying] = useState(false), [run, setRun] = useState(0);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(""), [notice, setNotice] = useState("");
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState("");
  const [exportImage, setExportImage] = useState<{ url: string; filename: string } | null>(null);
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null), exportDialog = useRef<HTMLDialogElement>(null);
  const completeCard = useRef<HTMLDivElement>(null), classSheet = useRef<HTMLDivElement>(null);
  const requestInFlight = useRef(false), context = useRef(leagueId);
  context.current = leagueId;
  const liveQuery = useQuery<RevealData>({
    queryKey: ["/api/leagues", leagueId, "signing-day-reveal"],
    queryFn: async ({ signal }) => readResponse(await fetch(`/api/leagues/${leagueId}/signing-day-reveal`, { signal, credentials: "include" })),
    enabled: !!leagueId && seasonView==="live", retry: false,
  });
  const archiveQuery=useQuery<RevealData>({queryKey:["/api/leagues",leagueId,"arrival-scrapbook",seasonView],queryFn:async({signal})=>readResponse(await fetch('/api/leagues/'+leagueId+'/arrival-scrapbook'+(seasonView==='live'?'':'?season='+encodeURIComponent(seasonView)),{signal,credentials:'include'})),enabled:!!leagueId,retry:false});
  const query=seasonView==='live'?liveQuery:archiveQuery;
  const data = query.data;
  const displaySeason=data?.recordSeason??data?.league.currentSeason;
  const seasonPicker=<label className="c9-arrival-season">Class season <select aria-label="Class season" value={seasonView} disabled={saving||exporting} onChange={e=>{setSeasonView(e.target.value);setTeamId('');setSpotlight(null);setExportImage(null);setPlaying(false);setSearch('');setNotice('');}}><option value="live">Current arrivals</option>{archiveQuery.data?.seasons?.map(season=><option key={season} value={String(season)}>Season {season} · Scrapbook</option>)}</select></label>;
  const teams = useMemo(() => [...(data?.teamData ?? [])].sort((a, b) => a.team.name.localeCompare(b.team.name)), [data]);
  const selected = teams.find(t => t.team.id === teamId) ?? teams.find(t => t.team.id === data?.myTeamId) ?? teams[0];
  const recruits = useMemo(() => [...(selected?.recruits ?? [])].sort((a, b) => fullName(a).localeCompare(fullName(b)) || a.id.localeCompare(b.id)), [selected]);
  const filtered = recruits.filter(r => `${fullName(r)} ${r.position}`.toLowerCase().includes(search.toLowerCase()));
  const unopened = recruits.some(r => !r.signingDayRevealed), allOpened = recruits.length > 0 && !unopened;
  const selectedKey = selected?.team.id ?? "", permission = selected?.canCompleteReveal === true;
  const exportContext = useRef("");
  exportContext.current = `${leagueId}/${seasonView}/${selectedKey}/${spotlight?.recruit.id ?? "class"}`;
  useEffect(() => { setTeamId(""); setSearch(""); setSpotlight(null); setPlaying(false); setSaveError(""); setNotice(""); setViewed(new Set()); setExportImage(null); }, [leagueId,seasonView]);
  useEffect(() => { setSaveError(""); setNotice(""); setSearch(""); setExportError(""); }, [selectedKey]);
  useEffect(() => { if (spotlight && dialog.current && !dialog.current.open) dialog.current.showModal(); if (!spotlight && dialog.current?.open) dialog.current.close(); }, [spotlight]);
  useEffect(() => { if (!playing) return; if (reduced) { setPlaying(false); return; } const timeout = window.setTimeout(() => setPlaying(false), 1500); return () => window.clearTimeout(timeout); }, [playing, reduced, run]);
  useEffect(() => { if (spotlight && !playing) completeCard.current?.focus({ preventScroll: true }); }, [playing, spotlight]);
  useEffect(() => { if (exportImage && exportDialog.current && !exportDialog.current.open) exportDialog.current.showModal(); if (!exportImage && exportDialog.current?.open) exportDialog.current.close(); }, [exportImage]);

  async function completeReveal() {
    if (!selected || !leagueId || !permission || !unopened || requestInFlight.current) return;
    const requestLeague = leagueId;
    requestInFlight.current = true; setSaving(true); setSaveError(""); setNotice("");
    try {
      await readResponse(await fetch(`/api/leagues/${leagueId}/signing-day-reveal/complete?teamId=${encodeURIComponent(selected.team.id)}`, { method: "POST", credentials: "include" }));
      if (context.current !== requestLeague) return;
      const refreshed = await query.refetch();
      if (refreshed.error) throw new Error("Reveal submitted, but the updated class could not load. Reload class status to check the saved state.");
      if (context.current !== requestLeague) return;
      const confirmed = refreshed.data?.teamData.find(t => t.team.id === selected.team.id);
      if (!confirmed || confirmed.recruits.some(r => !r.signingDayRevealed)) throw new Error("The server has not confirmed the complete class record. Reload class status before trying again.");
      void queryClient.invalidateQueries({queryKey:["/api/leagues",leagueId,"arrival-scrapbook"]});
      setNotice("Class record opened. Choose a player for their spotlight.");
      void queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "dashboard-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "recruiting"] });
    } catch (error) { if (context.current === requestLeague) setSaveError(error instanceof Error ? error.message : "Could not open the class record. Please retry."); }
    finally { requestInFlight.current = false; setSaving(false); }
  }
  function openSpotlight(recruit: ArrivalRecruit) {
    if (!selected || !data || !recruit.signingDayRevealed) return;
    setSpotlight({ recruit, team: recruit.arrivalTeam ?? selected.team, season: displaySeason! });
    setViewed(old => new Set(old).add(recruit.id)); setExportError(""); setRun(n => n + 1); setPlaying(!reduced);
  }
  function closeSpotlight() { setPlaying(false); setSpotlight(null); }
  async function exportPNG(kind: "player" | "class") {
    const target = kind === "player" ? completeCard.current : classSheet.current;
    if (!target || exporting || playing || (kind === "class" && !allOpened)) return;
    const startedIn = exportContext.current;
    setExporting(true); setExportError("");
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(target.querySelectorAll("img")).map(img => img.decode()));
      const deadline = Date.now() + 6000;
      while (Array.from(target.querySelectorAll("canvas")).some(c => c.classList.contains("invisible"))) {
        if (Date.now() > deadline) throw new Error("A portrait has not finished loading. Wait or retry the image.");
        await new Promise(resolve => window.setTimeout(resolve, 80));
      }
      if (target.scrollHeight > 10000) throw new Error("This image is too tall. Narrow the name or position filter and export that selection.");
      const html2canvas = (await import("html2canvas")).default;
      if (!target.isConnected || startedIn !== exportContext.current) return;
      const canvas = await html2canvas(target, { backgroundColor: "#eee5d0", scale: 2, logging: false, useCORS: true, onclone: doc => { const style=doc.createElement("style"); style.textContent=".c9-card-stat-groups h4{line-height:20px;padding:3px 5px 7px}.c9-card-portrait strong{line-height:20px;padding-bottom:5px}.c9-card-values dd>span:first-child{height:24px;min-height:24px;line-height:18px;padding-bottom:4px}"; doc.head.appendChild(style); } });
      if (!target.isConnected || startedIn !== exportContext.current) return;
      const slug = (kind === "player" && spotlight ? fullName(spotlight.recruit) : selected?.team.name ?? "class").replace(/[^a-z0-9-]+/gi, "-");
      setExportImage({ url: canvas.toDataURL("image/png"), filename: `class-of-nine-${slug}-season-${displaySeason ?? ""}.png` });
    } catch (error) { setExportError(error instanceof Error ? error.message : "Image creation failed. Please retry."); }
    finally { setExporting(false); }
  }

  if (query.isPending) return <main className="c9-arrival-page">{seasonPicker}<p role="status">Opening the class record…</p></main>;
  if (query.isError) return <main className="c9-arrival-page">{seasonPicker}<h1>Class record unavailable</h1><p role="alert">{query.error.message}</p><button onClick={() => query.refetch()}>Retry class record</button><Link href={`/league/${leagueId}`}>Return to program</Link></main>;
  return <main className="c9-arrival-page">
    {seasonPicker}{seasonView!=="live"&&<p className="c9-arrival-notice">Class scrapbook · Original arrival cards preserved from Season {displaySeason}.</p>}<header className="c9-arrival-heading"><div><span className="c9-arrival-kicker">{data?.league.name} / SEASON {displaySeason}</span><h1>A new class. A place to belong.</h1><p>Choose the spotlight. Get to know the whole player.</p></div><Link href={`/league/${leagueId}`}>Return to program ↗</Link></header>
    <section className="c9-arrival-home"><img src={campus} alt="" className="c9-arrival-campus"/><div className="c9-arrival-home-copy"><img src="/brand/gateway.svg" alt="" className="c9-arrival-gateway"/><span className="c9-arrival-kicker">THE CLUBHOUSE / CLASS OF NINE</span><h2>{selected?.team.name ?? "The incoming class"}</h2><p>{recruits.length} committed {recruits.length === 1 ? "player" : "players"} · Season {displaySeason}</p><p>Every player gets the same welcome. Open the class record for complete ratings and abilities.</p></div></section>
    <div className="c9-arrival-toolbar"><label>Program <select value={selectedKey} disabled={saving || exporting} onChange={e => setTeamId(e.target.value)}>{teams.map(t => <option key={t.team.id} value={t.team.id}>{t.team.name}{t.team.id === data?.myTeamId ? " · Your program" : ""}</option>)}</select></label><label>Find player <input value={search} disabled={exporting} onChange={e => setSearch(e.target.value)} placeholder="Name or position"/></label><span>{filtered.length} of {recruits.length} players</span>{allOpened && <button onClick={() => exportPNG("class")} disabled={exporting || !filtered.length}>{exporting ? "Preparing image…" : "Preview class keepsake PNG"}</button>}</div>
    {unopened && <section className="c9-arrival-open"><div><h2>{permission ? "Open this class record" : "The complete record is not open yet"}</h2><p>{permission ? "This records the class reveal. Replays afterward do not change players, scouting, or the season." : "An authorized coach must open the class during its eligible arrival phase. Previously opened records remain available."}</p></div>{permission && <button className="c9-arrival-primary" disabled={saving} onClick={completeReveal}>{saving ? "Opening class record…" : saveError ? "Retry opening class" : "Open class record"}</button>}</section>}
    {saveError && <p className="c9-arrival-error" role="alert">{saveError} <button onClick={() => query.refetch()}>Reload class status</button></p>}
    <p className="c9-arrival-notice" role="status">{notice}</p>
    <div ref={classSheet} className="c9-arrival-class-sheet">
      <div className="c9-arrival-class-title"><div><span className="c9-arrival-kicker">{selected?.team.name} / SEASON {displaySeason}</span><h2>Remember these names.</h2></div><p>Committed class · {filtered.length}{filtered.length !== recruits.length ? ` of ${recruits.length} shown` : " players"}<br/>Alphabetical order</p></div>
      <div className="c9-arrival-gallery" data-testid="arrival-class-gallery">{filtered.map(r => <article className="c9-arrival-person" key={r.id}><Portrait recruit={r} color={r.arrivalTeam?.primaryColor ?? selected?.team.primaryColor ?? "#234734"}/><div><span>{r.position} · {entryType(r)}</span><h3>{fullName(r)}</h3><p>{r.signingDayRevealed ? "Complete class record open" : "Awaiting class reveal"}</p><button data-html2canvas-ignore="true" onClick={() => openSpotlight(r)} disabled={!r.signingDayRevealed}>{viewed.has(r.id) ? "Replay spotlight" : "Meet this player"} <span aria-hidden="true">↗</span></button></div></article>)}</div>
      {!recruits.length && <p className="c9-arrival-empty">No captured arrival records are available for this program.</p>}
      {!!recruits.length && !filtered.length && <p className="c9-arrival-empty">No players match this filter. Clear the search to see the class.</p>}
      <p className="c9-arrival-provenance">Committed class · Names, positions and portraits to remember.</p>
    </div>
    <p className="c9-arrival-footnote">Opened classes are preserved in your season scrapbook. Download a PNG to share a keepsake. Earlier uncaptured classes are not reconstructed.</p>
    {exportError && !spotlight && <p className="c9-arrival-error" role="alert">{exportError}</p>}
    <dialog ref={dialog} className="c9-arrival-dialog" data-testid="arrival-spotlight" aria-labelledby="arrival-dialog-title" onCancel={e => { if (playing) { e.preventDefault(); setPlaying(false); } }} onClose={closeSpotlight}>
      {spotlight && <><div className="c9-arrival-dialog-tools"><div><span className="c9-arrival-kicker">{spotlight.team.name} / SEASON {spotlight.season}</span><h2 id="arrival-dialog-title">{fullName(spotlight.recruit)}</h2></div><div>{playing ? <button className="c9-arrival-primary" onClick={() => setPlaying(false)}>Skip to complete profile</button> : <><button onClick={() => { setRun(n => n + 1); setPlaying(!reduced); }}>Replay spotlight</button><button onClick={() => exportPNG("player")} disabled={exporting}>{exporting ? "Preparing image…" : "Preview full card PNG"}</button></>}{spotlight.recruit.rosterPlayerId && spotlight.recruit.rosterTeamId && <Link href={`/league/${leagueId}/roster?teamId=${encodeURIComponent(spotlight.recruit.rosterTeamId)}&playerId=${encodeURIComponent(spotlight.recruit.rosterPlayerId)}`}>View current roster record ↗</Link>}<button onClick={() => dialog.current?.close()}>Back to class</button></div></div>
      {playing ? <section key={run} className="c9-arrival-stage" aria-label="Player welcome"><img src={campus} className="c9-arrival-campus" alt=""/><div className="c9-arrival-stage-copy"><img src="/brand/gateway.svg" alt="" className="c9-arrival-gateway"/><span className="c9-arrival-kicker">WELCOME TO {spotlight.team.name}</span><h2>A new name in<br/>the clubhouse.</h2><div className="c9-arrival-nameplate"><h3>{fullName(spotlight.recruit)}</h3><p>{spotlight.recruit.position} · {entryType(spotlight.recruit)} · Committed class</p></div></div><div className="c9-arrival-stage-player"><Portrait recruit={spotlight.recruit} color={spotlight.team.primaryColor}/></div></section> : <div ref={completeCard} tabIndex={-1} className="c9-arrival-complete"><div className="c9-arrival-record-label">CLASS OF NINE / {spotlight.team.name} / SEASON {spotlight.season} / COMMITTED CLASS RECORD</div><PlayerCardFront player={toPlayer(spotlight.recruit)} teamColor={spotlight.team.primaryColor}/><p>College statistics begin with the first recorded game.</p></div>}
      <p role="status" className="c9-arrival-dialog-status">{playing ? "Coach’s cut · 1.5 seconds · Escape skips to profile." : reduced ? "Reduced motion · Complete profile shown immediately." : "Complete profile · All ratings and statistics remain on the front."}</p>{exportError && <p role="alert" className="c9-arrival-error">{exportError}</p>}</>}
    </dialog>
    <dialog ref={exportDialog} className="c9-arrival-export" aria-labelledby="arrival-export-title" onClose={() => setExportImage(null)}>{exportImage && <><div className="c9-arrival-dialog-tools"><h2 id="arrival-export-title">Review your keepsake</h2><button onClick={() => exportDialog.current?.close()}>Close preview</button></div><p>Review the exact image before downloading or sharing. Full player cards contain disclosed ratings and abilities.</p><img src={exportImage.url} alt="Preview of the prepared Class of Nine keepsake"/><a className="c9-arrival-primary" href={exportImage.url} download={exportImage.filename}>Download PNG</a></>}</dialog>
  </main>;
}
