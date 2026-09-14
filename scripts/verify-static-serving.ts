/** Real HTTP static/SPA boundary check using only owned synthetic files. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import express from "express";
import { serveStatic } from "../server/static";
import { publicErrorHandler } from "../server/lib/httpErrors";

const temporaryRoot = path.resolve(tmpdir());
const fixture = await mkdtemp(path.join(temporaryRoot, "pawa-static-test-"));
const html = "<!doctype html><title>Synthetic static fixture</title>";
const bytes = Buffer.from([0, 1, 2, 127, 128, 255]);
const app = express();
const server = createServer(app);
let checks = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

try {
  await mkdir(path.join(fixture, "assets"));
  await writeFile(path.join(fixture, "index.html"), html);
  await writeFile(path.join(fixture, "assets", "sample.png"), bytes);
  // Server-owned namespaces must not accidentally expose similarly named files.
  await mkdir(path.join(fixture, "api"));
  await writeFile(path.join(fixture, "api", "missing"), "synthetic reserved file");
  app.get("/api/known", (_req, res) => res.json({ actualRoute: true }));
  serveStatic(app, fixture);
  app.use(publicErrorHandler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const request = (url: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}${url}`, init);

  equal(await (await request("/api/known")).json(), { actualRoute: true }, "Existing server route preserved");
  for (const route of ["/", "/dashboard", "/league/synthetic/roster", "/invite/synthetic?next=roster.png"]) {
    const response = await request(route, { headers: { Accept: "text/html" } });
    equal(response.status, 200, `SPA GET ${route}`);
    equal(await response.text(), html, `SPA document ${route}`);
  }
  const headPage = await request("/league/synthetic/schedule", { method: "HEAD" });
  equal(headPage.status, 200, "SPA HEAD status");
  equal(await headPage.text(), "", "SPA HEAD has no body");
  const asset = await request("/assets/sample.png");
  equal(asset.status, 200, "Asset status");
  equal(asset.headers.get("content-type"), "image/png", "Asset content type");
  equal(Buffer.from(await asset.arrayBuffer()), bytes, "Exact binary bytes preserved");
  const headAsset = await request("/assets/sample.png", { method: "HEAD" });
  equal(headAsset.status, 200, "Asset HEAD status");
  equal(headAsset.headers.get("content-length"), String(bytes.length), "Asset HEAD byte length");
  equal(await headAsset.text(), "", "Asset HEAD has no body");

  for (const route of ["/assets/missing.js", "/images/missing.png", "/fonts/missing.woff2", "/music/missing.mp3", "/favicon.ico", "/missing.css", "/assets/extensionless", "/screenshots/extensionless", "/api", "/api/missing", "/API/missing", "/%61pi/missing", "/%2fapi/missing", "/api%5cmissing", "/unmatched%2f..%2fapi/missing", "/objects", "/objects/missing"]) {
    const response = await request(route, { headers: { Accept: "text/html" } });
    equal(response.status, 404, `Missing resource status ${route}`);
    equal(await response.json(), { message: "Not found" }, `Missing resource JSON ${route}`);
    equal(response.headers.get("cache-control"), "no-store", `Missing resource not cached ${route}`);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await request("/dashboard", { method });
    equal(response.status, 404, `${method} cannot use SPA fallback`);
    equal(await response.json(), { message: "Not found" }, `${method} error contract`);
  }
  equal((await request("/assets/sample.png", { method: "POST" })).status, 404, "POST cannot retrieve real static asset");
  equal((await request("/missing", { headers: { Accept: "application/json" } })).status, 404, "Explicit JSON request cannot use SPA fallback");
  const missingHead = await request("/assets/missing.js", { method: "HEAD" });
  equal(missingHead.status, 404, "Missing asset HEAD status");
  equal(await missingHead.text(), "", "Missing asset HEAD empty body");
  const malformed = await request("/invalid%ZZ");
  equal(malformed.status, 400, "Malformed URL rejected");
  equal(await malformed.json(), { message: "Invalid request" }, "Malformed URL public error");
  await rename(path.join(fixture, "index.html"), path.join(fixture, "index.saved.html"));
  const missingIndex = await request("/dashboard");
  equal(missingIndex.status, 404, "Missing index status");
  equal(await missingIndex.json(), { message: "Not found" }, "Filesystem details sanitized by real error handler");
  console.log(`[static-test] PASS ${checks} assertions; synthetic files and real HTTP server`);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => {
    if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
    else resolve();
  }));
  // Recursive cleanup is restricted to this exact newly allocated fixture.
  assert.equal(path.dirname(path.resolve(fixture)), temporaryRoot);
  assert(path.basename(fixture).startsWith("pawa-static-test-"));
  await rm(fixture, { recursive: true, force: true });
}
