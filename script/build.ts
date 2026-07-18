import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import path from "node:path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  // connect-pg-simple reads table.sql from its own package dir at runtime;
  // bundling it breaks that path resolution. Keep it external so node_modules
  // is used and the file is always found.
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("validating rosters...");
  await import("./validate-rosters");

  console.log("validating recruiting classes...");
  await import("./validate-recruits");

  console.log("building client...");
  // Loading the config through Vite's module runner avoids writing a bundled
  // temporary config and is reliable in restricted/containerized build hosts.
  await viteBuild({ configLoader: "runner" });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    absWorkingDir: process.cwd(),
    entryPoints: ["./server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve("dist/index.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
