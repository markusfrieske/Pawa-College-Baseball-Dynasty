import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OcrReviewScreen, computeReviewIssues, type FieldSource } from "../../client/src/components/ocr-review-screen";
import { defaultBatter } from "../../client/src/lib/ocr-batting-merge";
import { ocrPitchersToEntries } from "../../client/src/lib/report-pitching";
import { reassignReportRosterPlayer } from "../../client/src/lib/report-roster-identity";
import type { Player, Team } from "../../shared/schema";

// This fixture exercises the real isolated component. It is not the report page,
// application providers, production CSS/media build, or a live OCR service.
const roster = Array.from({ length: 10 }, (_, i) => ({ id: `home-${i}`, firstName: `Player${i}`, lastName: "Synthetic", position: i === 0 ? "P" : "SS" } as Player));
const homeTeam = { id: "home", abbreviation: "HOM", name: "Synthetic Home", primaryColor: "#123456", secondaryColor: "#ffffff" } as Team;
const awayTeam = { ...homeTeam, id: "away", abbreviation: "AWY", name: "Synthetic Away" } as Team;
const initialBatting = roster.slice(0, 9).map((player, i) => ({ ...defaultBatter(player), ab: 4, r: i === 0 ? 1 : 0, h: i === 0 ? 2 : 0, doubles: i === 0 ? 1 : 0, rbi: i === 0 ? 1 : 0 }));
initialBatting[0] = { ...initialBatting[0], playerId: "unmatched-batter", name: "Readable Unmatched", needsName: true };
initialBatting[1] = { ...initialBatting[1], playerId: "unnamed-batter", name: "", needsName: true };
const initialPitching = ocrPitchersToEntries({ players: [{ name: "Readable Unmatched", ip: "6.2", h: 0, r: 0, er: 0, bb: 1, so: 7, hr: 0, decision: "W" }, { ip: "2.1", h: 0, r: 0, er: 0, bb: 0, so: 1, hr: 0 }] }, roster);
function Harness() {
  const [homeBatting, setHomeBatting] = useState(initialBatting);
  const [homePitching, setHomePitching] = useState(initialPitching);
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldSource>>({ "batting.home.unmatched-batter.hr": "low", [`pitching.home.${initialPitching[0].playerId}.ip`]: "ocr" });
  const [corrections, setCorrections] = useState<unknown[]>([]);
  const [error, setError] = useState("");
  const issues = computeReviewIssues({ homeScore: 1, awayScore: 0, homeBatting, homePitching, awayBatting: [], awayPitching: [], homeTeamName: homeTeam.name, awayTeamName: awayTeam.name, homePlayers: roster, awayPlayers: [], showInnings: false, numInnings: 9, homeInnings: [], awayInnings: [], lowConfidenceCount: 1, homeHits: 2, awayHits: 0 });
  const noChange = () => {};
  return <>
    <OcrReviewScreen homeTeam={homeTeam} awayTeam={awayTeam} homePlayers={roster} awayPlayers={[]}
      homeScore={1} awayScore={0} homeErrors={0} awayErrors={0} homeHits={2} awayHits={0}
      onChangeHomeScore={noChange} onChangeAwayScore={noChange} onChangeHomeErrors={noChange} onChangeAwayErrors={noChange}
      showInnings={false} numInnings={9} homeInnings={[]} awayInnings={[]} onChangeHomeInning={noChange} onChangeAwayInning={noChange}
      homeBatting={homeBatting} awayBatting={[]} homePitching={homePitching} awayPitching={[]}
      onChangeHomeBatting={setHomeBatting} onChangeAwayBatting={noChange} onChangeHomePitching={setHomePitching} onChangeAwayPitching={noChange}
      fieldMeta={fieldMeta} onCorrect={noChange} issues={issues} ackWarnings={false} onChangeAckWarnings={noChange}
      onReassign={(side, section, rowIndex, selectedPlayerId) => {
        if (side !== "home") throw new Error("Fixture only contains a home roster");
        const result = section === "batting"
          ? reassignReportRosterPlayer({ rows: homeBatting, rowIndex, selectedPlayerId, roster, fieldMeta, side, section })
          : reassignReportRosterPlayer({ rows: homePitching, rowIndex, selectedPlayerId, roster, fieldMeta, side, section });
        if (!result.ok) { setError(result.error.message); return; }
        if (section === "batting") setHomeBatting(result.rows as typeof homeBatting);
        else setHomePitching(result.rows as typeof homePitching);
        setFieldMeta(result.fieldMeta);
        setCorrections(previous => [...previous, ...result.corrections]);
      }}
      onRemoveRow={(side, section, index) => {
        if (side !== "home") return;
        if (section === "batting") setHomeBatting(rows => rows.filter((_, i) => i !== index));
        else setHomePitching(rows => rows.filter((_, i) => i !== index));
      }} />
    <pre hidden data-testid="fixture-state">{JSON.stringify({ homeBatting, homePitching, fieldMeta, corrections, issues, error })}</pre>
  </>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
