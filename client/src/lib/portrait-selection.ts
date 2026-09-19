import manifest from "../../public/art/players/v1/manifest.json";

/** Presentation fallback for old rows. Never rewrites a saved portrait or appearance.
 * Trait-based selection stays the same when a recruit receives a new roster ID. */
export function resolvePortraitId(portraitId?: string | null, skinTone = "light", hairColor = "brown"): string {
  if (portraitId) return portraitId;
  const skin = skinTone.toLowerCase();
  const hair = hairColor.toLowerCase();
  const family = skin === "dark" || skin === "deep" ? /deep|dark|ebony/ : skin === "medium" || skin === "brown" ? /medium|brown|bronze/ : skin === "tan" || skin === "olive" ? /olive|tan|warm|golden/ : /light|fair|porcelain|pale/;
  const hairFamily = hair.includes("blond") ? /blond/ : hair.includes("red") || hair.includes("auburn") ? /red|copper|auburn/ : hair.includes("black") ? /black/ : /brown|chestnut/;
  return [...manifest.faces].sort((a,b) => {
    const score = (face: typeof a) => (family.test(face.skin) ? 4 : 0) + (hairFamily.test(face.hairColor) ? 2 : 0);
    return score(b)-score(a) || a.id.localeCompare(b.id);
  })[0].id;
}
