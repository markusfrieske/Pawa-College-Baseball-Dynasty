# Class of Nine — PC sports-game interface guide

September 19: before further Roster, Team, Recruiting or Arrival art integration, read [the coaching-room follow-up](research/coaching-room.md) and review `coaching-lab.html`. Frisk requested richer coaching workflows and references to Eikan Nine 2026 and Hakkyu No Kiseki. These four new proposals are awaiting review; they do not authorize replacement of production rules or approve the cinematic.

Frisk's direction, September 18, 2026: the current screens still feel like a website. Design for PC play only. This supersedes earlier mobile-first and phone-layout targets; no mobile launch or phone interaction contract is intended. Approved Class of Nine identity and Varsity Club art direction remain in force. The proposed arrival reveal is not approved by this change.

## What the references actually show

| Game | Directly observed screen | Transferable principle | What we reject |
| --- | --- | --- | --- |
| Madden NFL 26 | Coach Central approval screen | Selected coach has presence; chapter navigation and dominant metric establish hierarchy. | Invented approval/staff mechanics and decorative portraits on every screen. |
| MLB The Show 25 | Official video free-agent ledger at 1:50 and decision scene at 2:02 | Dense player comparison and a separate identity/action/consequence composition. | Replacing useful tables with giant cards; importing MLB contract rules. |
| NHL 25 | Franchise hub and box score | Calendar/matchup context and broadcast result presentation serve different tasks. | One dashboard reused for upcoming, pending and final results. |
| FIFA / EA SPORTS FC 25 | Career hub screenshot | Task selection owns a clear scene; contextual horizontal navigation. | Social-feed clutter, store promotion and controller prompts without implementation. |
| NBA 2K26 | MyNBA roster screenshot | Large selected identity with continuous metric ledger and strong row selection. | Hidden horizontal overflow, basketball ratings and card-by-card roster stacks. |
| College Football 26 | Dynasty hub and prospect board | Program identity, pinned needs, resource context and selection-driven target detail. | Repeating actions on every row; importing football budgets or eligibility. |
| Retro Bowl | Publisher season-hub screenshot | Bounded landscape rhythm and immediately legible next action. | Mobile bottom navigation, touch targets driving density, pixel type and simplified football rules. |

Exact official links, observations, evidence type and our adaptations are in the three research packets. The team inspected source images/video frames. No one claims hands-on tests of these reference games. FC25 is the FIFA-series interface reference, not a claim that a current FIFA-branded release was examined. Sources are dated examples, not assertions that these are the latest releases.

## Non-negotiable composition rules

1. **Design a game scene, not a webpage.** The principal state and decision fit inside the PC viewport. No permanent website sidebar, breadcrumb stacks, marketing footer, floating mobile navigation, or decorative repeated heroes. Put shared program/time/mode context in a compact masthead and scoped category tabs.
2. **One visual anchor per screen.** A selected athlete owns roster/profile; a diamond owns field assignment; a series owns schedule; a score owns result review; a character moment owns story; a dated artifact owns legacy. Forms and ledgers may dominate when they are the task.
3. **Selection changes content in place.** Recruiting uses stable target detail rather than expansion that shifts the board. Roster selection exposes the same player's data and art. Keep selection and scroll position when returning from inspection.
4. **Density is deliberate.** Use uninterrupted aligned rows, tabular numbers, metric families and short label/value pairs. Large numbers signal importance. Do not spread a single data row inside an oversized rounded card. Scope optional explanation behind help or a chapter.
5. **Reserve hierarchy for the decision.** Primary action has one cream/brass selection surface. Borders divide data; they should not outline every paragraph. Use asymmetry and whitespace to guide attention, not identical grids across every route.
6. **Art carries identity.** Campus miniature establishes place; cel portraits establish people; athletic marks identify teams. Forest, brass and cream remain the material palette. Georgia bold italic belongs to the approved wordmark and selective editorial emphasis; numeric controls use legible upright type. No third-party game assets enter shipping artwork.
7. **Every state tells the truth.** Unknown, scouted range, verbal, signed, submitted, disputed, accepted and failed are different states. No decorative success check without an accepted operation. Failure and permission states retain the task context.
8. **Motion explains transitions.** Short selection and section transitions; no motion during numeric entry; skip/reduce cinematic motion. No newly invented sound layer is needed to make a screen functional. Keep existing mute preferences.

## PC interaction and scaling contract

Design at 1920×1080. Verify at 1280×720, 1366×768, 1920×1080, 2560×1440 and 3440×1440 before claiming PC coverage. Ultrawide extends atmosphere and useful comparison space; it does not stretch body text indefinitely. Windowed play is expected. Do not force browser fullscreen or claim Steam integration.

Mouse and keyboard are the first implementation target: visible focus, real Tab/Shift+Tab order, focused table arrow selection, Enter inspect/confirm, Escape cancel/back and context-aware shortcuts. Text entry captures typing normally; global shortcuts must not fire inside fields or steal native editing commands. Always show the action's actual input; no fake gamepad glyphs. Controller support requires a separate focus/activation/input-device test matrix before it can be advertised. PC-only does not waive accessibility, reduced motion, contrast, text scaling or keyboard access.

Long lists use a bounded pane, explicit counts and Page Up/Down or equivalent controls. Scrolling content remains accessible; removing a browser scrollbar must not silently clip rows. Avoid horizontal data scrolling by metric groups or explicit column sets. Do not promise arbitrary browser zoom without testing; 125% and 150% text scaling is an implementation acceptance gate, not established by this proposal.

## Screen-family assignments

- **Clubhouse:** selected weekly action + matchup scene + subject spotlight. No analytics dashboard.
- **Roster:** comparison sheet + large selected identity. **Field:** spatial assignments + batting order + pitching context. **Development:** before/after progression evidence.
- **Recruiting:** selected target operations; needs/resources remain visible. **Dossier:** known/unknown evaluation. **Comparison:** aligned same-field candidates. **Class:** status-aware portrait gallery.
- **Schedule:** week/series wall. **Prep:** opposing identities + readiness/roster actions. **Entry:** scorer room. **Pending review:** exact revision/evidence/decision. **Accepted result:** broadcast recap. These are five distinct compositions.
- **Stats:** ranked metric plane. **Standings:** competition ladder. **Postseason:** path and rounds. **Legacy:** honors/timeline. **Archive:** dated preserved season, not today's dashboard.
- **Inbox:** correspondence and response. **Stories:** character situation and consequence. **News:** edited sports edition. Do not merge them into a single social-feed template.
- **Commissioner:** obligation, authority and result. Recovery, audit, reports, save states and settings each receive the specific matrix or evidence surface their job needs.
- **Entry/setup:** continue/new/join stage, dynasty locker, focused setup choices. Authentication keeps native semantic fields without inheriting an account-dashboard appearance.

## Agent design and review procedure

For each route or overlay: state the first player decision; select one directly observed reference pattern; write what is an inference; map data and authority to concrete zones; name the website habits removed; define keyboard behavior and failure/loading/empty states. Read the exact per-screen brief before editing it. Do not map an unfamiliar screen to the nearest generic component and call it finished.

Before implementation, show a representative composition with realistic long names, full roster counts and unknown/pending states. During implementation, preserve the existing rules and versioned data contracts. At review, separately report (a) source/visual audit, (b) actual runtime tests, and (c) player enjoyment evidence. A static composition or green typecheck does not establish usability, safe saves or Steam readiness.

## Implementation sequence after this research

1. PC frame and input conventions. Replace the website sidebar; preserve destinations and unsaved-change guards. Establish sizing and focus before applying full-canvas constraints to data screens.
2. Recruiting, roster and field assignment as distinct working scenes. Replace expansion-based recruit rows with stable selection/action context; keep disclosure and budget guards. Validate against real saved data.
3. Schedule → prep → entry → exact-revision review → accepted result as an entire companion journey. Resolve W12-SCHEDULE-01 and durable draft work; do not merely restyle failed workflows.
4. Individual narrative, class, stats, legacy, entry/setup and commissioner screens from their authored briefs. Complete each against its own acceptance criteria and audit between milestones.

The review atlas provides 23 bespoke visual composition studies plus 57 individually authored schematic screen blueprints, backed by all 80 individual specifications. Schematics are not pixel-final designs. Future production implementation must be judged against the specific authored brief, not a schematic alone.

Player art refinement: read [the cel identity follow-up](PLAYER_ART_REFINEMENT.md) for Frisk's request to bring faces and cards back toward the original approved illustration. The four illustrated examples are a review target, not a complete modular kit or permission to overwrite saved appearances.

Frisk approved the refined cel style and requested 30 more varied faces with variable team colors. Use the versioned library in `client/public/art/players/v1/` and `IllustratedPlayerPortrait` for explicitly assigned illustrated identities. Read its README before integration. Never display magenta-key source PNGs directly, recolor the entire face, or derive a player's identity from their team. Source portraits are fixed illustrations; arbitrary trait editing and existing-save migration are not implemented.

## Approved portrait library integration

Frisk approved the 30 additional cel faces and variable uniform colors. [W12 batch 04](../../production/W12_BATCH_04.md) integrates explicit portrait IDs into shared game views and commissioner roster editing. Preserve legacy appearances unless an explicit assignment is saved. Automatic new-class allocation and historical portrait snapshots remain separate work; approval of the art does not approve the pending arrival cinematic.
