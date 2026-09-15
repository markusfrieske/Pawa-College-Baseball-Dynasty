/** Actual mode control + shared payload builder in synthetic state; no full-page/CSS claim. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Browser } from "@playwright/test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repo, "test-results");
const output = path.join(outputRoot, `report-entry-mode-${randomUUID()}`);
const executablePath = process.env.PAWA_TEST_BROWSER_PATH;
let browser: Browser | undefined;
let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
let bundle: Buffer;
const server = createServer((request, response) => {
  if (request.url === "/") { response.writeHead(200, { "Content-Type": "text/html" }); response.end(html); }
  else if (request.url === "/fixture.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(bundle); }
  else { response.writeHead(404); response.end(); }
});

try {
  await mkdir(output, { recursive: true });
  await build({ absWorkingDir: repo, entryPoints: ["scripts/fixtures/report-entry-mode-harness.tsx"], outfile: path.join(output, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
  bundle = await readFile(path.join(output, "fixture.js"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath, channel: !executablePath && process.platform === "win32" ? "msedge" : undefined, headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const unexpectedRequests: string[] = [];
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) { unexpectedRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(origin);
  const state = async () => JSON.parse((await page.getByTestId("fixture-state").textContent())!);
  const group = page.getByRole("group", { name: "Report detail" });
  const full = group.getByRole("radio", { name: "Full report", exact: true });
  const scoreOnly = group.getByRole("radio", { name: "Score only (commissioner)", exact: true });
  check(await group.count() === 1, "Report detail is an accessible group");
  check(await group.getByRole("radio").count() === 2, "Both mutually exclusive modes have accessible labels");
  check(await full.isChecked() && !(await scoreOnly.isChecked()), "Full report is selected initially");
  check((await state()).mode === "full", "Controlled initial mode matches the selected radio");
  await page.getByRole("textbox", { name: "Full draft note" }).fill("Keep my edited batting and pitching draft");
  const draft = (await state()).fullDraft;
  await full.focus();
  check(await full.evaluate(element => document.activeElement === element), "Full report radio accepts keyboard focus");
  await full.press("ArrowRight");
  check(await scoreOnly.isChecked() && !(await full.isChecked()), "Arrow key selects score-only mode exclusively");
  check(await scoreOnly.evaluate(element => document.activeElement === element), "Radio keyboard selection preserves focus");
  const scoreState = await state();
  check(scoreState.mode === "score-only", "Radio selection updates controlled mode");
  check(await page.getByRole("textbox", { name: "Full draft note" }).count() === 0, "Synthetic full-entry fields are hidden in score-only mode");
  const descriptionId = await group.getAttribute("aria-describedby");
  const description = await page.locator(`[id="${descriptionId}"]`).textContent();
  check(Boolean(description?.includes("only the final score")), "Score-only scope is explained");
  check(Boolean(description?.includes("Innings, hits, errors and player stats remain unknown")), "Unknown information is explicitly distinguished from zero stats");
  check(Boolean(description?.includes("no player lines are included")), "Player-line omission is explained");
  check(Boolean(description?.includes("draft is retained")), "Mode-switch draft retention is explained");
  check(JSON.stringify(scoreState.fullDraft) === JSON.stringify(draft), "Synthetic parent retains all full-draft fields while hidden");
  check(scoreState.payload.homeScore === 4 && scoreState.payload.awayScore === 2, "Shared score-only builder preserves the final score");
  check(scoreState.payload.overrideReason === "Missing scorebook", "Shared score-only builder preserves the commissioner reason");
  for (const field of ["homeBoxData", "awayBoxData", "homeHits", "awayHits", "homeErrors", "awayErrors", "inningScores"]) {
    check(scoreState.payload[field] === null, `Score-only ${field} is explicitly unknown`);
  }
  check(!Object.hasOwn(scoreState.payload, "corrections"), "Score-only payload carries no OCR correction data");
  check(!Object.hasOwn(scoreState.payload, "homeBatting") && !Object.hasOwn(scoreState.payload, "awayPitching"), "Score-only payload does not leak retained player lines");
  await scoreOnly.press("ArrowLeft");
  check(await full.isChecked() && !(await scoreOnly.isChecked()), "Keyboard returns exclusively to full report");
  check(await page.getByRole("textbox", { name: "Full draft note" }).inputValue() === draft.note, "Edited full draft reappears intact");
  check(JSON.stringify((await state()).payload) === JSON.stringify(draft), "Synthetic full payload is restored without data loss");
  await page.getByText("Score only (commissioner)", { exact: true }).click();
  check(await scoreOnly.isChecked(), "Clicking the visible radio label changes the mode");
  check(pageErrors.length === 0, `No browser errors: ${pageErrors.join(", ")}`);
  check(unexpectedRequests.length === 0, "No external network requests or media substitutions");
  console.log(`Report entry mode component: ${checks} assertions passed (375px, installed headless browser, synthetic parent; no full-page or visual-quality claim).`);
} finally {
  await browser?.close();
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const relative = path.relative(outputRoot, output);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(output).startsWith("report-entry-mode-"), "Cleanup must remain within this harness's owned output directory");
  await rm(output, { recursive: true, force: true });
}
