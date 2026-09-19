# Class of Nine: PC baseball dynasty vision

Status: product direction approved by Frisk on September 18, 2026. The implementation plan below is a recommendation, not a claim of implemented gameplay or a release-date commitment.

## Product promise

Build a baseball program, develop players you care about, and take those same players onto the field in approachable, responsive 2D arcade baseball. Class of Nine is being developed toward a PC release on Steam. Recruiting, roster choices and development must create differences the player can feel during games; games must create durable dynasty history.

## Approved technical direction

- Preserve and develop the existing React/TypeScript dynasty application.
- Add TypeScript/Phaser for playable baseball within the same product.
- Plan Electron desktop packaging for PC and eventual Steam distribution.
- Do not undertake a Godot conversion for this direction.
- Use original presentation inspired by the accessibility and pace of NES baseball, with modern input, legibility and saving expectations.

Phaser supports TypeScript, React integration and desktop distribution through third-party tools: [official documentation](https://docs.phaser.io/phaser/getting-started/what-is-phaser). This establishes technical suitability, not proof that our game is ready for desktop release.

## Product pillars

1. Learn the basic controls within an inning; deepen decisions through timing, pitch selection, positioning and roster strengths.
2. One player identity from recruitment through the lineup, live field, box score and career history.
3. Player input determines actions; ratings shape capabilities through documented mappings. Do not secretly preselect a hit and merely animate it.
4. Play and simulation use compatible rules and result records. Preserve the existing externally reported Power Pros companion workflow as a separate source of results.
5. Reliable saves, understandable outcomes and responsive controls are core quality requirements.

## Recommended initial scope

Windows PC, offline single-player exhibition and dynasty as the first desktop target. Prototype with one original field, two fixed teams, three-inning exhibitions, basic CPU opponents and controller/keyboard input. Campaign innings, tie rules, mercy rules, substitutions and assists require an explicit rules profile before dynasty integration; the exhibition format does not silently change dynasty rules.

Real-time online head-to-head, live play/sim switching, stadium editors and expansive commentary are deferred recommendations. Existing league-companion workflows remain supported; their online data authority is separate from offline saves. No assumption of cloud synchronization or Steam Deck verification is made.

## Development priority

Follow the [gameplay/dynasty integration plan](GAMEPLAY_DYNASTY_PLAN.md). First prove a roster-to-result round trip with a minimal match, then develop satisfying pitches and complete live balls, then a polished exhibition and dynasty slice. Keep current integrity and recovery work: playable games will depend on it.

The existing production schedule is a historical audit/remediation baseline, not a Steam release schedule. This direction does not resume scheduled development, authorize publication, or declare the current game Steam-ready.
