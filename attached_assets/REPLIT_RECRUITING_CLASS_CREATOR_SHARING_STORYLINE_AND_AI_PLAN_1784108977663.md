# Recruiting Class Creator, Sharing, Storyline Studio, and AI Plan

**Repository audited:** `Pawa-College-Baseball-Dynasty-main.zip` supplied July 14, 2026  
**Modes covered:** 149-team Full Season, 14-team multiplayer custom leagues, Season 1 dynasty setup, and every later preseason  
**Primary goal:** Let any coach create and share a recruiting class; let a commissioner safely stage an exact published version for a future season; let the creator select the ten storyline recruits and author how coach votes affect them; and provide procedural/AI-assisted creation for users who do not want to author everything.

---

## 1. Executive verdict

The repository already contains a meaningful foundation:

- An eight-step class-creation wizard.
- Procedural themes, talent distributions, positions, regions, fog, special recruits, and OVR controls.
- Recruit review, sorting, inline editing, pitch editing, ability editing, rerolls, and deletion.
- Personal recruiting-class libraries.
- Revocable share links and an import page.
- Season 1 class selection during dynasty setup.
- A commissioner selection prompt at the transition to the next season.
- A central class validator and a shared replacement helper.
- A ten-recruit storyline system with voting and attribute-first outcomes.

The requested product is therefore an extension and hardening of existing systems—not a greenfield feature.

It is not currently safe or complete enough to support the intended experience. The largest problems are:

1. The wizard allows only 20–80 recruits, while a 14-team league requires 102 and Full Season requires 1,081 under the game’s current formulas.
2. Loading a class deletes the live pool before the new pool is completely inserted and is not one database transaction.
3. The “Load into League” action can replace an active class outside a safe preseason/setup window.
4. Shared-class previews reveal exact OVR, gems, busts, generational gems, and generational busts.
5. Share links point to a mutable class rather than an immutable published version.
6. Saved classes do not contain storyline cast or arc data. The ten recruits and their archetypes are rerolled after loading.
7. Storyline selection, templates, overlapping arcs, and some outcome behavior use unseeded `Math.random()`.
8. Several advertised storyline outcomes write fields that do not exist on the recruit table.
9. Story outcome attribute names are not allowlisted, which is unsafe for imported custom content.
10. No AI-assisted class/story creator exists.

### Audit status

| Capability | Status | Finding |
|---|---|---|
| Coach creates a class outside a league | **Implemented** | Authenticated users can save to a library; guests can save locally. |
| Coach shares a class | **Implemented with risks** | Revocable token links exist, but versioning, secrecy, and token hardening need work. |
| Recipient previews and imports a class | **Implemented with spoiler leak** | Preview exposes hidden player truth and imports a mutable source snapshot. |
| Commissioner loads Season 1 class | **Implemented/partial** | Dynasty setup supports it, but compatibility and atomic activation are not enforced. |
| Commissioner selects later class | **Implemented/partial** | Prompt occurs at the walk-on transition, after an auto class is already generated. |
| Full Season class size | **Fail** | Creator max is 80; Full Season target is 1,081. |
| 14-team class size | **Fail** | Creator max is 80; current 14-team formula returns 102. |
| Exact ten storyline cast saved with class | **Not implemented** | Storyline cast is selected randomly after loading. |
| Creator authors storyline arcs | **Not implemented** | Runtime uses built-in archetype templates. |
| Creator controls rating effects by choice | **Not implemented** | Built-in weights generate fixed outcomes; no safe authoring UI/schema exists. |
| CPU procedural story generation | **Partially implemented** | Existing engine can select recruits/archetypes, but is not seeded or packaged with the class. |
| Generative AI assistance | **Not implemented** | No class/story AI route or UI was found. |
| Immutable publication/versioning | **Not implemented** | A share references the editable saved-class row. |
| Atomic class activation | **Not implemented** | Delete and chunked insert can leave the league with a missing/partial pool. |
| Focused automated coverage | **Not found** | No recruit-class wizard/share/story package tests were found. |

---

## 2. What is already good and should be preserved

### 2.1 Creator foundation

`client/src/components/recruiting-wizard.tsx` provides useful controls and a strong review table. Preserve:

- Themes and advanced overrides.
- Live distribution feedback.
- Position and region controls.
- Fog-of-war settings.
- Special recruit types.
- Individual reroll.
- Inline name, position, attribute, potential, ability, and pitch-mix editing.
- Sorting and recruit deletion.
- Save to library versus apply to league separation.
- Confirmation before abandoning an unsaved draft.

### 2.2 Sharing foundation

The existing system already has:

- Ownership checks for reading/deleting a saved class.
- Explicit share creation rather than making every class public.
- Revocation.
- Import counts.
- A public preview followed by an authenticated import.
- A copied library entry for the recipient.

Keep this user mental model, but point shares to immutable versions and redact spoilers.

### 2.3 Commissioner lifecycle foundation

Keep both entry points:

- Season 1: dynasty setup.
- Later seasons: a required selection before entering the next preseason.

Replace immediate destructive loading with a stage, validate, and activate lifecycle.

### 2.4 Storyline foundation

The current engine already supports:

- Ten storyline recruits.
- Story archetypes and multiple event templates.
- Three or four coach choices.
- One vote per team with vote updates.
- Attribute-first outcomes.
- Positive, negative, and neutral effects.
- Ability gains/losses.
- OVR recalculation from changed attributes.
- Arc stage progression.
- Risk/reward hints without exposing exact effects to coaches.
- Deterministic no-vote selection based partly on hidden personality variables.

The custom-story system should compile into this runtime model after the runtime is hardened.

---

## 3. Release-blocking corrections

Complete this section before building the Storyline Studio or AI integration.

### P0-1: Make class size league-aware

Current source facts:

- Wizard slider: 20–80.
- Backend wizard validator: 20–80.
- Preview/generate endpoints clamp to 20–80.
- The game’s 14-team formula is `ceil(14 × 7.25) = 102`.
- The game’s 149-team Full Season formula is 1,081 before live departure demand can increase it.
- The loader does not block or safely complete an undersized class.

An 80-player class cannot replenish either target mode.

#### Required model

Support two published package types:

1. **Exact Class**
   - Contains every recruit.
   - Declares the intended team count/preset and recruit count.
   - Activates only when compatible, unless a commissioner explicitly chooses an approved fill/trim policy.

2. **Scalable Blueprint**
   - Contains generation rules, a stable seed, optional hand-authored recruits, and ten curated storyline characters.
   - Materializes to the target league’s required pool size at activation.
   - Preserves authored recruits and story characters, then procedurally fills the remaining slots.

Recommended creator targets:

| Target | Recommended size behavior |
|---|---|
| 14-team custom league | Show the current target of 102, derived from the server—not a hard-coded UI number. |
| 149-team Full Season, Season 1 | Show 1,081, derived from the server. |
| Later Full Season season | Use the live departure-driven requirement computed for that league/season. |
| Flexible/shareable | Create a scalable blueprint with minimum/maximum supported team counts. |

The server is always authoritative. Add a compatibility endpoint:

```http
POST /api/recruiting-class-versions/:versionId/compatibility
{
  "leagueId": "...",
  "season": 3
}
```

Response:

```json
{
  "requiredCount": 1081,
  "providedCount": 80,
  "compatible": false,
  "fillCount": 1001,
  "positionWarnings": [],
  "storyCastValid": true,
  "allowedPolicies": ["block", "procedural_fill"]
}
```

Do not silently load an undersized pool.

### P0-2: Make class activation transactional and idempotent

`replaceLeagueRecruitingClass()` currently:

1. Deletes all existing recruits and child data.
2. Inserts the new class in chunks of 100.
3. Initializes storylines afterward.

These operations are not one transaction. Failure after deletion or after one insert chunk can leave zero recruits or a partial class. Storyline initialization catches its own error and can return zero while the outer replacement still succeeds.

#### Required correction

Create `activateRecruitingClassVersion()` as the single authorized activation service.

Within one transaction:

1. Acquire a league/season activation lock.
2. Verify assignment status and idempotency key.
3. Validate the immutable class version against the target league.
4. Materialize scalable filler if needed.
5. Preassign new live recruit IDs and build template-ID mapping.
6. Delete replaceable current-season recruiting data.
7. Insert every recruit.
8. Insert the exact ten storyline cast records.
9. Insert/compile their arc definitions and initial events.
10. Update league class metadata and assignment status.
11. Write audit and activation ledger rows.
12. Commit.

Only invalidate caches and send notifications after commit.

Use a unique key such as `(leagueId, season)` plus a version/content hash. Repeating the same activation request must return the prior successful result without creating more recruits or storylines.

### P0-3: Prohibit midseason destructive replacement

`/api/leagues/:id/recruiting/load-saved-class` has commissioner authorization but no safe phase restriction. The Manage Recruiting page offers “Load into League” for active leagues and explicitly says it will replace the current pool.

This can wipe calls, scouting, visits, targets, interests, commits, votes, and storyline progress after coaches have begun recruiting.

#### Required lifecycle

```text
Draft class
  -> Publish immutable version
  -> Commissioner stages version for League + Season
  -> Server preflight validates compatibility
  -> Assignment locks at season boundary
  -> Activation transaction creates live class
  -> Coaches begin recruiting
```

Allowed activation windows:

- Season 1: `dynasty_setup`, before any recruiting action.
- Later seasons: the transition into the upcoming preseason, before any recruiting action for that season.

Outside those windows, the API must return 409 and offer **Stage for Next Season**. Do not rely on hiding the button in the client.

Allow replacement before lock only if no action, vote, interest, target, visit, or commitment exists for that class. Otherwise require save-state restore rather than destructive replacement.

### P0-4: Stop generating an auto class before replacing it with the selected class

At the end of walk-ons, `finalizeWalkonsPhase()` deletes the old class and calls `generateRecruits()`. Only after that returns does the advance code replace the freshly generated class with the selected saved class.

This wastes work, initializes storylines twice, increases failure surface, and makes audit/telemetry ambiguous.

Pass the staged assignment into `finalizeWalkonsPhase()`:

```ts
finalizeWalkonsPhase(leagueId, completedSeason, {
  upcomingClassAssignment,
});
```

The phase finalizer should choose exactly one path:

- Activate the staged published version.
- Or generate one procedural class.

Never both.

### P0-5: Redact shared-class spoilers

The public import preview currently returns and displays:

- Exact OVR for every recruit.
- Average OVR.
- Gem/bust flags.
- Generational gem/bust flags.
- Special badges that visibly identify those recruits.

This defeats scouting and fog of war. It also gives anyone with a link competitive information before the class is activated.

#### Public non-spoiler preview may show

- Class name and description.
- Author display name or creator alias.
- Package type and compatible team counts.
- Recruit count.
- Displayed star distribution.
- Position distribution.
- Region mix.
- Broad theme tags.
- Number of authored storyline characters.
- Whether content is procedural, custom, or AI-assisted.
- Game/schema compatibility.

#### Public preview must not show

- True OVR or true attribute values.
- Potential.
- Gem/bust truth.
- Hidden abilities.
- Storyline hidden variables.
- Exact branch effects.
- Which choice is favorable.
- Internal arc/archetype identifiers that reveal a collapse/gem outcome.

Provide an owner-only **Spoiler Preview** separately.

### P0-6: Publish immutable versions

Current share links point to `saved_recruiting_classes.id`. The owner can PATCH that row, changing what an existing link imports.

Implement immutable published versions:

```text
recruiting_class_projects
- id
- owner_user_id
- name
- description
- status
- current_draft_revision
- created_at / updated_at

recruiting_class_versions
- id
- project_id
- version_number
- schema_version
- generator_version
- balance_version
- package_json
- content_hash
- source_type
- is_sealed
- published_at

recruiting_class_shares
- id
- version_id
- token_hash
- status
- expires_at
- max_imports
- import_count
- created_at
```

A published version never changes. Editing creates a new draft and later a new version. Existing shares and staged league assignments remain pinned to the original version/content hash.

### P0-7: Harden class validation

`validateAndNormalizeRecruitingClass()` is a good centralization step, but it does not currently enforce all game invariants:

- Numeric player attributes are coerced but not clamped to the expected rating range.
- Most pitch fields are not clamped to 0–7/binary constraints.
- Ability strings are not checked against the known ability catalog or position eligibility.
- Ability-count limits are not enforced.
- `playerArchetype` accepts any string.
- Appearance fields are not enum-validated.
- Rank uniqueness/consistency is not enforced.
- Arbitrary unknown keys are copied through unless they are one of three stripped fields.
- Class count is not checked against the target league requirement.

Replace permissive copying with a strict, allowlisted package schema. Unknown fields must be rejected or stripped with an explicit warning. Validate both at publish and again at activation.

Also fix the PATCH mass-assignment path. It currently spreads the entire request body into `updateSavedRecruitingClass()`. Allow only the intended editable fields such as `name`, `description`, and validated draft content. A request must not update owner ID, primary key, import count, creation time, or publication metadata.

### P0-8: Harden storyline outcome persistence before accepting custom arcs

`StoryOutcome.attrChanges` accepts a free-form field string. `applyStoryOutcomeToRecruit()` reads and writes that field without an allowlist. Imported custom content must never be able to select arbitrary database fields.

Add separate position-aware allowlists:

```ts
const HITTER_STORY_ATTRS = new Set([
  "hitForAvg", "power", "speed", "arm", "fielding",
  "errorResistance", "clutch", "vsLHP", "grit",
  "stealing", "running", "throwing", "recovery", "catcherAbility",
]);

const PITCHER_STORY_ATTRS = new Set([
  "velocity", "control", "stamina", "stuff", "wRISP",
  "vsLefty", "poise", "heater", "agile",
]);
```

Pitch-quality effects need a separate explicit pitch schema.

The current outcome type also includes `injuryWeeks`, `commitmentUncertainty`, and `ratingReveal`, but corresponding persisted recruit fields were not found in the recruit table. Either:

1. Add real columns and implement all consuming gameplay logic, or
2. Remove these outcome types until fully supported.

Do not present an authoring control whose result cannot persist or affect gameplay.

Resolve an event in one transaction. A crash after updating a recruit but before setting `resolvedAt` can otherwise allow the event to be applied again on retry.

---

## 4. Recruiting Class Package V2

Saved content must package recruits and stories together with stable identities.

### 4.1 Why live recruit IDs cannot be used

The validator intentionally strips live `id` and `leagueId` values. A class loaded into another league receives new database IDs. A story cast therefore cannot reference the source database recruit ID.

Give every template recruit a package-stable ID:

```ts
type RecruitTemplate = {
  templateRecruitId: string;
  firstName: string;
  lastName: string;
  position: Position;
  // validated ratings, pitches, abilities, appearance, recruiting preferences...
};
```

At activation, preassign live recruit IDs and create:

```ts
Map<templateRecruitId, liveRecruitId>
```

Use that mapping to insert the ten storyline recruits and any cross-character links.

### 4.2 Recommended package shape

```ts
interface RecruitingClassPackageV2 {
  schemaVersion: 2;
  generatorVersion: string;
  balanceVersion: string;

  metadata: {
    name: string;
    description?: string;
    packageType: "exact" | "scalable";
    intendedPreset?: "full_season" | "custom" | "any";
    intendedTeamCount?: number;
    minimumTeamCount?: number;
    maximumTeamCount?: number;
    tags: string[];
    spoilerPolicy: "open" | "sealed";
  };

  generation: {
    seed: string;
    config: WizardConfigV2;
    fillerPolicy: "none" | "procedural_fill";
  };

  recruits: RecruitTemplate[];

  storyPlan: {
    mode: "authored" | "procedural" | "ai_assisted";
    cast: StoryCharacterBlueprint[];
  };

  summary: NonSpoilerClassSummary;
}
```

### 4.3 Story character blueprint

```ts
interface StoryCharacterBlueprint {
  templateRecruitId: string;
  storySlot: number; // 0–9, unique
  arcDefinitionId: string;
  tier: "elite" | "above_average" | "average" | "below_average" | "unknown";
  isLegendary: boolean;
  hiddenProfile: HiddenProfilePreset;
  linkedTemplateRecruitId?: string;
  chapters: StoryChapterBlueprint[];
}
```

Require exactly ten unique template recruit IDs and exactly ten unique slots.

### 4.4 Story chapter and choice blueprint

```ts
interface StoryChapterBlueprint {
  chapterId: string;
  title: string;
  eventText: string;
  scheduleAnchor: "preseason" | "early" | "middle" | "late" | "postseason";
  choices: StoryChoiceBlueprint[];
}

interface StoryChoiceBlueprint {
  choiceId: "A" | "B" | "C" | "D";
  label: string;
  outcomeText: string;
  publicRisk: "low" | "medium" | "high";
  publicReward: "low" | "medium" | "high";
  effect: ValidatedStoryEffect;
  nextChapterId?: string;
  nextArcDefinitionId?: string;
}
```

For an authored arc, do not randomly select a template or silently call `maybeTransitionArchetype()`. Follow the author’s explicit chapter/transition graph. Built-in procedural arcs may retain transition rules.

### 4.5 Effect specification

```ts
interface ValidatedStoryEffect {
  attributeDeltas: Array<{
    attribute: StoryAttributeId;
    delta: number;
  }>;
  pitchDeltas?: Array<{
    pitch: PitchId;
    delta: number;
  }>;
  potentialDelta?: number;
  abilityGrantId?: string;
  abilityRemoveRule?: "story_positive" | "any_story";
  revealRule?: "none" | "ratings" | "gem_bust";
  recruitingEffects?: {
    commitmentThresholdDelta?: number;
    interestVolatilityDelta?: number;
  };
}
```

Never edit OVR directly. Apply valid attributes, clamp them, then recalculate OVR.

Suggested standard-arc limits:

- Maximum three changed attributes per choice.
- Per-attribute delta: -8 to +8.
- Legendary per-attribute delta: -12 to +12.
- Total absolute attribute points per standard choice: 14.
- Total absolute attribute points per legendary choice: 22.
- One ability change per choice.
- Potential effects are smaller and rarer than current-rating effects.
- Every branch is simulated during validation to ensure ratings remain legal.

These should be centralized balance constants, not duplicated in the UI.

---

## 5. Creator experience redesign

The current modal is clean enough for an 80-player prototype, but it is not the right workspace for a reusable class with 102–1,081+ recruits and ten decision trees.

### 5.1 Use a full-page Class Studio

Recommended route:

```text
/recruiting-class-studio/new
/recruiting-class-studio/:projectId
/recruiting-class-studio/:projectId/story/:templateRecruitId
```

Desktop structure:

```text
Top bar: class name | draft state | autosaved | validate | publish

Left rail                 Main workspace                    Right rail
----------------------    ------------------------------    --------------------
Build steps               Current editor                    Compatibility
Warnings                  Tables/cards/arc builder           Live class summary
Story cast status                                            Blocking errors
```

On mobile/tablet, collapse rails into drawers.

### 5.2 Revised workflow

Keep a manageable top-level flow and move complexity into Basic/Advanced tabs:

1. **Purpose**
   - Exact or scalable.
   - 14-team, Full Season, flexible, or custom target.
   - Manual, procedural, or AI-assisted start.
   - Class name and description—entered once.

2. **Talent Profile**
   - Theme.
   - Stars.
   - OVR curve.
   - Positions.
   - Regions.
   - Special types.
   - Fog.

3. **Generate Roster**
   - Generate all, generate filler only, or start blank.
   - Stable seed and reroll controls.

4. **Review Recruits**
   - Virtualized table.
   - Search/filter/sort.
   - Bulk edit.
   - Individual profile editor.
   - Actual-versus-requested distribution report.

5. **Story Cast**
   - Choose exactly ten recruits.
   - Auto-pick suggestions.
   - Coverage warnings.
   - Assign slots and optional linked pairs.

6. **Arc Studio**
   - Pick built-in arcs, create custom arcs, or ask CPU/AI.
   - Edit chapters, choices, public hints, results, and rating effects.

7. **Validate & Playtest**
   - Compatibility checks.
   - Simulate every branch.
   - Preview story calendar.
   - Non-spoiler and spoiler previews.

8. **Publish & Share**
   - Version notes.
   - Sealed/open package choice.
   - Create share link.
   - Stage into a commissioner-owned league if authorized.

### 5.3 Fix current wizard design problems

- Replace the 20–80 range with server-derived target sizing.
- Add a typed numeric control; do not rely only on a slider.
- Increase inactive stepper contrast. Current future steps are too faint.
- Make completed steps navigable after their data is valid.
- Remove duplicate “Class Label” and final “Class Name” entry.
- Add draft autosave and recovery.
- Add a persistent summary of requested and actual distributions.
- Explain whether a theme is a preset or still active after advanced overrides. Once overrides materially change it, label the class `Custom` with the original theme as a starting preset.
- Resolve the duplicate Blue Chip controls. `starDistribution.blueChip` and `specialCounts.blueChips` can conflict; the exact count currently overrides the percentage. Use one source of truth.
- Warn when star distribution and OVR curve conflict.
- Recalculate and display the actual star distribution after OVR normalization.
- Add Undo/Redo for individual and bulk edits.
- Do not render 1,081 full editable rows at once; use virtualization and server/draft pagination.

---

## 6. Story Cast experience

### 6.1 Selecting the ten characters

In Recruit Review, add **Add to Story Cast**. The Story Cast page has ten numbered slots.

Each candidate card shows author-only information:

- Name, position, displayed stars, true OVR, and potential.
- Special type.
- Player archetype.
- Suggested story arcs compatible with position and player profile.
- Warnings if too many cast members have the same position/tier/arc.

Recommended default coverage—not a hard restriction:

- At least two pitchers.
- At least two hitters.
- At least one elite/high-profile recruit.
- At least one low-star or hidden-upside recruit.
- No more than three characters using the same arc family.
- Exactly one or zero legendary characters according to the package policy.

The existing 2/2/2/2/2 tier distribution can remain the **Balanced Cast** auto-pick preset, but creators may deliberately override it.

### 6.2 Cast generation modes

- **Pick Myself:** creator selects all ten.
- **CPU Suggest:** seeded current algorithm proposes ten; creator accepts/replaces each.
- **AI Cast Draft:** AI proposes ten roles and narrative rationales; deterministic validation selects only compatible persisted recruits.
- **Surprise Me / Sealed:** server selects the ten at activation and does not reveal hidden selections to the commissioner until the class begins.

### 6.3 Story schedule preview

Show a season timeline with each chapter’s expected anchor. Use phase-relative anchors rather than raw week numbers so the same package can work in different season lengths.

Validate:

- No chapter occurs after the class is no longer recruitable unless intentionally marked as a signing-day epilogue.
- No more than the configured weekly active-event cap.
- Every character receives the intended number of chapters.
- Linked arcs do not create circular references unless explicitly supported.

---

## 7. Arc Studio design

### 7.1 Three authoring levels

#### Template

Choose an existing built-in arc. The system fills all text and safe effects. The creator can edit names/flavor but not mechanics unless switching to Advanced.

#### Guided

For each chapter:

- Enter event text.
- Create three or four choices.
- Select affected ratings.
- Select direction and strength: minor, moderate, major.
- Optionally select a legal ability/recruiting effect.
- See the computed exact effect and final min/max after volatility.

#### Advanced

Edit exact allowlisted deltas and branch transitions inside centralized safety budgets. Raw JSON is not accepted from the browser.

### 7.2 Branch editor

For each choice show:

```text
Choice text
Public hint: Medium Risk / High Reward
Outcome narration
Mechanical result (author only)
Next chapter/arc
Validation status
```

Include a branch simulation panel:

- Starting ratings.
- Rating changes.
- Recomputed OVR.
- Ability changes.
- Best-case and worst-case cumulative result through the full arc.
- Cap/floor warnings.

### 7.3 Multiplayer voting rules

Define and display the league policy:

- One vote per team.
- Coaches may change a vote until the advance deadline.
- Plurality determines the result.
- Tie rule must be explicit and seeded.
- No-vote rule must be explicit and seeded.
- CPU-team voting policy must be explicit for mixed leagues.
- Resolution occurs once at advance and is transactionally audited.

Coaches see choice text and public risk/reward hints. Exact deltas remain hidden until resolution unless the league enables an open-mechanics setting.

### 7.4 Authored arc behavior

For custom arcs:

- Use exact ordered chapters from the package.
- Do not randomly draw another built-in event.
- Do not randomly link an overlapping recruit.
- Do not automatically transition to a different archetype unless the chosen branch specifies it.
- Seed any allowed random effect with package version + league + season + recruit + chapter.

This ensures the same shared version contains the same intended story while still allowing coach votes to create different outcomes.

---

## 8. CPU and AI-assisted creation

Treat “CPU” and generative AI as two different options.

### 8.1 CPU procedural generation

CPU generation should always be available, fast, deterministic, and free of external-service dependency.

It can:

- Generate the full recruit pool.
- Fill only missing recruits in a scalable package.
- Suggest the ten-character cast.
- Assign compatible built-in arcs.
- Generate hidden profiles from controlled presets.
- Select safe effect presets.
- Regenerate one recruit, one story character, one chapter, or one choice.

Replace `Math.random()` with an injected seeded RNG throughout recruit and storyline generation. Store the seed and generator version in the class version.

### 8.2 Generative AI assistance

AI is most valuable for creative text and variety, not for generating 1,081 mechanical player records.

Recommended AI actions:

- Draft a class theme from a plain-language prompt.
- Generate or rewrite names/hometowns for a selected subset.
- Propose ten distinctive story roles.
- Draft one complete arc.
- Draft the next chapter or three choices.
- Rewrite event/outcome text for tone.
- Create linked-character story ideas.
- Review a class for repetition or narrative conflicts.

The existing procedural engine should still generate and balance player ratings. This keeps Full Season generation fast, inexpensive, deterministic, and testable.

### 8.3 Safe AI pipeline

```text
User prompt
  -> moderation/input limits
  -> server AI job
  -> structured schema response
  -> strict allowlist validator
  -> balance compiler
  -> non-persistent preview
  -> user accepts/edits
  -> draft save
```

AI output must never:

- Write directly to live league tables.
- Choose arbitrary database fields.
- Bypass effect budgets.
- Publish or activate without user confirmation.
- Receive API keys from the client.
- Override class-size or position-depth requirements.

For story mechanics, let AI select from semantic presets such as `power_minor_gain` or `control_major_loss`. The server converts those presets into validated effects. Do not trust model-authored raw deltas as authoritative.

### 8.4 AI job behavior

- Server-side credentials only.
- Per-user and per-project rate limits.
- Concurrency and spending caps.
- Cancel/retry support.
- Store prompt, provider/model identifier, schema version, and accepted result for audit.
- Do not store rejected generations as published content.
- Procedural fallback when AI is unavailable.
- AI-generated label on published versions and previews.
- User-generated text length and content rules.

### 8.5 Useful UI prompts

- “Create a pitching-heavy class from the Southeast with three overlooked catchers and ten interconnected underdog stories.”
- “Choose ten varied storyline recruits without revealing which players are gems or busts.”
- “Draft a three-chapter confidence-crisis arc for this shortstop. Give coaches three meaningful choices per chapter.”
- “Rewrite this outcome in a concise sports-documentary tone without changing its mechanics.”

---

## 9. Sharing, fairness, and sealed classes

A human author who manually edits true ratings and branch results will know those secrets. The software cannot erase that knowledge.

### 9.1 Share modes

Offer three explicit modes:

1. **Editable Creator Pack**
   - Recipient can clone and inspect everything.
   - Appropriate for collaborative creation.

2. **Sealed League Pack**
   - Commissioner can stage the immutable version.
   - Hidden ratings, gem/bust truth, and exact story outcomes stay server-sealed.
   - Appropriate for competitive leagues.

3. **Non-spoiler Preview Link**
   - Shows only public summary information.
   - Can lead to either editable clone or sealed import depending on owner permission.

### 9.2 League disclosure

Before staging, show:

- Original creator.
- Whether that creator is a coach in the target league.
- Open versus sealed status.
- Manual/procedural/AI-assisted provenance.
- Published version and content hash.
- Whether the commissioner has opened spoiler data.

For a 14-person competitive league, display a prominent warning if a participating coach authored or inspected a non-sealed class. Let the league decide whether to allow it.

Only server-generated sealed procedural/AI content can ensure no human participant saw hidden details before activation.

### 9.3 Share token hardening

- Use at least 128 bits of entropy.
- Store a hash of the token, not the plaintext token.
- Optional expiration and maximum imports.
- Rate-limit public token lookup and import.
- Record version ID and content hash in every import.
- Prevent accidental duplicate imports or offer “Update from source” as an explicit versioned action.
- Preserve original creator/version lineage when cloning.

If public discovery or a Steam Workshop-style marketplace is added later, add content reporting, blocking, moderation, search, ratings, version compatibility, and removal procedures. Direct private links can ship first.

---

## 10. Commissioner season assignment experience

### 10.1 Season 1

In Dynasty Setup, replace the simple saved-class selector with a `Season 1 Recruiting Class` card:

- Auto-generate.
- Select published library version.
- Import via share link/code.
- Create a new class.
- Generate a sealed class.
- View compatibility/preflight.
- Stage selection.

Starting the dynasty is blocked until the assignment is valid. If the selected class ID is missing, unauthorized, incompatible, or malformed, fail with a clear error. Do not start with zero recruits.

### 10.2 Later seasons

Add `Recruiting Class for Season N+1` to the commissioner offseason checklist before the final walk-on advance.

States:

- Not selected.
- Auto-generation selected.
- Version staged.
- Warnings.
- Ready and locked.
- Activated.
- Activation failed/rolled back.

The commissioner can stage early and change the assignment until lock. The final advance should confirm the already-staged choice rather than introduce a surprise selection dialog at the last moment.

### 10.3 Assignment table

```text
league_recruiting_class_assignments
- id
- league_id
- season
- class_version_id nullable
- mode: auto | published_version
- filler_policy
- required_count
- materialized_count
- content_hash
- status: staged | validated | activating | active | failed | superseded
- staged_by_user_id
- staged_at
- activated_at
- failure_message
```

Unique `(league_id, season)`.

### 10.4 Activation summary

After activation, show:

- Recruit total and positions.
- Displayed star distribution.
- Ten story characters initialized.
- Package/version/provenance.
- Fill count if scalable.
- Validation warnings.
- Activation audit ID.

Do not reveal sealed information.

---

## 11. API and service plan

### Project/draft endpoints

```http
POST   /api/recruiting-class-projects
GET    /api/recruiting-class-projects
GET    /api/recruiting-class-projects/:projectId
PATCH  /api/recruiting-class-projects/:projectId/draft
POST   /api/recruiting-class-projects/:projectId/generate
POST   /api/recruiting-class-projects/:projectId/generate-recruit
POST   /api/recruiting-class-projects/:projectId/validate
POST   /api/recruiting-class-projects/:projectId/publish
```

### Story endpoints

```http
PUT    /api/recruiting-class-projects/:projectId/story-cast
PUT    /api/recruiting-class-projects/:projectId/story-cast/:templateRecruitId
POST   /api/recruiting-class-projects/:projectId/story-cast/auto-pick
POST   /api/recruiting-class-projects/:projectId/stories/:templateRecruitId/simulate
```

### AI endpoints

```http
POST   /api/recruiting-class-projects/:projectId/ai-jobs
GET    /api/recruiting-class-projects/:projectId/ai-jobs/:jobId
POST   /api/recruiting-class-projects/:projectId/ai-jobs/:jobId/accept
DELETE /api/recruiting-class-projects/:projectId/ai-jobs/:jobId
```

### Publication/sharing endpoints

```http
GET    /api/recruiting-class-projects/:projectId/versions
POST   /api/recruiting-class-versions/:versionId/shares
DELETE /api/recruiting-class-versions/:versionId/shares/:shareId
GET    /api/recruiting-class-share/:token/preview
POST   /api/recruiting-class-share/:token/import
```

### Commissioner assignment endpoints

```http
GET    /api/leagues/:leagueId/recruiting-class-assignments/:season
PUT    /api/leagues/:leagueId/recruiting-class-assignments/:season
POST   /api/leagues/:leagueId/recruiting-class-assignments/:season/preflight
DELETE /api/leagues/:leagueId/recruiting-class-assignments/:season
```

Actual activation should normally be called by the unified season-transition engine, not an unrestricted UI endpoint.

### Authorization

- Authenticated users can create projects and edit only their own drafts.
- Guests can use procedural preview/local drafts but cannot share, publish online, use paid AI, or stage into a league.
- Project collaborators require explicit future permissions; do not infer access from a share link.
- Commissioner/co-commissioner authorization is required to stage a league assignment.
- League membership alone is never sufficient.
- Published versions are immutable for everyone.

---

## 12. Runtime storyline integration

Refactor:

```ts
initializeStorylineRecruits(leagueId, season)
```

to:

```ts
initializeStorylineRecruits({
  tx,
  leagueId,
  season,
  storyPlan,
  templateToLiveRecruitId,
  seed,
});
```

Behavior:

- `authored`: create exactly the package cast and chapters.
- `procedural`: run seeded selection and built-in arcs.
- `ai_assisted`: use the already validated/published authored plan; no live AI request at activation.

Do not fire-and-forget Season 1 storyline initialization. The class should not become active until ten valid storyline records are committed.

Add a story-resolution ledger:

```text
storyline_resolutions
- event_id unique
- winning_choice
- vote_snapshot_hash
- effect_snapshot
- before_ratings
- after_ratings
- resolved_at
```

Resolve recruit mutation, event resolution, arc stage, ability changes, and audit record in one transaction.

---

## 13. Validation and playtest requirements

### Class-level blockers

- Package schema/version supported.
- Content hash matches.
- Exact/scalable policy valid.
- Required target count satisfied or approved filler policy selected.
- Legal positions and minimum position depth.
- Unique template recruit IDs.
- Legal ratings, pitches, abilities, potential, appearances, and recruiting fields.
- Rank fields rebuilt consistently.
- Exactly ten unique story characters.
- All story characters exist in recruits.
- Exactly ten unique story slots.
- Every arc has a valid start and terminal path.
- Every chapter has three or four choices.
- Every effect uses allowlisted fields and stays within budget.
- Every branch can be simulated without illegal ratings or missing next nodes.
- No unsupported outcome type.
- No unresolved cross-character reference.
- No weekly event-cap violation.

### Warnings

- Unbalanced position distribution.
- Too many story characters at one position/tier.
- Repetitive arcs/choice text.
- Star distribution changed after OVR recalculation.
- Creator is a participating coach.
- Open/spoiler package selected for a competitive league.
- Package built on an older balance version.
- Scalable filler will materially exceed curated recruits.

### Playtest tools

- Generate a non-spoiler class preview.
- Simulate all story branches.
- Simulate seeded voting patterns.
- Show min/median/max final OVR per character.
- Show cumulative rating and ability changes.
- Show the event calendar for standard and Full Season timing.
- Run a recruiting-pool supply check against projected team needs.

---

## 14. Automated test matrix

### Unit tests

- 14 teams returns the current server target of 102.
- Full Season 149 teams returns 1,081 for the static Season 1 case.
- Live departure requirement is used for a later Full Season assignment.
- Exact class incompatibility blocks activation.
- Scalable class preserves curated recruits and fills to the exact target.
- Ten stable template IDs map to ten live recruit IDs.
- Duplicate story slots/characters fail validation.
- Story attribute allowlist rejects unknown fields.
- Rating and pitch deltas clamp correctly.
- Standard and legendary effect budgets are enforced.
- All branch effects recalculate OVR from attributes.
- Seeded generation is identical for the same seed/version.
- Published version content hash is stable.
- Non-spoiler preview contains no true OVR, potential, gem/bust, or exact branch data.
- PATCH endpoint rejects owner/ID/publication-field changes.

### Integration tests

- Coach creates, publishes, shares, and recipient imports an immutable version.
- Editing the project after publishing does not change an existing share.
- Revoked/expired/exhausted share cannot preview/import.
- Season 1 assignment activates before dynasty start.
- Invalid Season 1 selection blocks start and never produces zero recruits.
- Later-season assignment bypasses auto generation and activates once.
- Activation failure rolls back to the prior valid database state.
- Retry after success does not duplicate recruits/storylines.
- Midseason activation returns 409 and preserves actions/votes/interests.
- Ten authored storyline records and first scheduled events exist immediately after activation.
- One event resolution applies its effect exactly once.
- Mixed human/CPU and all-human tie/no-vote rules are deterministic.
- AI result is schema-validated and cannot activate directly.

### E2E tests

- Create 14-team exact class and see 102 target.
- Create Full Season scalable class and see 1,081 target/filler preview.
- Select ten story recruits.
- Author three chapters with three choices each.
- See blocking error for an illegal rating effect.
- Publish version 1, edit draft, publish version 2, verify share remains pinned to version 1.
- Public preview contains no spoilers.
- Commissioner imports and stages a shared version for Season 1.
- Commissioner stages a later version from the offseason checklist.
- Coaches vote and see the winning authored outcome reflected once.
- Keyboard-only creator navigation and accessible errors.
- Draft autosave recovery after refresh.

### Scale/soak tests

- Generate, validate, publish, share, import, and activate a 1,081-recruit package.
- Virtualized review stays responsive with 1,081+ recruits.
- Run 25 seeded 149-team classes and verify distribution/supply bounds.
- Run 25 seeded 14-team classes and verify position supply and recruiting balance.
- Resolve every branch of 250 story characters without invalid fields or double application.

---

## 15. Migration plan

### Existing saved classes

Convert V1 envelopes to V2 on read or through a background migration:

- `packageType: exact`.
- Generate stable `templateRecruitId` values.
- Preserve existing recruits.
- `storyPlan.mode: procedural` with no authored cast.
- Mark target compatibility as unknown until validated.
- Preserve source/theme metadata.

Do not expose previously hidden fields in public previews after migration.

### Existing shares

Snapshot the class into an immutable version and repoint the share to that version. Existing URLs may remain valid if tokens are safely migrated, but newly issued tokens should use the hardened format.

### Existing live dynasties

Do not rewrite active recruit pools. Start using assignments/package metadata at the next class transition. Existing storyline rows continue through the current season.

---

## 16. Implementation order

### Phase 1 — Integrity and compatibility

1. League-aware class-size service and compatibility endpoint.
2. Strict package/recruit/story validators.
3. Transactional/idempotent activation service.
4. Phase guards and season assignment model.
5. Stop auto-generating before selected-class activation.
6. Story outcome field/schema and resolution-transaction fixes.

### Phase 2 — Versioned sharing

1. Project/version schema.
2. Immutable publication and content hash.
3. Non-spoiler preview.
4. Hardened tokens, lineage, and sealed/open modes.
5. V1 migration.

### Phase 3 — Scalable creator

1. Full-page Class Studio.
2. Exact/scalable setup.
3. Server-derived targets.
4. Virtualized recruit review.
5. Autosave, undo/redo, and actual-versus-requested reports.

### Phase 4 — Story Cast and Arc Studio

1. Stable template recruit IDs.
2. Ten-slot cast editor.
3. Guided effect builder.
4. Branch validation/simulation.
5. Authored runtime compilation.
6. Multiplayer outcome ledger.

### Phase 5 — CPU and AI assistance

1. Seed all procedural generation.
2. CPU cast/arc suggestions.
3. AI job pipeline and structured outputs.
4. AI story drafting/rewrite tools.
5. Rate limits, cost controls, audit, and fallback.

### Phase 6 — Balance and release verification

1. 14-team simulations.
2. 149-team simulations.
3. Competitive secrecy review.
4. Performance/soak testing.
5. Accessibility and visual regression.

---

## 17. Definition of done

- [ ] Any authenticated coach can create, save, publish, and share a class without commissioner privileges.
- [ ] A public share preview reveals no scouting/story spoilers.
- [ ] A share points to an immutable class version and content hash.
- [ ] The creator can choose exactly ten storyline recruits.
- [ ] The creator can select built-in arcs or author chapters, choices, narration, and safe rating effects.
- [ ] Coach votes resolve the published branch exactly once.
- [ ] CPU can generate a complete valid class and story plan from a seed.
- [ ] AI can draft class/story content but cannot bypass validation, publish, or activate directly.
- [ ] Season 1 commissioners can stage and activate a class before dynasty start.
- [ ] Commissioners can stage a class for every later season before the transition.
- [ ] Midseason destructive loading is impossible through both UI and API.
- [ ] 14-team classes meet the current 102-recruit requirement or use an explicit compatible policy.
- [ ] Full Season classes meet the 1,081/live-demand requirement without manually editing every recruit.
- [ ] Activation is transactional, rollback-safe, and idempotent.
- [ ] The selected class is activated instead of first generating and then deleting an auto class.
- [ ] Ten authored/procedural storylines are committed synchronously with class activation.
- [ ] Unknown story attributes and unsupported effects are rejected.
- [ ] Published/versioned imports preserve creator lineage and compatibility metadata.
- [ ] Unit, integration, E2E, scale, and seeded-soak tests pass for both league modes.

---

## 18. Copy/paste implementation brief for Replit

> Implement `REPLIT_RECRUITING_CLASS_CREATOR_SHARING_STORYLINE_AND_AI_PLAN.md` in phases. Preserve the current recruiting wizard’s generator controls, inline recruit editor, personal library, share-link mental model, commissioner Season 1 selection, later-season selection, and the existing vote/outcome engine where safe.
>
> First fix integrity: the creator’s 80-player maximum is incompatible with the game’s current 102-recruit 14-team target and 1,081-recruit 149-team Full Season target. Add exact and scalable package types with server-derived compatibility. Replace delete-then-chunk-insert loading with one transactional, idempotent activation service. Add league/season assignments, prohibit midseason replacement, and pass the staged class into the season finalizer so the game does not generate an auto class and then delete it.
>
> Introduce immutable published class versions and content hashes. Make share links point to a version. Redact exact OVR, potential, gem/bust truth, hidden abilities, story secrets, and exact choice effects from public previews. Harden tokens and preserve source lineage.
>
> Create Recruiting Class Package V2 with stable `templateRecruitId` values and an embedded `storyPlan`. Build a full-page Class Studio with server-derived targets, virtualized roster review, draft autosave, exactly ten story slots, built-in/Guided/Advanced arc authoring, branch simulation, and safe effect budgets. Authored arcs must execute exact ordered chapters and explicit transitions rather than random built-in templates.
>
> Before accepting custom arcs, allowlist every mutable rating field, implement or remove unsupported outcome fields, and make event resolution transactional/idempotent. Use seeded RNG throughout procedural recruit/story generation.
>
> Provide two assistance paths: deterministic CPU generation for all mechanics and optional generative AI for themes, cast concepts, and story text. AI must return strict structured data, pass server validation/balance compilation, remain a preview until accepted, and never publish or activate directly. For Full Season, procedurally generate bulk players and reserve AI for the ten story characters/arcs.
>
> Add the full test matrix from the plan and report migrations, changed files, commands, results, 14-team/149-team seeded outcomes, activation rollback/idempotency proof, share-preview redaction proof, and any deferred work. Do not claim completion from screenshots or a successful build alone.

---

## 19. Audit limitations

This was a source-level audit of the supplied ZIP and screenshot. The repository’s dependency lock references Replit-private package infrastructure, so a clean external install and live E2E execution were not available in this environment. Replit should run the production build, migrations, database-backed integration tests, browser tests, and scale simulations in its native workspace and attach the output to its implementation handoff.
