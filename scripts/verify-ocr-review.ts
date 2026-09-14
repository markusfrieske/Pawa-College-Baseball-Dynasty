/** Real OCR review component + synthetic state; no full-app/media/OCR-service claim. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Browser } from "@playwright/test";
import { validateBoxScore } from "../server/lib/validateBoxScore";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repo, "test-results");
const output = path.join(outputRoot, `ocr-review-${randomUUID()}`);
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
  await build({ absWorkingDir: repo, entryPoints: ["scripts/fixtures/ocr-review-harness.tsx"], outfile: path.join(output, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
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
  const initial = await state();
  check(initial.issues.filter((issue: any) => issue.id.includes("unresolved-player") && issue.severity === "hard").length === 4, "Four unreadable/readable-unmatched batting and pitching rows are hard errors");
  for (const id of ["review-batter-home-0-player", "review-batter-home-1-player", "review-pitcher-home-0-player", "review-pitcher-home-1-player"]) {
    check(await page.getByTestId(id).inputValue() === "", `${id}: unresolved ID is not presented as assigned`);
  }
  const batter0 = page.getByTestId("review-batter-home-0-player");
  check(await batter0.locator('option[value="home-2"]').count() === 0, "Already-used batting identities are unavailable");
  check(await batter0.locator('option[value="home-0"]').count() === 1, "Unassigned roster identity is offered");
  await batter0.focus();
  check(await batter0.evaluate(element => document.activeElement === element), "Roster selector accepts keyboard focus at 375px");
  await batter0.press("Home");
  await batter0.press("Enter");
  check(await batter0.inputValue() === "home-0", "Keyboard selects the exact roster ID");
  check(await batter0.evaluate(element => document.activeElement === element), "Roster reassignment preserves keyboard focus");
  const first = await state();
  check(first.homeBatting[0].name === "Player0 Synthetic" && first.homeBatting[0].playerId === "home-0", "Batting ID and canonical name change together");
  check(first.homeBatting[0].ab === initial.homeBatting[0].ab && first.homeBatting[0].h === initial.homeBatting[0].h && first.homeBatting[0].doubles === initial.homeBatting[0].doubles, "Batting stats survive reassignment");
  check(!first.issues.some((issue: any) => issue.id === "home-batting-unresolved-player-0"), "Mapping clears only the resolved hard identity issue");
  check(first.fieldMeta["batting.home.home-0.hr"] === "low" && first.fieldMeta["batting.home.unmatched-batter.hr"] === undefined, "Low-confidence provenance migrates to the new identity");
  await page.getByTestId("review-batter-home-1-player").selectOption("home-1");
  const pitcher0 = page.getByTestId("review-pitcher-home-0-player");
  check(await pitcher0.locator('option[value="home-0"]').count() === 1, "Two-way batting identity remains available for pitching");
  await pitcher0.selectOption("home-0");
  check(await page.getByTestId("review-pitcher-home-1-player").locator('option[value="home-0"]').count() === 0, "A pitcher cannot be selected twice in the pitching section");
  await page.getByTestId("review-pitcher-home-1-player").selectOption("home-1");
  const mapped = await state();
  for (let i = 0; i < 2; i++) {
    check(mapped.homePitching[i].playerId === `home-${i}` && mapped.homePitching[i].name === `Player${i} Synthetic`, `Pitcher ${i} receives exact canonical identity`);
    for (const field of ["role", "ip", "h", "r", "er", "bb", "so", "hr", "win", "loss"]) check(mapped.homePitching[i][field] === initial.homePitching[i][field], `Pitcher ${i} retains ${field}`);
  }
  check(mapped.fieldMeta["pitching.home.home-0.ip"] === "ocr", "Pitching provenance survives assignment");
  check(mapped.issues.filter((issue: any) => issue.severity === "hard").length === 0, "All hard issues clear after valid roster assignment");
  check(mapped.corrections.some((correction: any) => correction.oldPlayerId === "unmatched-batter" && correction.newPlayerId === "home-0"), "Identity transition remains auditable");
  check(validateBoxScore({ homeScore: 1, awayScore: 0, homeBoxData: { batting: mapped.homeBatting, pitching: mapped.homePitching } }).filter(issue => issue.severity === "error").length === 0, "Mapped complete nine-batter fixture passes the real server stat validator");
  await page.getByRole("button", { name: "Remove HOM pitching row 2", exact: true }).click();
  check((await state()).homePitching.length === 1, "Review removal callback removes only the selected pitching row");
  check(pageErrors.length === 0, `No browser errors: ${pageErrors.join(", ")}`);
  check(unexpectedRequests.length === 0, "No external network requests or media substitutions");
  console.log(`OCR review component: ${checks} assertions passed (375px, installed headless browser, synthetic fixture; no full-app or visual-quality claim).`);
} finally {
  await browser?.close();
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const relative = path.relative(outputRoot, output);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(output).startsWith("ocr-review-"), "Cleanup must remain within this harness's owned output directory");
  await rm(output, { recursive: true, force: true });
}
