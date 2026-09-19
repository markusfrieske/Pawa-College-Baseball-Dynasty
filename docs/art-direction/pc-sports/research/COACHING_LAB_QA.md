# Coaching lab review evidence — September 19, 2026

Scope: standalone fictional-data prototype, not a production milestone completion. Files: coaching-lab.html/js/css and coaching-room.md. No game APIs, migrations, save edits or external posting. Preview uses the existing read-only player-library server. No independent-agent audit or human enjoyment approval is claimed for this proposal.

## Source and visual review

- Read repository AGENTS.md, PC UI guide, prior team/experience reference records and latest W12 batch 07 integration evidence.
- Direct browser inspection of official Eikan 2026 new-member screenshot, Hakkyu No Kiseki entrance-ceremony spotlight, and FC26 squad selection screenshot. Sources and observation/inference boundaries are linked in coaching-room.md.
- Visually reviewed Roster, Team, Recruiting, arrival spotlight, whole-class composition and both generated image previews. Reused approved original assets; no reference-game art downloaded into the repository.
- Found/fixed Team detail causing document overflow at 1280×720; bounded detail pane now scrolls internally. Found/fixed class title clipping at 720p by reducing portrait height and tightening vertical rhythm. Improved low contrast in selected recruit copy. Added compact PC layout for the app's narrow review pane.
- Sample scope is 12 roster players and 5 recruits. This is not the production 30-player / large-board / pitcher-specific acceptance gate.

## Runtime checks performed through the local browser

- JavaScript passes `node --check docs/art-direction/pc-sports/coaching-lab.js`.
- Roster: pin Mateo, select Eli; comparison displays Contact -2, Power +21, Fielding -29 against Mateo.
- Team: select Julian as shortstop replacement; preview shows Contact -6, Power +5, Fielding -6; apply changes starter and exposes Mateo as the eligible bench replacement. No save writes.
- Recruiting: scout Julian once; budget goes from 5 to 4, ranges narrow, Potential stays Unknown, repeat scout is disabled. Pitching filter selects the one pitching prospect. Source review confirms costs are guarded and watchlist toggles remain local.
- Arrival: begin → anticipation → individual spotlight → class; selected class identity and reduced-motion checkbox visible. Escape from a focused arrival control skips to class. Restart and selected-player controls are present; no timed director's-cut sequence is claimed.
- Geometry: all four selected screens at 1280×720, 1366×768 and 1920×1080 reported no document horizontal or vertical overflow (12 combinations). Default app viewport 1039×1062 also passed all four. This is DOM geometry evidence, not exhaustive visual/zoom certification; the larger screenshot capture was cropped by the host surface.
- Class PNG preview generated at 1920×1080; player PNG at 1200×1500. Browser DOM confirms PNG data URLs and filenames. Both generated previews visually inspected. Download link clicked; the in-app browser's download-event observer timed out, so a file arriving in the operating system's Downloads folder is **not verified**. Changed initial automatic-download interaction into an explicit preview-and-download flow.
- Browser error/warning log inspection returned no entries at the checked point.

## Still required

Frisk's design review; production data and authority mapping; large-roster/unknown/error/loading/zoom and full keyboard audits; pitcher and two-way views; action persistence/failure/recovery; controller and Steam checks; real export-download confirmation; audio, video export and durable scrapbook. Reference-game cinematic timing was not verified from motion footage. This proposal's manual sequence and 650ms nameplate entrance are original recommendations.

Scheduled development remains paused. No live-game integration gate is marked complete by this artifact.
