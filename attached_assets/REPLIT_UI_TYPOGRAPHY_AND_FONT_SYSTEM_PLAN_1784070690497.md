# Replit Implementation Plan: UI Typography and Font Polish

## Purpose

Replace the current page-wide pixel typography with a polished, readable sports-management type system while retaining the game's retro identity through color, art direction, borders, icons, motion, and a very limited brand accent.

This is a presentation-layer project. Do not change dynasty simulation, progression, recruiting balance, save data, permissions, phase advancement, Full Season behavior, or 14-team multiplayer behavior while implementing it.

## Required outcome

The game should read like a modern desktop sports-management title with retro flavor, not like an entire interface rendered on an 8-bit scoreboard.

After this work:

- Navigation, controls, tables, forms, cards, tooltips, badges, and body copy use smooth vector fonts.
- Text has consistent baselines, line heights, weights, and spacing.
- No normal gameplay text is smaller than 12 CSS pixels.
- Numbers align cleanly in standings, ratings, budgets, schedules, and scoreboards.
- The interface remains readable at Windows display scaling of 100%, 125%, and 150%.
- Full Season's data-heavy screens and the 14-team multiplayer readiness/commissioner screens remain usable without clipping or crowding.
- Fonts work without an internet connection, which is necessary for a future packaged Steam build.

## Audit findings from the current repository

Audit date: July 14, 2026.

The reported screenshot issue is systemic, not isolated to the league dashboard.

- `font-pixel` appears **1,866 times** in `client/src`.
- It is present in **108 runtime source files**.
- There are **2,570 uses of arbitrary 5-11 px text sizes** in `client/src`.
- At least **175 pixel-font uses are combined with aggressive tracking or tight line-height patterns**.
- `client/index.html` downloads `Press Start 2P`, `DotGothic16`, and Inter from Google Fonts.
- `tailwind.config.ts` maps `font-pixel` to `Press Start 2P`, then `DotGothic16`.
- `client/public/sw.js` contains special handling for the Google Fonts domains.
- `RetroButton` applies `font-pixel uppercase tracking-wider` to every button and uses 8 px for small buttons and 10 px for medium buttons.
- `RetroCardHeader`, `RetroInput`, `RetroSelect`, and `TeamBadge` also apply the pixel face at the shared-component level.
- The season progress labels are 7-8 px pixel text with opacity as low as 30%.
- The league hub uses 7-10 px pixel text for the league title metadata, role badges, phase badge, progress badge, panel headings, card labels, and readiness status.

These patterns explain the screenshot:

1. `Press Start 2P` is intentionally blocky and has unusual internal spacing. It is being treated as a general UI font.
2. Rendering it at 5-10 px makes its bitmap-like construction break down on common desktop scaling factors.
3. Uppercase plus `tracking-wider` spreads some controls while the font's wide glyph cells crowd other controls.
4. `leading-none` and very small fixed-height containers create inconsistent vertical centering.
5. The same visual voice is used for page titles, card headings, buttons, badges, table labels, stats, and secondary text, so the interface has little hierarchy.
6. Remote font loading can produce fallback-font reflow or a visually different offline experience.

### High-impact files to address first

- `client/index.html`
- `client/public/sw.js`
- `tailwind.config.ts`
- `client/src/index.css`
- `client/src/components/ui/retro-button.tsx`
- `client/src/components/ui/retro-card.tsx`
- `client/src/components/ui/retro-input.tsx`
- `client/src/components/ui/retro-select.tsx`
- `client/src/components/ui/team-badge.tsx`
- `client/src/pages/league-view.tsx`
- `client/src/pages/league-view/tabs/phase-banners.tsx`
- `client/src/pages/league-view/tabs/waiting-on-widget.tsx`
- `client/src/pages/league-view/dashboard-widgets.tsx`

## Design direction

### Principle: retro sports broadcast, modern management UI

Keep the existing forest green, gold, stadium art, score treatments, team colors, sound, and compact sports-data layout. Remove pixel typography as the default source of retro identity.

Use typography in three roles:

| Role | Recommended face | Use | Do not use for |
|---|---|---|---|
| UI | Inter Variable | Navigation, buttons, body, forms, badges, table labels, player names | Decorative branding |
| Sports display | Barlow Semi Condensed, weights 600-800 | Page titles, hero season title, major panel titles, postseason moments | Paragraphs, dense table bodies, tiny badges |
| Data | IBM Plex Mono, weights 500-700 | Scores, records, OVR, money, ranks, countdowns, innings, aligned ratings | Long sentences or buttons |

All three should be self-hosted as WOFF2 files with their license files stored in the repository. Prefer variable files where available, but only include the character subsets and weights the product actually uses.

If adding the display and data families is deferred, phase one may use the already-selected Inter face for everything. Do not defer the size, line-height, offline-loading, or shared-component fixes.

### Pixel-font policy

Default decision: remove `Press Start 2P` and `DotGothic16` from all runtime gameplay UI.

The only permitted exception is a deliberately approved `GameWordmark` or splash-screen logo. If the wordmark remains live text:

- Give it its own `font-brand-pixel` token.
- Use it only in `client/src/components/brand/GameWordmark.tsx`.
- Render it at 16 px or larger.
- Do not use it for buttons, headings, tables, badges, forms, navigation, stats, or status text.
- Do not combine it with text shadow, wide tracking, transforms, or reduced opacity.

Do not simply remap the existing `font-pixel` class to another face. That would leave 1,866 places with the wrong semantics, tiny sizes, and inconsistent layout. Migrate the components to semantic typography roles, then remove or tightly restrict the old token.

## Typography tokens

Use a 4 px baseline grid and the following minimum type scale. These are CSS pixel targets at 100% zoom.

| Token | Font | Size / line height | Weight | Tracking | Typical use |
|---|---|---:|---:|---:|---|
| `type-display` | Sports display | 32 / 38 | 750 | -0.01em | Championship or signing-day hero only |
| `type-page-title` | Sports display | 24 / 30 | 700 | 0 | League, roster, recruiting page title |
| `type-hero-title` | Sports display | 22 / 28 | 700 | 0.01em | Season/week over hero image |
| `type-section-title` | Sports display | 16 / 22 | 700 | 0.02em | Major card and panel headings |
| `type-subheading` | UI | 14 / 20 | 650 | 0 | Modal and nested section headings |
| `type-body` | UI | 14 / 21 | 400 | 0 | Default copy and names |
| `type-body-strong` | UI | 14 / 21 | 600 | 0 | Emphasis and primary row labels |
| `type-secondary` | UI | 13 / 18 | 450 | 0 | Metadata and supporting copy |
| `type-label` | UI | 12 / 16 | 650 | 0.04em max | Short labels and table headers |
| `type-caption` | UI | 12 / 16 | 450 | 0 | Help text and timestamps |
| `type-button` | UI | 13 / 18 | 650 | 0.01em | All text buttons |
| `type-stat-xl` | Data | 28 / 32 | 650 | -0.02em | Hero score or key total |
| `type-stat-lg` | Data | 22 / 28 | 650 | OVR, money, record, ranking |
| `type-stat` | Data | 14 / 20 | 550 | Table values and compact ratings |
| `type-badge` | UI | 12 / 16 | 650 | Phase, role, status, hand, position |

Rules:

- The runtime UI floor is 12 px. Do not create `text-[5px]` through `text-[11px]` replacements.
- Use all caps only for short labels of roughly 18 characters or fewer.
- Use title case or sentence case for buttons and headings. Do not uppercase full messages.
- Maximum tracking for normal labels is `0.04em`; do not use `tracking-wider` or `tracking-widest` as a default.
- Headings use at least 1.2 line height. Body text uses approximately 1.45-1.55.
- Do not use `leading-none` on words, headings, buttons, badges, or labels. It is acceptable only for a single oversized numeric glyph where the bounding box is verified.
- Do not use synthetic weights. Load every weight that the CSS requests, or use a variable font range.
- Use `font-variant-numeric: tabular-nums` for scores, budgets, ranks, records, dates, timers, ratings, and tables.
- Use `font-variant-numeric: slashed-zero` only if the selected data font supports it and usability testing prefers it.
- Prefer truncation only for secondary content. Primary titles should wrap to two lines when space permits.

## Font loading and rendering

### Self-host the files

Place production font files under:

```text
client/public/fonts/
  inter-variable-latin.woff2
  barlow-semi-condensed-variable-latin.woff2
  ibm-plex-mono-500-latin.woff2
  ibm-plex-mono-600-latin.woff2
  OFL-Inter.txt
  OFL-Barlow-Semi-Condensed.txt
  OFL-IBM-Plex-Mono.txt
```

Use the actual filenames supplied by the font source. Do not rename files in a way that loses weight/style information. Verify the licenses before committing the assets.

Add local `@font-face` declarations in `client/src/index.css` or a dedicated imported `client/src/styles/typography.css`:

```css
@font-face {
  font-family: "Inter Variable";
  src: url("/fonts/inter-variable-latin.woff2") format("woff2-variations");
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
}

@font-face {
  font-family: "Barlow Semi Condensed Variable";
  src: url("/fonts/barlow-semi-condensed-variable-latin.woff2") format("woff2-variations");
  font-style: normal;
  font-weight: 600 800;
  font-display: swap;
}

@font-face {
  font-family: "IBM Plex Mono";
  src: url("/fonts/ibm-plex-mono-500-latin.woff2") format("woff2");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}

@font-face {
  font-family: "IBM Plex Mono";
  src: url("/fonts/ibm-plex-mono-600-latin.woff2") format("woff2");
  font-style: normal;
  font-weight: 600;
  font-display: swap;
}
```

Add the primary UI face as a preload in `client/index.html`. Only preload the font needed for the first render. Do not preload every font and weight.

Remove:

- Google Fonts preconnect tags.
- The Google Fonts stylesheet link.
- Production service-worker rules for `fonts.googleapis.com` and `fonts.gstatic.com`.
- Inline `fontFamily: "'Press Start 2P', monospace"` usage in the runtime client.

The packaged game must render correctly with the browser network set to offline.

### Global rendering defaults

Set explicit, stable defaults:

```css
:root {
  --font-ui: "Inter Variable", Inter, "Segoe UI", Arial, sans-serif;
  --font-display: "Barlow Semi Condensed Variable", "Arial Narrow", "Segoe UI", sans-serif;
  --font-data: "IBM Plex Mono", "Cascadia Mono", Consolas, monospace;
}

html {
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

body {
  font-family: var(--font-ui);
  font-size: 1rem;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tabular-nums,
.type-stat,
.type-stat-lg,
.type-stat-xl {
  font-variant-numeric: tabular-nums;
}
```

Do not use CSS transforms to resize or position text. Transformed ancestors can also change text rasterization, so remove unnecessary `scale`, fractional translate, and zoom effects from static text containers. Button press animation may scale the whole button briefly, but its resting state must not be transformed.

## Tailwind configuration

Replace the font mapping in `tailwind.config.ts` with semantic roles:

```ts
fontFamily: {
  sans: ["Inter Variable", "Inter", "Segoe UI", "Arial", "sans-serif"],
  display: ["Barlow Semi Condensed Variable", "Arial Narrow", "Segoe UI", "sans-serif"],
  data: ["IBM Plex Mono", "Cascadia Mono", "Consolas", "monospace"],
},
fontSize: {
  "ui-xs": ["0.75rem", { lineHeight: "1rem" }],
  "ui-sm": ["0.8125rem", { lineHeight: "1.125rem" }],
  "ui": ["0.875rem", { lineHeight: "1.3125rem" }],
  "section": ["1rem", { lineHeight: "1.375rem" }],
  "page": ["1.5rem", { lineHeight: "1.875rem" }],
},
letterSpacing: {
  label: "0.04em",
},
```

Do not retain `pixel` as a general Tailwind family. If the approved brand exception is kept, name it `brand-pixel` so its limited purpose is obvious.

## Semantic typography primitives

Create `client/src/components/ui/typography.tsx`. Implement a small set of typed primitives or CVA variants:

- `PageTitle`
- `HeroTitle`
- `SectionTitle`
- `Subheading`
- `BodyText`
- `MetaText`
- `LabelText`
- `StatValue`
- `DataText`

Requirements:

- Support an `as` prop so heading semantics remain correct.
- Apply font family, size, line height, weight, tracking, and numeric features together.
- Accept `className` for color and layout, not for overriding font size or line height in normal use.
- Do not make every element a React component if it adds complexity; equivalent named component-layer classes are acceptable. The important requirement is one semantic source of truth.

Suggested component-layer classes:

```css
@layer components {
  .type-page-title {
    @apply font-display text-page font-bold tracking-normal;
  }

  .type-section-title {
    @apply font-display text-section font-bold tracking-[0.02em];
  }

  .type-label {
    @apply font-sans text-ui-xs font-semibold tracking-label;
  }

  .type-body {
    @apply font-sans text-ui font-normal tracking-normal;
  }

  .type-stat-lg {
    @apply font-data text-[1.375rem] leading-7 font-semibold tracking-tight tabular-nums;
  }
}
```

## Shared-component changes

Shared primitives are the fastest and safest way to improve the whole app.

### `RetroButton`

The component may keep its name for compatibility, but its text treatment must become modern.

- Change base text to UI font, 600-650 weight, normal/title case, and 0-0.01em tracking.
- Remove default `uppercase`, `font-pixel`, and `tracking-wider`.
- Use explicit minimum heights rather than only vertical padding.
- Recommended sizes:
  - small: minimum 36 px, 12-13 px text, 14 px icon;
  - medium: minimum 40 px, 13 px text, 16 px icon;
  - large: minimum 44 px, 14 px text, 16-18 px icon;
  - icon: 36/40/44 px square by context, with an accessible name.
- Ensure icons use `shrink-0` and do not inherit odd line-height.
- Keep a 6-8 px icon/text gap. Remove redundant icon margins when `gap` already handles spacing.
- Preserve focus-visible treatment and disabled/loading states.
- Press animation may use `active:scale-[0.98]`; it must not be present at rest.

### `RetroCardHeader`

- Use `type-section-title` rather than pixel text.
- Do not force uppercase at the wrapper level.
- Default bottom margin should be 12 px, adjusted by actual card density.
- Allow actions such as “View” or “Manage” to use `type-caption`, not the heading style.

### `RetroInput` and `RetroSelect`

- Labels use `type-label`, at least 12/16.
- Values and options use `type-body`, at least 14/20.
- Controls have a minimum 40 px height on desktop and 44 px on touch layouts.
- Error/help text uses 12/16 and reserves enough vertical space to avoid layout jumps.
- Do not use pixel text in native `<option>` elements.

### `TeamBadge`

- Replace the pixel face with UI or data font at 700 weight.
- Increase the smallest badge if necessary so abbreviations are at least 12 px.
- Use true optical centering with flex; do not compensate with relative top/left offsets.
- Test 2-, 3-, and 4-character abbreviations.

### Dialogs, dropdowns, tooltips, tabs, and badges

- Dialog title: sports display 18-20/24, not `leading-none`.
- Dialog description and fields: UI 14/21.
- Menus and dropdown items: UI 13-14/20, minimum 36 px row height.
- Tooltips: UI 12/16 and a sensible maximum width.
- Tabs: UI 13/18 at 600, or sports display 14/20 for major page tabs.
- Badges: UI 12/16 at 600-700; no wide tracking.
- Badge padding must provide at least a 20 px visual height.

## Screenshot-specific league hub redesign

Use the supplied commissioner preseason screenshot as the first migration target and visual baseline.

| Current element | New treatment |
|---|---|
| Dynasty name `test` | `PageTitle`, 22-24/28-30, sports display, title case |
| `S1 W1` | UI metadata, 12/16, medium-contrast |
| `Spring`, `COMM`, `PROG` pills | UI badge, 12/16, 650, maximum 0.03em tracking |
| Commissioner button | UI button, 13/18, title case `Commissioner` when room allows |
| Phase progress `SPR REG CONF SUPR CWS OFF` | UI label, 12/16; use opacity on the track, not below 60% on the text |
| Hero `COMMISSIONER · Spring` | UI label, 12/16, 600 |
| Hero `Season 1 · Week 1` | Sports display 22/28, 700 |
| `PRESEASON`, `PROGRAM`, `RECRUITING`, `LEAGUE` | Sports display section title, 16/22, 700 |
| `ADVANCE`, `NIL BUDGET`, `AVG OVR`, `TOP PLAYER` | UI label, 12/16, 650 |
| Record, OVR, NIL amount, rank, score | Data face with tabular numbers, 22-28 px by prominence |
| Player/team names | UI 13-14/18-21, 500-600 |
| `All Ready`, `Advance Now`, `Needs Attention` | UI control/section styles, title case, no pixel font |
| Alert descriptions and links | UI 12-13/18, never 9-10 px |

Additional layout adjustments required after increasing text size:

- Let the league identity row grow naturally instead of relying on tiny text to fit.
- At narrower widths, move secondary status pills to a second row before shrinking type.
- Allow the commissioner shortcut to use an icon plus `Commissioner` at desktop width and icon plus tooltip at smaller widths.
- Give the progress-label row at least 16 px of height and separate it from the track by 4-6 px.
- Increase dashboard card header height and reduce decorative empty space if necessary. Do not shrink text to preserve current card heights.
- Use 12 px gaps between a label and its stat group, and 4 px between a stat and its supporting caption.
- Make secondary text brighter than the current 30% phase labels. Disabled/unavailable text still needs to be legible.

## Full Season and 14-team multiplayer considerations

### Full Season / 149 teams

Data-heavy screens need density without microscopic text.

- Rankings, standings, recruiting, stats, records, schedules, roster tables, postseason brackets, and archive screens use 12 px table headers and 13 px table bodies.
- Compact mode may reduce row padding, not font size. Recommended compact row height is 32-36 px.
- Use sticky headers, horizontal scrolling, column visibility, abbreviation, and responsive detail drawers instead of 5-10 px text.
- Numeric columns use the data face, tabular figures, and right alignment.
- Team/player name columns use the UI face and retain more width than numeric columns.
- On small screens, show the essential columns and move the rest into a detail view.
- Postseason brackets may use 12 px labels with scalable spacing or horizontal pan/zoom. Do not render bracket text at 6-9 px.

### 14-team multiplayer custom leagues

- The readiness widget must fit all 14 coaches without reducing text. Use wrapping chips or a scrollable roster list with 12-13 px names.
- Long school and coach names must truncate with a title/tooltip or wrap to two lines; status icons and counts remain visible.
- Commissioner controls must use the same button and dialog typography as the rest of the app.
- Ready counts, deadlines, countdowns, phase dates, and records use tabular numerals.
- Test the status widget at 0/14, 1/14, 13/14, and 14/14 ready.
- Test commissioner-only leagues where there is no human-controlled team, as in the supplied screenshot.

## Migration strategy

Do not run an unreviewed global replacement. Larger, smoother fonts change intrinsic width and height. Migrate by semantic surface and correct each layout as it changes.

### Phase 0: capture the baseline

1. Save screenshots of the current league hub and the key pages listed below at desktop and mobile widths.
2. Record the audit counts for `font-pixel`, inline `Press Start 2P`, and 5-11 px arbitrary sizes.
3. Add a temporary migration checklist grouped by route/component.
4. Confirm that no font or UI work changes API contracts, database schema, or game state.

### Phase 1: font assets and design tokens

1. Add the self-hosted font files and licenses.
2. Add `@font-face` declarations and global rendering defaults.
3. Remove the Google Fonts link and preconnects.
4. Remove Google Fonts service-worker handling.
5. Add semantic Tailwind families, sizes, tracking, and numeric utilities.
6. Add typography primitives/classes.
7. Add a production-build check that fails if required font files are missing.

Completion gate: with external network blocked, `document.fonts.check()` succeeds for the UI, display, and data faces and the page does not reflow after first paint.

### Phase 2: shared primitives

Migrate, in this order:

1. `RetroButton`
2. `RetroCardHeader`
3. `RetroInput`
4. `RetroSelect`
5. `TeamBadge`
6. standard `Button`, `Badge`, `Label`, `DialogTitle`, tabs, dropdowns, tooltips, and alerts
7. scoreboard and stat-value primitives

Review every call site that passes a font size override. Remove obsolete `text-[8px]`, `text-[10px]`, uppercase, tracking, and line-height overrides.

Completion gate: the component gallery or Storybook-style test page displays every size, variant, state, icon combination, long label, and loading state without clipping.

### Phase 3: flagship league hub

Migrate the complete screenshot route:

- command bar and league identity;
- phase/status badges;
- season progress bar;
- seasonal hero overlay;
- phase summary strip;
- readiness and advance widget;
- guidance banner;
- program, roster, recruiting, and league panels;
- needs-attention cards;
- commissioner shortcut and scheduling dialog.

Do not stop after changing the page title. The route should be a coherent reference implementation for the rest of the app.

Completion gate: approve screenshot comparisons at 1440x900, 1280x800, 1024x768, and 390x844.

### Phase 4: high-density and highest-use surfaces

Migrate in this order:

1. recruiting board, recruit detail, targets, commits, calls, scouting, visits, and NIL;
2. roster, depth chart, player profile, player editor, and development report;
3. schedule, standings, rankings, stats, record book, and team pages;
4. commissioner command center, settings, school editor, roster editor, health checks, and audit log;
5. play-by-play, scoreboards, game prep, report game, and postseason brackets;
6. inbox, storylines, archive, awards, departures, walk-ons, signing day, and remaining dialogs.

Completion gate: no migrated route contains pixel text or a visible font size below 12 px.

### Phase 5: repository cleanup and enforcement

1. Remove remaining runtime `font-pixel` uses.
2. Remove inline `Press Start 2P` references.
3. Remove unused font imports and configuration.
4. Delete dead CSS overrides created to nudge pixel glyphs into place.
5. Rename `RetroButton` and `RetroCard` only if desired; this is not required for visual completion.
6. Document the type system in `replit.md` so future generated UI follows it.

## Automated guardrails

Add `script/check-typography.ts` and a package script such as `npm run check:typography`.

The check should scan runtime files under `client/src` and fail on:

- `font-pixel`, except the one explicitly allowlisted wordmark file if retained;
- inline `Press Start 2P` or `DotGothic16` declarations;
- `text-[5px]` through `text-[11px]`;
- new Google Fonts production URLs;
- `tracking-wider` or `tracking-widest` combined with normal UI text;
- `leading-none` on known text-bearing shared components;
- required local font files missing from `client/public/fonts`.

An allowlist must include a reason and owner in code. Do not silently exclude entire directories.

Add the typography check to the existing `npm run check` path or CI workflow so the problem cannot gradually return.

## Playwright and visual QA plan

Create `tests/visual/typography.spec.ts` and stable test fixtures for both league modes.

### Required automated checks

- Wait for `document.fonts.ready` before screenshots.
- Verify the computed family of representative UI, display, and data elements.
- Verify no request is made to `fonts.googleapis.com` or `fonts.gstatic.com`.
- Verify the page renders with network access blocked after the app is loaded from localhost.
- Inspect visible text elements and fail if a normal UI element computes below 12 px. Maintain a tiny, reviewed exception list only if absolutely necessary.
- Verify there is no document-level horizontal overflow at each target viewport.
- Verify key buttons and tabs meet their minimum heights.
- Screenshot the league hub, recruiting, roster, standings, commissioner, postseason bracket, and a modal.

### Fixtures and stress cases

Test:

- commissioner with no assigned team;
- a Full Season league with 149 teams;
- a custom league with 14 human coaches;
- very long dynasty, school, mascot, coach, and player names;
- 2-, 3-, and 4-character school abbreviations;
- large values such as `$12.5M`, rank `149`, OVR `100`, and multi-digit records;
- 14 readiness chips and long “not ready” reasons;
- loading, empty, disabled, error, and offline states;
- narrow modal and dropdown layouts;
- 200% browser zoom.

### Manual matrix

Run the visual pass in the future desktop packaging target as well as the browser:

| Environment | Scale / viewport |
|---|---|
| Windows Chrome/Edge | 100%, 125%, and 150% display scaling |
| Desktop | 1920x1080, 1440x900, 1366x768, 1280x800 |
| Steam Deck class display | 1280x800 |
| Mobile browser support | 390x844 and 430x932 |
| Browser zoom | 100%, 125%, 150%, 200% |

At every size, inspect:

- glyph sharpness;
- consistent baselines beside Lucide icons;
- no clipped ascenders/descenders;
- no collisions between badges, buttons, and text;
- correct wrapping/truncation;
- readable inactive and disabled text;
- stable numeric columns;
- no font swap after initial paint;
- keyboard focus visibility.

## Accessibility and usability requirements

- Do not rely on small type or low opacity to create hierarchy.
- Inactive phase labels must remain readable; de-emphasize the progress track more than the text.
- Muted text must meet the applicable contrast target against its real background.
- Information must remain available at 200% zoom without two-dimensional page scrolling, except intentionally scrollable data tables or brackets.
- Controls must keep an accessible name when their visible text collapses to an icon.
- Do not encode status only through font, color, or capitalization; keep icons and explicit labels.
- Avoid long all-cap messages because they are slower to scan.
- Truncated names need a native title, tooltip, or accessible full-name alternative.

## Definition of done

This work is complete only when all of the following are true:

- [ ] Normal runtime gameplay UI contains zero `font-pixel` usages.
- [ ] If retained, pixel typography is isolated to one approved brand wordmark at 16 px or larger.
- [ ] Runtime source contains zero inline `Press Start 2P` or `DotGothic16` declarations.
- [ ] Runtime source contains zero `text-[5px]` through `text-[11px]` declarations, except a documented and visually approved exception.
- [ ] Fonts are self-hosted and work offline; production makes no Google Fonts requests.
- [ ] `RetroButton`, card headers, form controls, badges, team badges, dialogs, tabs, and tooltips use the new system.
- [ ] The league hub matches the screenshot-specific specification and has no collisions or clipped text.
- [ ] Full Season tables remain dense through spacing and column behavior, not microscopic text.
- [ ] The 14-team readiness/commissioner experience fits all coaches and long names without overlap.
- [ ] Numeric columns and key stats use tabular figures and align consistently.
- [ ] Automated typography guardrails pass.
- [ ] `npm run check` passes.
- [ ] The existing Playwright suite passes.
- [ ] New typography and visual tests pass.
- [ ] Manual QA passes at Windows 100%, 125%, and 150% scaling and at 200% browser zoom.
- [ ] No dynasty logic, save format, permissions, league-mode behavior, or phase-advance behavior changed.

## Replit handoff prompt

Copy the following instructions into Replit with this document attached:

> Implement the typography modernization plan in `REPLIT_UI_TYPOGRAPHY_AND_FONT_SYSTEM_PLAN.md` as a presentation-only change. Begin by recording baseline screenshots and audit counts. Self-host the approved fonts, establish semantic type tokens, then migrate shared primitives before changing individual routes. Use the league hub shown in the supplied screenshot as the first fully completed reference surface. Do not blanket-replace classes without reviewing layout, and do not shrink text below 12 px to make existing cards fit. Preserve all Full Season and 14-team multiplayer logic and data behavior. Add the typography source scan and Playwright visual checks described in the plan. Report the files changed, before/after audit counts, screenshots at every required viewport, font network/offline evidence, test output, and any documented exceptions. Do not claim completion until every Definition of Done checkbox has evidence.

## Evidence Replit must return

Replit's completion report should include:

1. Before and after counts for `font-pixel`, inline pixel-font declarations, and 5-11 px text.
2. A list of font files and licenses added.
3. Confirmation that no Google Fonts request occurs in production or offline testing.
4. Screenshots of the league hub at all four approval viewports.
5. Screenshots of recruiting, roster, standings, commissioner, postseason, and one representative modal.
6. A 149-team Full Season table screenshot and a 14-human readiness screenshot.
7. Output from `npm run check`, the existing test suite, the new typography check, and the new visual suite.
8. A written list of remaining exceptions, each with a reason, owner, and follow-up ticket. The target is no exceptions.

