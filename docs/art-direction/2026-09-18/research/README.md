# PAWA screen research — round 02

September 18, 2026. **Proposal for Frisk's manual review; no production screen implementation in this batch.** The hourly development automation is confirmed paused. This research does not approve the arrival reveal or authorize resuming scheduled work.

## What changed

The first playbook reused tables and persistent side panels across too many different jobs. A common visual identity should not force scouting, arranging a lineup, entering a result and reading a story into the same composition. This revision retains Varsity Club's forest/brass palette, typography and player identity while giving each task its own information hierarchy.

The [interactive research book](../../2026-09-17/research-book.html) contains **16 original wide-screen composition studies and 80 screen-specific briefs**. The remaining 64 entries explicitly show a written brief rather than a reused mockup. Compact interactions are specified, not implemented by the drawings. The complete inventory is 50 screen designs covering 51 explicit routes plus 30 tabs/overlays.

## Research and ownership

Three independent game-dev researchers covered disjoint screen sets; a fourth agent audited the combined proposal. Sources are official publisher/developer documentation: 15 source records representing 13 unique pages. Each record separates documented observations, proposed PAWA adaptations and features/rules that must not be copied. Older OOTP and NBA 2K manuals are historical workflow references, not current visual benchmarks. This is source research, not hands-on testing of those games.

| Research packet | Coverage | Evidence |
| --- | --- | --- |
| [Team and recruiting](team-recruiting.md) | 23 screens/tabs | [Structured briefs and references](team-recruiting.json) |
| [Competition and operations](competition-operations.md) | 28 screens/tabs | [Structured briefs and references](competition-operations.json) |
| [Setup, stories and recovery](setup-stories.md) | 29 screens/tabs | [Structured briefs and references](setup-stories.json) |

The additional College Football 26 clarity reference in the team/recruiting JSON supports placing team needs beside targets and keeping attribute order consistent across comparisons. Football eligibility, spending and progression rules are not PAWA rules.

## Screen identities to review first

| Screen | Proposed composition | First decision |
| --- | --- | --- |
| Hub | Matchday brief with a short preparation list | What needs my attention before the next game? |
| Roster | Full-width comparison list; detail opened on demand | Which player should I inspect or compare? |
| Lineup | Diamond, batting order and separate pitching context | Who belongs in this position or role? |
| Recruiting | Prioritized prospect board with needs and resources in context | Which target deserves my next action? |
| Filters | Focused editing overlay with match count | How do I narrow the current board? |
| Prospect | Scouting dossier with known and unknown attributes | Is more information or investment worthwhile? |
| Schedule | Week/series calendar | Which game needs preparation or reporting? |
| Report | Scorebook with staged entry and a review receipt | Is this supplied result complete and valid? |
| Postseason | Connected bracket with round focus | What is my team's path? |
| Commissioner | Ordered blocker and review queue | What prevents safe advancement? |
| Statistics | Named metric ladder with qualification context | Who leads this comparison, under which criteria? |
| Program | Season timeline | What defines this program's history? |
| Inbox | Correspondence with contextual decisions | What does this message require? |
| Title | Campus entrance and clear resume/new-game choice | Which program do I enter? |
| Incoming class | Portrait gallery with explicit commitment status | Who joined, and whose arrival should I spotlight? |
| Storylines | Character scene and consequence-aware choices | How do I respond to this situation? |

Shared rules: navigation stays in the game frame, with no footer tabs; reduce repeated labels and oversized panels; keep unknown, pending and official data distinct; offer keyboard-accessible actions and explicit column choices rather than relying on hidden horizontal overflow. Preserve Power Pros companion reporting/review as a distinct workflow from simulated games. No direct external-game integration is implied.

## Audit and verification

The independent combined review found five issues in the illustrative samples, all corrected before delivery:

| Finding | Severity | Reproduction / acceptance | Resolution |
| --- | --- | --- | --- |
| Duplicate athlete in lineup | Medium | Open lineup study; each named starter appears once | Replaced duplicate RF athlete |
| Commitment status omitted | Medium | Open class gallery; verbal and signed must differ | Added individual status labels |
| Statistical qualification absent | Medium | Open stats study; comparison basis must be visible | Explicit fictional PA qualification and sample basis |
| Search selection and detail diverged | Medium | Search after selecting an unrelated screen; detail must match selection | Search now renders the selected matching brief |
| Compact diagrams overstate interaction | Medium | Compare bracket/inbox diagram with compact brief | Caption explicitly limits diagram to wide-screen composition; compact behavior remains proposed |

Visual inspection also found a gallery CSS class collision expanding cinematic thumbnails; the cinematic scene rule is now scoped to study content.

Validation: assembler verifies all 80 IDs and source mappings; JavaScript syntax check passed; local browser verification passed **407 assertions** across all 80 briefs, 16 studies and widths 1440, 1280, 768, 390 and 320. Checks cover selection/search synchronization, source counts, image loading, page overflow, compact gallery glyphs and zero page errors. [Gallery](screens/composition-gallery.png), [wide lineup](screens/diamond-1440.png) and [narrow reflow](screens/diamond-390.png) preserve visual evidence. This verifies the review artifact, not production gameplay, controller support, Steam readiness or player enjoyment.

Rebuild the static data with `node scripts/build-screen-research.mjs`. The existing local art preview server serves `research-book.html`. No backend or production-data access is needed.

## Next manual decision

Recommended first review: roster, recruiting and game reporting, because these connect daily coaching with the online-league companion. Frisk chooses the next development slice. Do not auto-implement the 80 briefs, close production findings from these illustrations, or resume the paused automation.
