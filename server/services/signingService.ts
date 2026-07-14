/**
 * Centralized recruit-to-player and walkon-to-player conversion.
 *
 * Single source of truth for the field-preservation requirements during Signing Day
 * and the Walkons Phase. Every path that creates a roster Player from a Recruit or
 * WalkonPool record must go through these functions to guarantee:
 *   – appearance (skinTone/hairColor/hairStyle/facialHair/eyeStyle/eyebrowStyle/mouthStyle/eyeBlack/headwear)
 *   – trajectory, tools, abilities, pitches, potential (numeric)
 *   – workEthicScore, coachability, playerArchetype (development profile)
 *   – V3 fields: playArchetypeId, developmentCaps, developmentSeed, developmentModelVersion
 */

import type { Recruit, InsertPlayer } from "@shared/schema";
import { walkonPool } from "@shared/schema";
type WalkonPool = typeof walkonPool.$inferSelect;
import { assignArchetype } from "./playerDevelopment/assignArchetype";
import { buildDevelopmentCaps } from "./playerDevelopment/buildCaps";
import { buildDevelopmentSeed } from "@shared/seededRng";

type RecruitLike = Recruit & { pitchSPL?: number; pitchFK?: number; pitchSFF?: number; pitchSHU?: number; pitchCCH?: number; pitchHSL?: number; pitchSWP?: number; pitchKN?: number; pitchSCB?: number; pitchPCB?: number };

/**
 * Convert a signed recruit to an InsertPlayer record, preserving all V3 fields.
 * The returned object is ready for storage.createPlayer().
 */
export function convertRecruitToPlayer(
  recruit: RecruitLike,
  teamId: string,
  leagueId: string,
  modelVersion: 1 | 3 = 1,
): InsertPlayer {
  const jerseyNumber = 1 + Math.floor(Math.random() * 99);
  const finalElig = deriveEligibility(recruit);

  const archetypeId = modelVersion === 3
    ? (assignArchetype(recruit.position, recruit as any) ?? undefined)
    : undefined;

  const caps = (archetypeId && recruit.potential != null && modelVersion === 3)
    ? buildDevelopmentCaps(archetypeId, recruit.potential)
    : {};

  const seed = modelVersion === 3
    ? buildDevelopmentSeed(leagueId, "pre-" + recruit.id, 0, modelVersion)
    : "";

  return {
    teamId,
    firstName: recruit.firstName,
    lastName: recruit.lastName,
    position: recruit.position,
    eligibility: finalElig,
    throwHand: recruit.throwHand || "R",
    batHand: recruit.batHand || "R",
    homeState: recruit.homeState,
    hometown: recruit.hometown,
    jerseyNumber,
    overall: recruit.overall,
    starRating: recruit.starRating,
    // Numeric attributes
    hitForAvg: recruit.hitForAvg || 50,
    power: recruit.power || 50,
    speed: recruit.speed || 50,
    arm: recruit.arm || 50,
    fielding: recruit.fielding || 50,
    errorResistance: recruit.errorResistance || 50,
    clutch: recruit.clutch || 50,
    vsLHP: recruit.vsLHP || 50,
    grit: recruit.grit || 50,
    stealing: recruit.stealing || 50,
    running: recruit.running || 50,
    throwing: recruit.throwing || 50,
    recovery: recruit.recovery || 50,
    catcherAbility: recruit.catcherAbility || 50,
    velocity: recruit.velocity || 50,
    control: recruit.control || 50,
    stamina: recruit.stamina || 50,
    stuff: recruit.stuff || 50,
    wRISP: recruit.wRISP || 50,
    vsLefty: recruit.vsLefty || 50,
    poise: recruit.poise || 50,
    heater: recruit.heater || 50,
    agile: recruit.agile || 50,
    // Pitch levels
    pitchFB: recruit.pitchFB ?? 1,
    pitch2S: recruit.pitch2S ?? 0,
    pitchSL: recruit.pitchSL ?? 0,
    pitchCB: recruit.pitchCB ?? 0,
    pitchCH: recruit.pitchCH ?? 0,
    pitchCT: recruit.pitchCT ?? 0,
    pitchSNK: recruit.pitchSNK ?? 0,
    pitchVSL: recruit.pitchVSL ?? 0,
    pitchSPL: recruit.pitchSPL ?? 0,
    pitchFK: recruit.pitchFK ?? 0,
    pitchSFF: recruit.pitchSFF ?? 0,
    pitchSHU: recruit.pitchSHU ?? 0,
    pitchCCH: recruit.pitchCCH ?? 0,
    pitchHSL: recruit.pitchHSL ?? 0,
    pitchSWP: recruit.pitchSWP ?? 0,
    pitchKN: recruit.pitchKN ?? 0,
    pitchSCB: recruit.pitchSCB ?? 0,
    pitchPCB: recruit.pitchPCB ?? 0,
    // Abilities & traits
    abilities: recruit.abilities || [],
    trajectory: (recruit as any).trajectory ?? 2,
    tools: recruit.tools || [],
    workEthicScore: recruit.workEthicScore ?? 70,
    coachability: recruit.coachability ?? 70,
    // Appearance
    skinTone: recruit.skinTone || "light",
    hairColor: recruit.hairColor || "brown",
    hairStyle: recruit.hairStyle || "short",
    headwear: (recruit as any).headwear || "cap",
    facialHair: (recruit as any).facialHair || "none",
    eyeStyle: (recruit as any).eyeStyle || "standard",
    eyebrowStyle: (recruit as any).eyebrowStyle || "flat",
    mouthStyle: (recruit as any).mouthStyle || "neutral",
    eyeBlack: (recruit as any).eyeBlack || false,
    // Potential (always numeric)
    potential: typeof recruit.potential === "number" ? recruit.potential : null,
    // V3 development fields
    playArchetypeId: archetypeId ?? null,
    developmentCaps: caps,
    developmentSeed: seed,
    developmentModelVersion: modelVersion,
  };
}

/**
 * Convert a signed walk-on to an InsertPlayer record.
 */
export function convertWalkonToPlayer(
  walkon: WalkonPool,
  teamId: string,
  leagueId: string,
  modelVersion: 1 | 3 = 1,
): InsertPlayer {
  const jerseyNumber = 1 + Math.floor(Math.random() * 99);

  const archetypeId = modelVersion === 3
    ? (assignArchetype(walkon.position, walkon as any) ?? undefined)
    : undefined;

  const caps = (archetypeId && walkon.potential != null && modelVersion === 3)
    ? buildDevelopmentCaps(archetypeId, walkon.potential)
    : {};

  const seed = modelVersion === 3
    ? buildDevelopmentSeed(leagueId, "wo-" + walkon.id, 0, modelVersion)
    : "";

  return {
    teamId,
    firstName: walkon.firstName,
    lastName: walkon.lastName,
    position: walkon.position,
    eligibility: walkon.eligibility || "FR",
    throwHand: walkon.throwHand || "R",
    batHand: walkon.batHand || "R",
    homeState: walkon.homeState,
    hometown: walkon.hometown,
    jerseyNumber,
    overall: walkon.overall,
    starRating: walkon.starRating,
    hitForAvg: walkon.hitForAvg || 50,
    power: walkon.power || 50,
    speed: walkon.speed || 50,
    arm: walkon.arm || 50,
    fielding: walkon.fielding || 50,
    errorResistance: walkon.errorResistance || 50,
    clutch: walkon.clutch || 50,
    vsLHP: walkon.vsLHP || 50,
    grit: walkon.grit || 50,
    stealing: walkon.stealing || 50,
    running: walkon.running || 50,
    throwing: walkon.throwing || 50,
    recovery: walkon.recovery || 50,
    catcherAbility: walkon.catcherAbility || 50,
    velocity: walkon.velocity || 50,
    control: walkon.control || 50,
    stamina: walkon.stamina || 50,
    stuff: walkon.stuff || 50,
    wRISP: walkon.wRISP || 50,
    vsLefty: walkon.vsLefty || 50,
    poise: walkon.poise || 50,
    heater: walkon.heater || 50,
    agile: walkon.agile || 50,
    abilities: walkon.abilities || [],
    skinTone: walkon.skinTone || "light",
    hairColor: walkon.hairColor || "brown",
    hairStyle: walkon.hairStyle || "short",
    headwear: walkon.headwear || "cap",
    potential: typeof walkon.potential === "number" ? walkon.potential : null,
    // V3 fields
    playArchetypeId: archetypeId ?? null,
    developmentCaps: caps,
    developmentSeed: seed,
    developmentModelVersion: modelVersion,
  };
}

function deriveEligibility(recruit: Recruit): string {
  if (recruit.recruitType === "TRANSFER") return recruit.recruitYear || "SO";
  if (recruit.recruitType === "JUCO") return recruit.recruitYear || "FR";
  return "FR";
}
