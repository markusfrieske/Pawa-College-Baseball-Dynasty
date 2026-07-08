---
name: OCR name normalization must collapse whitespace
description: Lesson from Power Pros batting-screenshot OCR dedupe — normalizing a name for matching/dedup keys must collapse internal whitespace runs, not just strip non-letters and trim.
---

When building a dedupe/match key from OCR-extracted text (e.g. player names), stripping
non-letter characters and trimming the ends is not enough — OCR reads of the same name
across different screenshots can differ in *internal* spacing (extra/missing spaces from
scroll-boundary artifacts). A normalizer that does `.replace(/[^a-z\s]/g,"").trim()` without
also collapsing `\s+` to a single space will treat "randy walker" and "randy   walker" as
different keys, silently defeating dedup.

**Why:** Found via a unit test for `client/src/lib/ocr-batting-merge.ts`'s
`normalizeOcrName` — two screenshots of the same unmatched (non-roster) player produced two
rows instead of merging into one, because of this whitespace gap.

**How to apply:** Any time you write a "normalize this OCR/user text for matching" function,
include a `.replace(/\s+/g, " ")` step, and add a test case with irregular internal spacing
to catch regressions.
