import { test, expect } from "@playwright/test";
import {
  buildClassEnvelope,
  extractGeneration,
  extractStoryPlan,
} from "../../server/lib/buildClassEnvelope";
import type { WizardStoryPlan } from "../../shared/schema";

const storyPlan: WizardStoryPlan = {
  mode: "authored",
  createdAt: "2026-07-17T00:00:00.000Z",
  cast: [{
    templateRecruitId: "template-1",
    arcMode: "template",
    arcTemplateKey: "late_bloomer",
  }],
};

test("class envelopes preserve authored story plans and generation metadata", () => {
  const envelope = buildClassEnvelope(
    [{ templateRecruitId: "template-1", firstName: "Pat", lastName: "Lee" }],
    "wizard",
    {
      storyPlan,
      generation: { seed: "launch-seed", version: 1 },
    },
  );

  expect(extractStoryPlan(envelope)).toEqual(storyPlan);
  expect(extractGeneration(envelope)).toEqual({ seed: "launch-seed", version: 1 });
});

test("invalid story plan shapes are not promoted from untrusted class data", () => {
  expect(extractStoryPlan({ storyPlan: { mode: "authored", cast: [] } })).toBeNull();
  expect(extractStoryPlan({ storyPlan: { mode: "other", cast: [], createdAt: "now" } })).toBeNull();
});
