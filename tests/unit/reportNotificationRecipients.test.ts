import { expect, test } from "@playwright/test";
import { reportPendingRecipientIds } from "../../server/lib/report-notification-recipients";

const game = { homeTeamId: "home", awayTeamId: "away" };
const coaches = [
  { userId: "home-user", teamId: "home" },
  { userId: "away-user", teamId: "away" },
  { userId: "commissioner", teamId: "other" },
  { userId: "other-user", teamId: "other" },
  { userId: null, teamId: "home" },
];

test("on-behalf reports notify both teams with or without an unrelated coaching role", () => {
  for (const reporterTeam of [null, "other"]) {
    expect(reportPendingRecipientIds(coaches, game, "commissioner", reporterTeam)).toEqual(["home-user", "away-user"]);
  }
});

test("normal coach reports notify only opposing coaches", () => {
  expect(reportPendingRecipientIds(coaches, game, "home-user", "home")).toEqual(["away-user"]);
  expect(reportPendingRecipientIds(coaches, game, "away-user", "away")).toEqual(["home-user"]);
});

test("duplicate coaching records and two-team membership never duplicate or self-notify", () => {
  const repeated = [...coaches, { userId: "away-user", teamId: "home" }, { userId: "home-user", teamId: "away" }];
  expect(reportPendingRecipientIds(repeated, game, "commissioner", null)).toEqual(["home-user", "away-user"]);
  expect(reportPendingRecipientIds(repeated, game, "home-user", "home")).toEqual(["away-user"]);
});

test("a participant without a user and absent teams do not produce recipients", () => {
  expect(reportPendingRecipientIds([{ userId: null, teamId: "home" }], game, "commissioner", null)).toEqual([]);
  expect(reportPendingRecipientIds(coaches, { homeTeamId: null, awayTeamId: null }, "commissioner", null)).toEqual([]);
});
