/**
 * Saved rosters and saved recruiting classes routes.
 * Includes share-link creation/listing/revocation and the public import-by-token endpoints.
 */

import type { Express } from "express";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { requireAuth } from "../route-helpers";
import { validateAndNormalizeRecruitingClass, ClassValidationError } from "../lib/validateRecruitingClass";
import { buildClassEnvelope, extractRecruits, extractSummary, computeSummary, detectSource } from "../lib/buildClassEnvelope";
import { migrateClassToVersion } from "../lib/migrateClassToVersion";

export function registerSavedRoutes(app: Express): void {
  // ── Saved Rosters ──────────────────────────────────────────────────────────

  app.get("/api/saved-rosters", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rosters = await storage.getSavedRostersByUser(userId);
      res.json(rosters);
    } catch (error) {
      console.error("Failed to get saved rosters:", error);
      res.status(500).json({ message: "Failed to get saved rosters" });
    }
  });

  app.get("/api/saved-rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getSavedRoster(req.params.id as string);
      if (!roster) return res.status(404).json({ message: "Roster not found" });
      if (roster.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      res.json(roster);
    } catch (error) {
      console.error("Failed to get saved roster:", error);
      res.status(500).json({ message: "Failed to get saved roster" });
    }
  });

  app.post("/api/saved-rosters", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { name, description, basedOn, rosterData } = req.body;
      if (!name || !rosterData) return res.status(400).json({ message: "Name and roster data required" });
      const roster = await storage.createSavedRoster({ userId, name, description, basedOn: basedOn || "NCAA 2026", rosterData });
      res.json(roster);
    } catch (error) {
      console.error("Failed to create saved roster:", error);
      res.status(500).json({ message: "Failed to create saved roster" });
    }
  });

  app.patch("/api/saved-rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getSavedRoster(req.params.id as string);
      if (!roster) return res.status(404).json({ message: "Roster not found" });
      if (roster.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      const updated = await storage.updateSavedRoster(req.params.id as string, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update saved roster:", error);
      res.status(500).json({ message: "Failed to update saved roster" });
    }
  });

  app.delete("/api/saved-rosters/:id", requireAuth, async (req, res) => {
    try {
      const roster = await storage.getSavedRoster(req.params.id as string);
      if (!roster) return res.status(404).json({ message: "Roster not found" });
      if (roster.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      await storage.deleteSavedRoster(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete saved roster:", error);
      res.status(500).json({ message: "Failed to delete saved roster" });
    }
  });

  // ── Saved Recruiting Classes ───────────────────────────────────────────────

  app.get("/api/saved-recruiting-classes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const classes = await storage.getSavedRecruitingClassesByUser(userId);
      res.json(classes);
    } catch (error) {
      console.error("Failed to get saved recruiting classes:", error);
      res.status(500).json({ message: "Failed to get saved recruiting classes" });
    }
  });

  app.get("/api/saved-recruiting-classes/:id", requireAuth, async (req, res) => {
    try {
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      res.json(rc);
    } catch (error) {
      console.error("Failed to get saved recruiting class:", error);
      res.status(500).json({ message: "Failed to get saved recruiting class" });
    }
  });

  app.post("/api/saved-recruiting-classes", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { name, description, classData } = req.body;
      if (!name || !classData) return res.status(400).json({ message: "Name and class data required" });

      // Detect source / theme from the inbound shape before validation strips context
      const { source, theme, config } = detectSource(classData);

      let validated;
      try {
        validated = validateAndNormalizeRecruitingClass(classData);
      } catch (e) {
        if (e instanceof ClassValidationError) return res.status(400).json({ message: e.message });
        throw e;
      }
      if (validated.warnings.length > 0) {
        console.warn(`[save-class] ${validated.warnings.length} warning(s):`, validated.warnings);
      }

      const envelope = buildClassEnvelope(validated.recruits, source, { theme, config });

      const rc = await storage.createSavedRecruitingClass({
        userId, name, description,
        recruitCount: validated.recruitCount,
        classData: envelope as any,
      });
      res.json(rc);
    } catch (error) {
      console.error("Failed to create saved recruiting class:", error);
      res.status(500).json({ message: "Failed to create saved recruiting class" });
    }
  });

  app.patch("/api/saved-recruiting-classes/:id", requireAuth, async (req, res) => {
    try {
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });

      // Strict allowlist — reject attempts to mutate identity/provenance fields
      const ALLOWED = new Set(["name", "description", "classData"]);
      const rejected = Object.keys(req.body ?? {}).filter(k => !ALLOWED.has(k));
      if (rejected.length > 0) {
        return res.status(400).json({
          message: `Fields not permitted in class update: ${rejected.join(", ")}`,
        });
      }

      const patchBody: Record<string, unknown> = {};

      if ("name" in req.body) {
        if (typeof req.body.name !== "string" || !req.body.name.trim()) {
          return res.status(400).json({ message: "name must be a non-empty string" });
        }
        patchBody.name = req.body.name.trim();
      }
      if ("description" in req.body) {
        patchBody.description = req.body.description ?? null;
      }
      if ("classData" in req.body) {
        const { source, theme, config } = detectSource(req.body.classData);
        try {
          const validated = validateAndNormalizeRecruitingClass(req.body.classData);
          patchBody.classData = buildClassEnvelope(validated.recruits, source, { theme, config });
          patchBody.recruitCount = validated.recruitCount;
        } catch (e) {
          if (e instanceof ClassValidationError) return res.status(400).json({ message: e.message });
          throw e;
        }
      }

      const updated = await storage.updateSavedRecruitingClass(req.params.id as string, patchBody);
      res.json(updated);
    } catch (error) {
      console.error("Failed to update saved recruiting class:", error);
      res.status(500).json({ message: "Failed to update saved recruiting class" });
    }
  });

  app.delete("/api/saved-recruiting-classes/:id", requireAuth, async (req, res) => {
    try {
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== req.session.userId) return res.status(403).json({ message: "Not authorized" });
      await storage.deleteSavedRecruitingClass(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete saved recruiting class:", error);
      res.status(500).json({ message: "Failed to delete saved recruiting class" });
    }
  });

  // ── Share Links ────────────────────────────────────────────────────────────

  // V1 share creation is deprecated — new shares must use the hardened V2 path:
  // POST /api/class-projects/:projectId/shares (128-bit token, SHA-256 stored).
  app.post("/api/saved-recruiting-classes/:id/shares", requireAuth, async (req, res) => {
    return res.status(410).json({
      message: "Legacy share creation is disabled. Use the share dialog to generate a secure link.",
    });
  });

  app.get("/api/saved-recruiting-classes/:id/shares", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rc = await storage.getSavedRecruitingClass(req.params.id as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== userId) return res.status(403).json({ message: "Not authorized" });
      const shares = await storage.getClassSharesByClassId(rc.id, userId);
      res.json(shares);
    } catch (error) {
      console.error("Failed to list class shares:", error);
      res.status(500).json({ message: "Failed to list share links" });
    }
  });

  app.delete("/api/saved-recruiting-classes/:classId/shares/:shareId", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const rc = await storage.getSavedRecruitingClass(req.params.classId as string);
      if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
      if (rc.userId !== userId) return res.status(403).json({ message: "Not authorized" });
      await storage.revokeClassShare(req.params.shareId as string, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to revoke class share:", error);
      res.status(500).json({ message: "Failed to revoke share link" });
    }
  });

  // ── Import-Class (public preview + authenticated import) ──────────────────

  app.get("/api/import-class/:token", async (req, res) => {
    try {
      const share = await storage.getClassShareByToken(req.params.token as string);
      if (!share || share.status !== "active") {
        return res.status(404).json({ message: "Share link not found or has been revoked" });
      }

      let creatorDisplay: string | null = null;
      try {
        const creator = await storage.getUser(share.userId);
        if (creator?.email) {
          const [local] = creator.email.split("@");
          creatorDisplay = local.length <= 3 ? `${local[0]}***` : `${local.slice(0, 3)}***`;
        }
      } catch {}

      // When versionId is set, use the immutable version snapshot (preferred).
      // When versionId is null, auto-trigger V1→V2 lazy migration (idempotent),
      // repoint the share, then serve from the newly created immutable version.
      let classData: unknown;
      let resolvedVersionId = share.versionId ?? null;
      if (resolvedVersionId) {
        const version = await storage.getRecruitingClassVersion(resolvedVersionId);
        if (!version) return res.status(404).json({ message: "Recruiting class not found" });
        classData = version.packageJson;
      } else {
        if (!share.classId) {
          console.warn(`[import-class-preview] share ${share.id} has neither versionId nor classId`);
          return res.status(404).json({ message: "Recruiting class not found" });
        }
        const rc = await storage.getSavedRecruitingClass(share.classId);
        if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
        classData = rc.classData as unknown;

        // Lazy V1 → V2 migration: pin this share to an immutable version snapshot
        try {
          const { version: migratedVersion } = await migrateClassToVersion(rc.id);
          if (migratedVersion) {
            resolvedVersionId = migratedVersion.id;
            await storage.updateClassShareVersionId(share.id, migratedVersion.id);
            classData = migratedVersion.packageJson;
          }
        } catch (e) {
          console.warn(`[import-class-preview] V1 migration failed for share ${share.id}, serving live data:`, e);
        }
      }

      // Extract recruits from any stored format (legacy array, legacy object, versioned envelope)
      const recruits = extractRecruits(classData);

      // Use stored summary if available (versioned format), otherwise compute on the fly
      const storedSummary = extractSummary(classData);
      const summary = storedSummary ?? computeSummary(recruits);
      const theme = summary.theme;

      // For name/description: try the project (when versionId is set) or fall back to the
      // class record metadata embedded in the envelope.
      let className: string | null = null;
      let description: string | null = null;
      if (share.versionId) {
        try {
          const version = await storage.getRecruitingClassVersion(share.versionId);
          if (version) {
            const proj = await storage.getRecruitingClassProject(version.projectId);
            className = proj?.name ?? null;
            description = proj?.description ?? null;
          }
        } catch { /* non-critical */ }
      } else if (share.classId) {
        const rcMeta = await storage.getSavedRecruitingClass(share.classId);
        className = rcMeta?.name ?? null;
        description = rcMeta?.description ?? null;
      }

      // Spoiler-free preview: only expose star rating, position, and state.
      // OVR, gem/bust flags, and generational indicators are intentionally
      // excluded so sharing does not defeat the fog-of-war and scouting systems.
      const previewRecruits = recruits.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        position: r.position,
        homeState: (r as Record<string, unknown>).homeState ?? null,
        starRating: r.starRating,
        recruitType: r.recruitType,
      }));

      // Strip spoiler metrics from the summary: only expose structural
      // aggregates (count, star dist, position dist, region dist, theme) so the
      // preview cannot reveal hidden OVR or gem/bust/generational composition.
      const publicSummary = {
        recruitCount: summary.recruitCount,
        starDist: summary.starDist,
        posDist: summary.posDist,
        regionDist: summary.regionDist ?? {},
        theme: summary.theme,
      };

      res.json({
        shareId: share.id,
        token: share.token,
        label: share.label,
        importCount: share.importCount,
        createdAt: share.createdAt,
        creatorDisplay,
        className,
        description,
        recruitCount: summary.recruitCount,
        theme,
        summary: publicSummary,
        recruits: previewRecruits,
      });
    } catch (error) {
      console.error("Failed to fetch import-class preview:", error);
      res.status(500).json({ message: "Failed to load recruiting class" });
    }
  });

  app.post("/api/import-class/:token", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const share = await storage.getClassShareByToken(req.params.token as string);
      if (!share || share.status !== "active") {
        return res.status(404).json({ message: "Share link not found or has been revoked" });
      }
      if (share.userId === userId) {
        return res.status(400).json({ message: "This class is already in your library" });
      }

      // Resolve the immutable source data — use version snapshot when available.
      // When versionId is null, auto-trigger V1→V2 lazy migration so this import
      // is pinned to an immutable snapshot going forward.
      let sourceData: unknown;
      let importName: string = "Recruiting Class";
      let importDescription: string | null = null;
      let resolvedVersionId = share.versionId ?? null;
      let importedIsSealed = false;
      let importedSourceContentHash: string | undefined;

      if (resolvedVersionId) {
        const version = await storage.getRecruitingClassVersion(resolvedVersionId);
        if (!version) return res.status(404).json({ message: "Recruiting class not found" });
        sourceData = version.packageJson;
        importedIsSealed = version.isSealed;
        importedSourceContentHash = version.contentHash ?? undefined;
        try {
          const proj = await storage.getRecruitingClassProject(version.projectId);
          if (proj?.name) importName = proj.name;
          importDescription = proj?.description ?? null;
        } catch { /* non-critical */ }
      } else {
        if (!share.classId) {
          console.warn(`[import-class] share ${share.id} has neither versionId nor classId`);
          return res.status(404).json({ message: "Recruiting class not found" });
        }
        const rc = await storage.getSavedRecruitingClass(share.classId);
        if (!rc) return res.status(404).json({ message: "Recruiting class not found" });
        sourceData = rc.classData as unknown;
        importName = rc.name;
        importDescription = rc.description ?? null;

        // Lazy V1 → V2 migration: pin this share to an immutable version snapshot
        try {
          const { version: migratedVersion } = await migrateClassToVersion(rc.id);
          if (migratedVersion) {
            resolvedVersionId = migratedVersion.id;
            await storage.updateClassShareVersionId(share.id, migratedVersion.id);
            sourceData = migratedVersion.packageJson;
            importedIsSealed = migratedVersion.isSealed;
            importedSourceContentHash = migratedVersion.contentHash ?? undefined;
          }
        } catch (e) {
          console.warn(`[import-class] V1 migration failed for share ${share.id}, importing from live data:`, e);
        }
      }

      // Detect theme from source data before validation
      const storedSummary = extractSummary(sourceData);
      const sourceTheme = storedSummary?.theme ?? null;
      const sourceConfig = (sourceData as any)?.config ?? undefined;

      let validated;
      try {
        validated = validateAndNormalizeRecruitingClass(sourceData);
      } catch (e) {
        if (e instanceof ClassValidationError) {
          return res.status(400).json({ message: `Source class is malformed: ${e.message}` });
        }
        throw e;
      }

      // Store full data (no stripping); isSealed flag drives runtime fog-of-war.
      const envelope = buildClassEnvelope(validated.recruits, "import", { theme: sourceTheme, config: sourceConfig });

      const imported = await storage.createSavedRecruitingClass({
        userId,
        name: importName,
        description: importDescription ?? undefined,
        recruitCount: validated.recruitCount,
        classData: envelope as any,
        isSealed: importedIsSealed,
        sourceVersionId: resolvedVersionId ?? undefined,
        sourceContentHash: importedSourceContentHash,
      });
      await storage.incrementClassShareImportCount(share.id);
      res.json({ success: true, class: imported });
    } catch (error) {
      console.error("Failed to import recruiting class:", error);
      res.status(500).json({ message: "Failed to import recruiting class" });
    }
  });

}
