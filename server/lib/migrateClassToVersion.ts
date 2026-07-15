/**
 * migrateClassToVersion — Lazy V1 → V2 migration helper.
 *
 * Promotes a saved_recruiting_classes row into a project + immutable v1 version.
 * Idempotent: if the class has already been migrated, returns the existing project
 * and version without creating duplicates.  Also repoints any existing V1 share rows
 * for this class at the new version.
 *
 * Returns { project, version } where version is the immutable v1 snapshot.
 * Throws if the class cannot be found; does NOT throw if the class data fails
 * validation (stores raw best-effort packageJson in that case).
 */

import { createHash } from "crypto";
import { storage } from "../storage";
import {
  validateAndNormalizeRecruitingClass,
} from "./validateRecruitingClass";
import {
  buildClassEnvelope,
  detectSource,
} from "./buildClassEnvelope";
import type {
  RecruitingClassProject,
  RecruitingClassVersion,
} from "../../shared/schema";

// Stable canonical serialization with sorted keys so the hash is reproducible
// regardless of JS object key insertion order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${(value as unknown[]).map(stableStringify).join(",")}]`;
  const sorted = Object.keys(value as object).sort();
  const pairs = sorted.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${pairs.join(",")}}`;
}

function contentHash(packageJson: unknown): string {
  return createHash("sha256").update(stableStringify(packageJson)).digest("hex");
}

export async function migrateClassToVersion(classId: string): Promise<{
  project: RecruitingClassProject;
  version: RecruitingClassVersion;
}> {
  const rc = await storage.getSavedRecruitingClass(classId);
  if (!rc) throw new Error(`saved_recruiting_class ${classId} not found`);

  // Idempotency: return existing project+version if already migrated
  const existing = await storage.getRecruitingClassProjectBySourceClass(rc.id);
  if (existing) {
    const versions = await storage.getRecruitingClassVersionsByProject(existing.id);
    const latest = versions[versions.length - 1];
    if (latest) return { project: existing, version: latest };
  }

  // Normalize class data into a versioned envelope (best-effort)
  let packageJson: unknown;
  try {
    const validated = validateAndNormalizeRecruitingClass(rc.classData as unknown);
    const { source, theme, config } = detectSource(rc.classData as unknown);
    packageJson = buildClassEnvelope(validated.recruits, source, { theme, config });
  } catch {
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

  // Repoint any existing V1 shares for this class at the new version
  await storage.migrateClassSharesToVersion(rc.id, version.id);

  return { project, version };
}
