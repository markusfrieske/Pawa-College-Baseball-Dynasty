import { test, expect } from "@playwright/test";
import { reportOverrideReasonError, REPORT_OVERRIDE_REASON_MAX_LENGTH } from "../../shared/reporting";

test("on-behalf reasons require intentional nonblank text", () => {
  for (const reason of [undefined, null, false, 5, {}, [], "", " \n\t "]) expect(reportOverrideReasonError(reason)).not.toBeNull();
  expect(reportOverrideReasonError("  Both coaches supplied the agreed result.  ")).toBeNull();
});

test("reason length uses the normalized audit text boundary", () => {
  expect(reportOverrideReasonError("x".repeat(REPORT_OVERRIDE_REASON_MAX_LENGTH))).toBeNull();
  expect(reportOverrideReasonError("  " + "x".repeat(REPORT_OVERRIDE_REASON_MAX_LENGTH) + "  ")).toBeNull();
  expect(reportOverrideReasonError("x".repeat(REPORT_OVERRIDE_REASON_MAX_LENGTH + 1))).not.toBeNull();
});
