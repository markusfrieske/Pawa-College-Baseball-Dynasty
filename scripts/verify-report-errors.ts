/** Actual report-error component with synthetic draft/navigation; no full-page claim. */
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
const output = path.join(outputRoot, `report-errors-${randomUUID()}`);
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
  await build({ absWorkingDir: repo, entryPoints: ["scripts/fixtures/report-errors-harness.tsx"], outfile: path.join(output, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
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
  const alert = page.getByRole("alert", { name: "Report could not be saved" });
  check(await alert.count() === 1, "Persistent error has an accessible alert name");
  check(await alert.getAttribute("aria-atomic") === "true", "Alert announces the complete feedback");
  check(await alert.getByRole("listitem").count() === (await state()).count, "Every server validation issue remains visible");
  for (const label of ["Inning scores", "Home pitching, row 1 — Innings pitched", "Home pitching, row 1 — Earned runs", "Away batting, row 9 — Roster player"]) {
    check((await alert.textContent())!.includes(label), `${label}: readable section and field context`);
  }
  check((await alert.textContent())!.includes("Warning: Report: Check the optional detail"), "Warning severity is distinguished from errors");
  await page.getByRole("textbox", { name: "Draft", exact: true }).fill("Preserve this edited draft: 5–1");
  for (const [label, section, side, rowIndex] of [
    ["Review home pitching, row 1 — innings pitched", "pitching", "home", 0],
    ["Review away batting, row 9 — roster player", "batting", "away", 8],
    ["Review inning scores", "innings", undefined, undefined],
  ] as const) {
    const button = page.getByRole("button", { name: label, exact: true });
    await button.focus();
    await button.press("Enter");
    const current = await state();
    check(current.target.section === section && current.target.side === side && current.target.rowIndex === rowIndex, `${label}: keyboard invokes the exact section/row target`);
    check(await page.getByRole("textbox", { name: "Selected section" }).evaluate(element => document.activeElement === element), "Synthetic host receives and focuses section navigation");
    check(current.draft === "Preserve this edited draft: 5–1", "Synthetic host retains edited draft during section navigation");
    check(await alert.getByRole("listitem").count() === current.count, "Navigating does not dismiss feedback");
  }
  await page.getByRole("button", { name: "Malformed response" }).click();
  check((await alert.textContent())!.includes("The report could not be saved. Please try again."), "Malformed upstream HTML produces readable fallback");
  check(!(await alert.textContent())!.includes("<html>"), "Raw response markup is not shown");
  check(await alert.getByRole("listitem").count() === 0, "Malformed response does not retain stale prior issues");
  await page.getByRole("button", { name: "Permission response" }).click();
  check((await alert.textContent())!.includes("Only an involved coach can report this game"), "Non-validation route error remains readable");
  await page.getByRole("button", { name: "Untrusted response" }).click();
  check((await alert.textContent())!.includes("Text <img src=x onerror=alert(1)> remains text"), "Server message is rendered as literal text");
  check(await alert.locator("img").count() === 0, "Message cannot inject a DOM element");
  check(await alert.getByRole("button").count() === 0, "Unknown field does not invent a navigation destination");
  await page.getByRole("button", { name: "Clear error" }).click();
  check(await page.getByRole("alert").count() === 0, "Cleared feedback is removed");
  check((await state()).draft === "Preserve this edited draft: 5–1", "Error replacement and clearing preserve the synthetic draft");
  check(pageErrors.length === 0, `No browser errors: ${pageErrors.join(", ")}`);
  check(unexpectedRequests.length === 0, "No external network requests or media substitutions");
  console.log(`Report feedback component: ${checks} assertions passed (375px, installed headless browser, synthetic draft/navigation; no full-page, persistence, or visual-quality claim).`);
} finally {
  await browser?.close();
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const relative = path.relative(outputRoot, output);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(output).startsWith("report-errors-"), "Cleanup must remain within this harness's owned output directory");
  await rm(output, { recursive: true, force: true });
}
