/** Actual commissioner panel with synthetic phase/draft state; no full-page claim. */
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
const output = path.join(outputRoot, `report-override-${randomUUID()}`);
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
  await build({ absWorkingDir: repo, entryPoints: ["scripts/fixtures/report-override-harness.tsx"], outfile: path.join(output, "fixture.js"), bundle: true, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
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
  const reason = page.getByRole("textbox", { name: "Commissioner reason (required)", exact: true });
  check(await reason.count() === 1, "Textarea has an accessible, explicit required label");
  check(await reason.getAttribute("id") === "report-override-reason", "Stable field ID supports report error navigation");
  check(await reason.getAttribute("required") !== null, "Browser exposes required semantics");
  check(await reason.getAttribute("maxlength") === "2000", "Native input has a 2000-character limit");
  check(await reason.evaluate(element => !(element as HTMLTextAreaElement).checkValidity()), "An empty reason is invalid under native validation");
  check((await reason.getAttribute("aria-describedby"))?.includes("report-override-description"), "Explanation is associated with the field");
  check((await page.locator("#report-override-description").textContent())!.includes("remains pending review"), "Visible explanation distinguishes submission from approval");
  check((await page.locator("#report-override-description").textContent())!.includes("recorded with the report"), "Visible explanation describes reason retention");
  await page.getByRole("textbox", { name: "Score draft" }).fill("Keep score draft: 6–3");
  await page.getByRole("button", { name: "Review commissioner reason", exact: true }).focus();
  await page.keyboard.press("Enter");
  check(await reason.evaluate(element => document.activeElement === element), "Keyboard error-navigation action focuses the textarea");
  await page.keyboard.type("Coach unavailable");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Result supplied by both coaches.");
  const expected = "Coach unavailable\nResult supplied by both coaches.";
  check((await state()).reason === expected, "Keyboard and multiline input update parent-owned state");
  check(await reason.evaluate(element => (element as HTMLTextAreaElement).checkValidity()), "Entered reason satisfies native required validation");
  check((await page.locator("#report-override-count").textContent()) === `${expected.length} / 2000 characters`, "Character count reflects controlled input");
  for (const phase of ["review", "score"]) {
    await page.getByRole("button", { name: "Switch phase", exact: true }).click();
    check((await state()).phase === phase, `Synthetic host switches to ${phase}`);
    check(await reason.inputValue() === expected, `${phase} remount retains commissioner reason`);
    check((await state()).draft === "Keep score draft: 6–3", `${phase} remount retains score draft`);
  }
  await page.getByRole("button", { name: "Toggle commissioner requirement", exact: true }).click();
  check(await reason.count() === 0, "Synthetic host hides panel when a reason is not required");
  await page.getByRole("button", { name: "Toggle commissioner requirement", exact: true }).click();
  check(await reason.inputValue() === expected, "Returning to commissioner mode retains parent-owned reason");
  await reason.fill("x".repeat(2000));
  await reason.press("End");
  await page.keyboard.type("overflow");
  check((await state()).reason.length === 2000, "Native typing cannot exceed the declared character limit");
  check((await page.locator("#report-override-count").textContent()) === "2000 / 2000 characters", "Character count reaches the declared maximum");
  await reason.fill("<img src=x onerror=alert(1)>");
  check((await state()).reason === "<img src=x onerror=alert(1)>", "Reason text remains literal controlled data");
  check(await page.locator("img").count() === 0, "Reason text cannot create HTML elements");
  await reason.fill("");
  check((await state()).reason === "", "Clearing input updates parent-owned draft");
  check(await reason.evaluate(element => !(element as HTMLTextAreaElement).checkValidity()), "Cleared reason again fails native required validation");
  check(pageErrors.length === 0, `No browser errors: ${pageErrors.join(", ")}`);
  check(unexpectedRequests.length === 0, "No external network requests or media substitutions");
  console.log(`Commissioner reason component: ${checks} assertions passed (375px, installed headless browser, synthetic phase/draft state; no full-page, API, persistence, or visual-quality claim).`);
} finally {
  await browser?.close();
  if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const relative = path.relative(outputRoot, output);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(output).startsWith("report-override-"), "Cleanup must remain within this harness's owned output directory");
  await rm(output, { recursive: true, force: true });
}
