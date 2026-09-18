/** Real ReportHistory component with synthetic HTTP data, not a full authenticated app/media test. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect, type Browser, type Locator } from "@playwright/test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let browser: Browser | undefined;
let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
const visible = async (locator: Locator, label: string) => { await expect(locator, label).toBeVisible(); checks++; };
const absent = async (locator: Locator, label: string) => { await expect(locator, label).toHaveCount(0); checks++; };
const snapshot = { homeScore: 5, awayScore: 3, homeHits: null, awayHits: null, homeErrors: null, awayErrors: null, status: "pending" };
const revision = (editVersion: number, event: string, fields: Record<string, unknown> = {}) => ({
  id: `revision-${editVersion}`, editVersion, actorUserId: "coach", event,
  createdAt: "2026-09-17T10:00:00.000Z", snapshot, corrections: [], ...fields,
});
const actorNames = { coach: "Coach Synthetic", commissioner: "Commissioner Synthetic" };
const main = { actorNames, revisions: [
  revision(1, "submitted"),
  revision(2, "edited", { corrections: [{ fieldKey: "score.homeScore" }, { fieldKey: "score.awayScore" }], snapshot: { ...snapshot, homeHits: 0 } }),
  revision(3, "disputed", { snapshot: { ...snapshot, status: "disputed", disputeReason: "Synthetic disputed score" } }),
  revision(4, "force-finalized", { actorUserId: "commissioner", snapshot: { ...snapshot, status: "confirmed" } }),
], receipt: { reportRevisionId: "revision-4", acceptedByUserId: "commissioner", finalizedAt: "2026-09-17T11:00:00.000Z" } };
const legacy = { actorNames: {}, revisions: [revision(7, "legacy-observed", { actorUserId: null })], receipt: { reportRevisionId: null, acceptedByUserId: null, finalizedAt: "2026-09-16T11:00:00.000Z" } };
const confirmed = { actorNames, revisions: [revision(1, "submitted"), revision(2, "confirmed", { snapshot: { ...snapshot, status: "confirmed" } })], receipt: { reportRevisionId: "revision-2", acceptedByUserId: "coach", finalizedAt: "2026-09-17T11:00:00.000Z" } };
const requests: string[] = [];
const held: Array<() => void> = [];
let failErrorGame = true;
let holdMain = true;
let forbidMain = false;
let bundle = "";
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server = createServer((request, response) => {
  if (request.url === "/") { response.writeHead(200, { "Content-Type": "text/html" }); response.end(html); return; }
  if (request.url === "/fixture.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(bundle); return; }
  const match = request.url?.match(/^\/api\/leagues\/synthetic-league\/games\/([^/]+)\/report\/history$/);
  if (!match) { response.writeHead(404); response.end(); return; }
  requests.push(match[1]);
  const send = () => {
    const game = match[1];
    const status = game === "forbidden" || game === "main" && forbidMain ? 403 : game === "error" && failErrorGame ? 503 : 200;
    const body = game === "legacy" ? legacy : game === "confirmed" ? confirmed : game === "main" || game === "error" ? main : { actorNames: {}, revisions: [], receipt: null };
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (match[1] === "main" && holdMain) held.push(send); else send();
});

try {
  const result = await build({ absWorkingDir: repo, stdin: { contents: `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
    import { ReportHistory } from "./client/src/components/report-history";
    const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } } });
    function Fixture() {
      const [gameId, setGameId] = useState("main");
      return <QueryClientProvider client={client}><nav aria-label="Synthetic game selector">{["main", "empty", "error", "forbidden", "legacy", "confirmed"].map(game => <button key={game} onClick={() => setGameId(game)}>Open {game}</button>)}</nav><ReportHistory leagueId="synthetic-league" gameId={gameId} /></QueryClientProvider>;
    }
    createRoot(document.getElementById("root")).render(<Fixture />);
  `, loader: "tsx", resolveDir: repo }, write: false, bundle: true, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
  bundle = result.outputFiles[0].text;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const executablePath = process.env.PAWA_TEST_BROWSER_PATH;
  browser = await chromium.launch({ executablePath, channel: !executablePath && process.platform === "win32" ? "msedge" : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const unexpected: string[] = [];
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) { unexpected.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(origin);
  const toggle = page.getByRole("button", { name: "Report history", exact: true });
  await visible(toggle, "History has a labeled toggle");
  check(await toggle.getAttribute("aria-expanded") === "false", "History starts collapsed");
  check(requests.length === 0, "Collapsed history does not fetch private data");
  await toggle.focus(); await toggle.press("Enter");
  await visible(page.getByRole("status"), "Opening history displays loading feedback");
  check(await toggle.getAttribute("aria-expanded") === "true", "Keyboard Enter expands history");
  check(requests.length === 1 && requests[0] === "main", "Expansion requests only the selected game");
  holdMain = false; held.splice(0).forEach(send => send());
  await visible(page.getByText("Version 4 · Accepted by commissioner · Official result", { exact: true }), "Accepted receipt marks exactly its commissioner revision official");
  check(await page.getByText(/Official result/, { exact: false }).count() === 1, "Only one revision is marked official");
  for (const label of ["Version 1 · Submitted", "Version 2 · Edited", "Version 3 · Disputed"]) await visible(page.getByText(label, { exact: true }), `Event label: ${label}`);
  check((await page.locator("li").count()) === 4, "All recorded revisions appear");
  await visible(page.getByText(/Commissioner Synthetic/), "Actor ID resolves to current commissioner name");
  const details = page.locator("li").first().locator("summary");
  await details.focus(); await details.press("Enter");
  check(await details.locator("..").getAttribute("open") !== null, "Recorded details support keyboard expansion");
  await visible(page.getByText("Hits — Away: Not recorded; Home: Not recorded", { exact: true }).first(), "Unknown hits never render as zeros");
  await visible(page.getByText("Errors — Away: Not recorded; Home: Not recorded", { exact: true }).first(), "Unknown errors never render as zeros");
  const editedDetails = page.locator("li").nth(1).locator("summary"); await editedDetails.click();
  await visible(page.getByText("Hits — Away: Not recorded; Home: 0", { exact: true }), "An explicit known zero remains distinct from unknown");
  await visible(page.getByText("2 recorded field corrections", { exact: true }), "Revision correction count is visible");
  await page.locator("li").nth(2).locator("summary").click();
  await visible(page.getByText("Dispute: Synthetic disputed score", { exact: true }), "Dispute reason is preserved");
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No basic native-layout horizontal overflow at ${width}px (not production CSS QA)`);
  }
  const priorRequests = requests.length;
  await page.getByRole("button", { name: "Refresh history", exact: true }).click();
  await expect.poll(() => requests.length).toBe(priorRequests + 1); checks++;
  forbidMain = true;
  await page.getByRole("button", { name: "Refresh history", exact: true }).click();
  await visible(page.getByText("Only participating coaches and commissioners can view report history.", { exact: true }), "Refetch detects revoked access");
  await absent(page.locator("li"), "Revoked access removes previously cached private revisions");
  await absent(page.getByText(/Commissioner Synthetic/), "Revoked access removes cached actor identities");
  forbidMain = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await visible(page.getByText("Version 1 · Submitted", { exact: true }), "Restored access allows deliberate retry");
  await toggle.focus(); await toggle.press("Space");
  check(await toggle.getAttribute("aria-expanded") === "false", "Keyboard Space collapses history");
  await absent(page.locator("li"), "Collapsed history removes revision content");
  await toggle.press("Enter");
  await visible(page.getByText("Version 1 · Submitted", { exact: true }), "History reopens");
  await page.getByRole("button", { name: "Open empty", exact: true }).click();
  await visible(page.getByText("No report history is recorded for this game.", { exact: true }), "Empty history explains the missing record");
  await absent(page.locator("li"), "Changing to empty game does not retain former revisions");
  await page.getByRole("button", { name: "Open error", exact: true }).click();
  await visible(page.getByRole("alert"), "Failed fetch has persistent error feedback");
  await visible(page.getByText("Report history could not be loaded.", { exact: true }), "Server failure has understandable message");
  await absent(page.locator("li"), "Failed game fetch does not expose another game's revisions");
  failErrorGame = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await visible(page.getByText("Version 4 · Accepted by commissioner · Official result", { exact: true }), "Retry successfully reloads history");
  await absent(page.getByRole("alert"), "Successful retry removes stale error");
  await page.getByRole("button", { name: "Open forbidden", exact: true }).click();
  await visible(page.getByText("Only participating coaches and commissioners can view report history.", { exact: true }), "Forbidden history explains membership restriction");
  await absent(page.locator("li"), "Forbidden game does not reveal cached foreign-game revisions");
  await absent(page.getByText(/Commissioner Synthetic/), "Forbidden game does not reveal a prior game's actor name");
  await page.getByRole("button", { name: "Open legacy", exact: true }).click();
  await visible(page.getByText("Version 7 · Existing report preserved", { exact: true }), "Legacy version is identified as observation");
  await visible(page.getByText("Preserved when history tracking began. Earlier edits and their authors are unavailable.", { exact: true }), "Legacy history uncertainty is explicit");
  await visible(page.getByText("This official result has no linked accepted report version.", { exact: true }), "Unlinked legacy receipt is not invented");
  await visible(page.getByText(/Actor not recorded/), "Legacy actor remains unknown");
  await page.locator("summary").click();
  await visible(page.getByText("Earlier correction history is not attributed to this version.", { exact: true }), "Legacy corrections remain unattributed");
  await page.getByRole("button", { name: "Open confirmed", exact: true }).click();
  await visible(page.getByText("Version 2 · Accepted · Official result", { exact: true }), "Coach acceptance has its own official revision");
  check(pageErrors.length === 0, `No browser runtime errors: ${pageErrors.join(", ")}`);
  check(unexpected.length === 0, "Harness made no external/media network requests");
  console.log(`Report history component: ${checks} assertions passed (real component, synthetic HTTP/React Query data, installed headless browser; 375px and 1280px native layout only, no full authenticated app or production visual-quality claim).`);
} finally {
  held.splice(0).forEach(send => send());
  await browser?.close();
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
