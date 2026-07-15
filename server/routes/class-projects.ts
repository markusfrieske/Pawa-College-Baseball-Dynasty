/**
 * Versioned recruiting class library routes (Task 1364).
 *
 * Endpoints:
 *   GET  /api/class-projects                       — list user's projects
 *   POST /api/class-projects                       — create project
 *   GET  /api/class-projects/:projectId            — get project + versions
 *   PATCH /api/class-projects/:projectId/draft     — update draft (strict allowlist)
 *   POST /api/class-projects/:projectId/publish    — publish immutable version
 *   POST /api/class-projects/:projectId/shares     — create hardened share
 *   GET  /api/class-projects/:projectId/shares     — list shares
 *   DELETE /api/class-projects/:projectId/shares/:shareId — revoke share
 *   POST /api/class-projects/from-saved/:classId  — V1 lazy migration
 *   GET  /api/class-share/:token/preview           — public spoiler-free preview (rate-limited)
 *   POST /api/class-share/:token/import            — authenticated import
 */

import type { Express } from "express";
import { randomBytes, createHash } from "crypto";
import { storage } from "../storage";
import { requireAuth } from "../route-helpers";
import {
  validateAndNormalizeRecruitingClass,
  ClassValidationError,
} from "../lib/validateRecruitingClass";
import {
  buildClassEnvelope,
  extractRecruits,
  extractSummary,
  computeSummary,
  detectSource,
} from "../lib/buildClassEnvelope";

// ── Token helpers ──────────────────────────────────────────────────────────────

function generateToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(16).toString("hex"); // 128 bits → 32 hex chars
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

// Stable canonical serialization — keys are sorted recursively so the hash is
// independent of insertion order.  Must be identical to any future client-side
// content verification tool.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const sorted = Object.keys(value as object).sort();
  const pairs = sorted.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${pairs.join(",")}}`;
}

function contentHash(packageJson: unknown): string {
  return createHash("sha256").update(stableStringify(packageJson)).digest("hex");
}

// ── Sealed-mode sanitization ────────────────────────────────────────────────
// When a sealed class is imported, hidden fields are stripped before writing to
// the recipient's saved_recruiting_classes row.  The full truth never leaves the
// server, so recipients cannot recover hidden attributes from stored JSON.

const SEALED_STRIP = new Set([
  "overall",
  "isBlueChip",
  "isGem",
  "isBust",
  "isGenerationalGem",
  "isGenerationalBust",
  "potential",
  "potentialFloor",
  "potentialCeiling",
  "hitForAvg",
  "power",
  "speed",
  "arm",
  "fielding",
  "errorResistance",
  "clutch",
  "vsLHP",
  "grit",
  "stealing",
  "running",
  "throwing",
  "recovery",
  "catcherAbility",
  "velocity",
  "control",
  "stamina",
  "stuff",
  "wRISP",
  "vsLefty",
  "poise",
  "heater",
  "agile",
]);

function sealedSanitize<T>(recruits: T[]): T[] {
  return recruits.map(r => {
    const stripped: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const k of SEALED_STRIP) delete stripped[k];
    return stripped as T;
  });
}

// ── IP rate limiter (max 20 req/min per IP for public endpoints) ───────────────

const _ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxPerMin = 20): boolean {
  const now = Date.now();
  const entry = _ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    _ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMin) return false;
  entry.count++;
  return true;
}

// ── Route registration ─────────────────────────────────────────────────────────

export function registerClassProjectRoutes(app: Express): void {

  // ── Project CRUD ─────────────────────────────────────────────────────────────

  app.get("/api/class-projects", requireAuth, async (req, res) => {
    try {
      const projects = await storage.getRecruitingClassProjectsByUser(req.session.userId!);
      res.json(projects);
    } catch (e) {
      console.error("Failed to list class projects:", e);
      res.status(500).json({ message: "Failed to list class projects" });
    }
  });

  app.post("/api/class-projects", requireAuth, async (req, res) => {
    try {
      const { name, description, classData, sourceClassId } = req.body ?? {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "name is required" });
      }

      let data: unknown = classData ?? null;

      if (!data && sourceClassId) {
        const src = await storage.getSavedRecruitingClass(sourceClassId as string);
        if (!src) return res.status(404).json({ message: "Source class not found" });
        if (src.userId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });
        data = src.classData;
      }

      const project = await storage.createRecruitingClassProject({
        ownerUserId: req.session.userId!,
        name: name.trim(),
        description: description ?? null,
        classData: data as any,
        sourceClassId: sourceClassId ?? null,
        status: "draft",
        currentDraftRevision: 0,
      });
      res.json(project);
    } catch (e) {
      console.error("Failed to create class project:", e);
      res.status(500).json({ message: "Failed to create class project" });
    }
  });

  app.get("/api/class-projects/:projectId", requireAuth, async (req, res) => {
    try {
      const project = await storage.getRecruitingClassProject(req.params.projectId as string);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.ownerUserId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });
      const versions = await storage.getRecruitingClassVersionsByProject(project.id);
      res.json({ ...project, versions });
    } catch (e) {
      console.error("Failed to get class project:", e);
      res.status(500).json({ message: "Failed to get class project" });
    }
  });

  // PATCH draft — strict allowlist: only name, description, and classData
  app.patch("/api/class-projects/:projectId/draft", requireAuth, async (req, res) => {
    try {
      const project = await storage.getRecruitingClassProject(req.params.projectId as string);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.ownerUserId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });

      const ALLOWED = new Set(["name", "description", "classData"]);
      const rejected = Object.keys(req.body ?? {}).filter(k => !ALLOWED.has(k));
      if (rejected.length > 0) {
        return res.status(400).json({
          message: `Fields not permitted in draft update: ${rejected.join(", ")}`,
        });
      }

      const patch: Record<string, unknown> = {};

      if ("name" in req.body) {
        if (typeof req.body.name !== "string" || !req.body.name.trim()) {
          return res.status(400).json({ message: "name must be a non-empty string" });
        }
        patch.name = req.body.name.trim();
      }
      if ("description" in req.body) {
        patch.description = req.body.description ?? null;
      }
      if ("classData" in req.body) {
        let validated;
        try {
          validated = validateAndNormalizeRecruitingClass(req.body.classData);
        } catch (e) {
          if (e instanceof ClassValidationError) return res.status(400).json({ message: e.message });
          throw e;
        }
        const { source, theme, config } = detectSource(req.body.classData);
        patch.classData = buildClassEnvelope(validated.recruits, source, { theme, config });
        patch.currentDraftRevision = (project.currentDraftRevision ?? 0) + 1;
      }

      const updated = await storage.updateRecruitingClassProject(project.id, patch);
      res.json(updated);
    } catch (e) {
      console.error("Failed to patch class project draft:", e);
      res.status(500).json({ message: "Failed to update draft" });
    }
  });

  // Publish — snapshot the current draft into an immutable version
  app.post("/api/class-projects/:projectId/publish", requireAuth, async (req, res) => {
    try {
      const project = await storage.getRecruitingClassProject(req.params.projectId as string);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.ownerUserId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });
      if (!project.classData) {
        return res.status(400).json({ message: "Project has no class data to publish" });
      }

      const isSealed = req.body?.isSealed === true;

      // Validate the draft before snapshotting
      let validated;
      try {
        validated = validateAndNormalizeRecruitingClass(project.classData as unknown);
      } catch (e) {
        if (e instanceof ClassValidationError) {
          return res.status(400).json({ message: `Draft validation failed: ${e.message}` });
        }
        throw e;
      }

      const { source, theme, config } = detectSource(project.classData as unknown);
      const packageJson = buildClassEnvelope(validated.recruits, source, { theme, config });
      const hash = contentHash(packageJson);

      const existing = await storage.getRecruitingClassVersionsByProject(project.id);
      const versionNumber = existing.length + 1;

      const sourceType =
        source === "wizard" ? "procedural" :
        source === "import" ? "manual" :
        "manual";

      const version = await storage.createRecruitingClassVersion({
        projectId: project.id,
        versionNumber,
        schemaVersion: 1,
        packageJson: packageJson as any,
        contentHash: hash,
        sourceType,
        isSealed,
      });

      await storage.updateRecruitingClassProject(project.id, { status: "has_published" });

      res.json(version);
    } catch (e) {
      console.error("Failed to publish class version:", e);
      res.status(500).json({ message: "Failed to publish version" });
    }
  });

  // ── Share management ──────────────────────────────────────────────────────────

  // Create a hardened share link for a version (must publish first)
  app.post("/api/class-projects/:projectId/shares", requireAuth, async (req, res) => {
    try {
      const project = await storage.getRecruitingClassProject(req.params.projectId as string);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.ownerUserId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });

      // Resolve target version
      let versionId: string = req.body?.versionId ?? "";
      if (!versionId) {
        const versions = await storage.getRecruitingClassVersionsByProject(project.id);
        if (versions.length === 0) {
          return res.status(400).json({ message: "Publish a version before creating a share link" });
        }
        versionId = versions[versions.length - 1].id;
      }

      const version = await storage.getRecruitingClassVersion(versionId);
      if (!version || version.projectId !== project.id) {
        return res.status(404).json({ message: "Version not found" });
      }

      // Generate a 128-bit token; only the SHA-256 hash is stored
      const { plaintext, hash } = generateToken();

      const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt as string) : undefined;
      const maxImports = req.body?.maxImports ? parseInt(String(req.body.maxImports), 10) || undefined : undefined;

      const share = await storage.createHardenedClassShare({
        classId: project.sourceClassId ?? undefined,
        userId: req.session.userId!,
        tokenHash: hash,
        versionId,
        label: req.body?.label ?? null,
        expiresAt,
        maxImports,
      });

      // Return the plaintext token ONCE — it is never retrievable again
      res.json({ ...share, plaintextToken: plaintext });
    } catch (e) {
      console.error("Failed to create class share link:", e);
      res.status(500).json({ message: "Failed to create share link" });
    }
  });

  // List shares for a project
  app.get("/api/class-projects/:projectId/shares", requireAuth, async (req, res) => {
    try {
      const project = await storage.getRecruitingClassProject(req.params.projectId as string);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.ownerUserId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });
      const shares = await storage.getClassSharesByVersionProject(project.id);
      res.json(shares);
    } catch (e) {
      console.error("Failed to list class shares:", e);
      res.status(500).json({ message: "Failed to list share links" });
    }
  });

  // Revoke a share
  app.delete("/api/class-projects/:projectId/shares/:shareId", requireAuth, async (req, res) => {
    try {
      const project = await storage.getRecruitingClassProject(req.params.projectId as string);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (project.ownerUserId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });
      await storage.revokeClassShare(req.params.shareId as string, req.session.userId!);
      res.json({ success: true });
    } catch (e) {
      console.error("Failed to revoke class share:", e);
      res.status(500).json({ message: "Failed to revoke share link" });
    }
  });

  // ── V1 lazy migration ─────────────────────────────────────────────────────────
  // Promotes a saved_recruiting_class row into a project + v1 version on demand.
  // Idempotent — calling again returns the already-migrated project.

  app.post("/api/class-projects/from-saved/:classId", requireAuth, async (req, res) => {
    try {
      const rc = await storage.getSavedRecruitingClass(req.params.classId as string);
      if (!rc) return res.status(404).json({ message: "Class not found" });
      if (rc.userId !== req.session.userId!) return res.status(403).json({ message: "Not authorized" });

      // Idempotency: return existing project if already migrated
      const existing = await storage.getRecruitingClassProjectBySourceClass(rc.id);
      if (existing) {
        const versions = await storage.getRecruitingClassVersionsByProject(existing.id);
        return res.json({ project: existing, versions });
      }

      // Normalize class data into a versioned envelope
      let packageJson: unknown;
      try {
        const validated = validateAndNormalizeRecruitingClass(rc.classData as unknown);
        const { source, theme, config } = detectSource(rc.classData as unknown);
        packageJson = buildClassEnvelope(validated.recruits, source, { theme, config });
      } catch {
        // If validation fails, store raw (best-effort)
        packageJson = rc.classData;
      }

      const hash = contentHash(packageJson);

      // Create project
      const project = await storage.createRecruitingClassProject({
        ownerUserId: rc.userId,
        name: rc.name,
        description: rc.description ?? null,
        classData: rc.classData as any,
        sourceClassId: rc.id,
        status: "has_published",
        currentDraftRevision: 0,
      });

      // Create the immutable v1 version (legacy source type, open mode by default)
      const version = await storage.createRecruitingClassVersion({
        projectId: project.id,
        versionNumber: 1,
        schemaVersion: 1,
        packageJson: packageJson as any,
        contentHash: hash,
        sourceType: "legacy",
        isSealed: false,
      });

      // Point any existing V1 shares for this class at the new version
      await storage.migrateClassSharesToVersion(rc.id, version.id);

      res.json({ project, versions: [version] });
    } catch (e) {
      console.error("Failed to migrate class to project:", e);
      res.status(500).json({ message: "Failed to migrate class" });
    }
  });

  // ── Public: spoiler-free preview ──────────────────────────────────────────────

  app.get("/api/class-share/:token/preview", async (req, res) => {
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";

    if (!checkRateLimit(ip, 20)) {
      return res.status(429).json({ message: "Too many requests. Please wait a minute and try again." });
    }

    try {
      const tokenHash = hashToken(req.params.token as string);
      const share = await storage.getClassShareByTokenHash(tokenHash);

      if (!share || share.status !== "active") {
        return res.status(404).json({ message: "Share link not found or has been revoked" });
      }
      if (share.expiresAt && new Date() > share.expiresAt) {
        return res.status(410).json({ message: "Share link has expired" });
      }
      if (share.maxImports != null && share.importCount >= share.maxImports) {
        return res.status(410).json({ message: "Share link has reached its import limit" });
      }
      if (!share.versionId) {
        return res.status(404).json({ message: "Share link has no associated version" });
      }

      const version = await storage.getRecruitingClassVersion(share.versionId);
      if (!version) return res.status(404).json({ message: "Version not found" });

      const project = await storage.getRecruitingClassProject(version.projectId);

      let creatorDisplay: string | null = null;
      try {
        const creator = await storage.getUser(share.userId);
        if (creator?.email) {
          const [local] = creator.email.split("@");
          creatorDisplay = local.length <= 3 ? `${local[0]}***` : `${local.slice(0, 3)}***`;
        }
      } catch { /* non-critical */ }

      const packageJson = version.packageJson;
      const recruits = extractRecruits(packageJson);
      const storedSummary = extractSummary(packageJson);
      const summary = storedSummary ?? computeSummary(recruits);

      // Spoiler-free: return aggregate metadata only — no per-recruit rows.
      // Per-recruit data (names, positions, stars) would reveal class composition
      // before the coach has earned the right to see it.
      const publicSummary = {
        recruitCount: summary.recruitCount,
        starDist: summary.starDist,
        posDist: summary.posDist,
        regionDist: summary.regionDist ?? {},
        theme: summary.theme,
      };

      res.json({
        shareId: share.id,
        versionNumber: version.versionNumber,
        sourceType: version.sourceType,
        isSealed: version.isSealed,
        contentHash: version.contentHash,
        schemaVersion: version.schemaVersion,
        label: share.label,
        importCount: share.importCount,
        maxImports: share.maxImports ?? null,
        expiresAt: share.expiresAt ?? null,
        createdAt: share.createdAt,
        creatorDisplay,
        className: project?.name ?? null,
        description: project?.description ?? null,
        recruitCount: summary.recruitCount,
        theme: summary.theme,
        summary: publicSummary,
      });
    } catch (e) {
      console.error("Failed to fetch class share preview:", e);
      res.status(500).json({ message: "Failed to load class preview" });
    }
  });

  // ── Authenticated import from hardened share ───────────────────────────────────

  app.post("/api/class-share/:token/import", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const tokenHash = hashToken(req.params.token as string);
      const share = await storage.getClassShareByTokenHash(tokenHash);

      if (!share || share.status !== "active") {
        return res.status(404).json({ message: "Share link not found or has been revoked" });
      }
      if (share.expiresAt && new Date() > share.expiresAt) {
        return res.status(410).json({ message: "Share link has expired" });
      }
      if (share.maxImports != null && share.importCount >= share.maxImports) {
        return res.status(410).json({ message: "Share link has reached its import limit" });
      }
      if (share.userId === userId) {
        return res.status(400).json({ message: "You cannot import your own class" });
      }
      if (!share.versionId) {
        return res.status(400).json({ message: "Share link has no associated version" });
      }

      const version = await storage.getRecruitingClassVersion(share.versionId);
      if (!version) return res.status(404).json({ message: "Version not found" });

      const project = await storage.getRecruitingClassProject(version.projectId);

      const packageJson = version.packageJson;
      const storedSummary = extractSummary(packageJson);
      const sourceTheme = storedSummary?.theme ?? null;
      const sourceConfig = (packageJson as any)?.config ?? undefined;

      // Validate recruits
      let validated;
      try {
        validated = validateAndNormalizeRecruitingClass(packageJson);
      } catch (e) {
        if (e instanceof ClassValidationError) {
          return res.status(400).json({ message: `Source class is malformed: ${e.message}` });
        }
        throw e;
      }

      // For sealed classes, strip all hidden fields before persisting so the
      // recipient can never recover truth values from their stored JSON.
      // For open classes, store the full package as-is.
      const recruitsToStore = version.isSealed
        ? sealedSanitize(validated.recruits)
        : validated.recruits;

      const envelope = buildClassEnvelope(recruitsToStore, "import", {
        theme: sourceTheme,
        config: sourceConfig,
      });

      const imported = await storage.createSavedRecruitingClass({
        userId,
        name: project?.name ?? "Imported Class",
        description: project?.description ?? undefined,
        recruitCount: validated.recruitCount,
        classData: envelope as any,
        // Lineage: pin to the immutable source version
        isSealed: version.isSealed,
        sourceVersionId: version.id,
        sourceContentHash: version.contentHash ?? undefined,
      });

      await storage.incrementClassShareImportCount(share.id);

      res.json({ success: true, class: imported });
    } catch (e) {
      console.error("Failed to import class from share:", e);
      res.status(500).json({ message: "Failed to import class" });
    }
  });
}
