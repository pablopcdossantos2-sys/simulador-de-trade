import { describe, expect, it } from "vitest";
import type { TrainingSession } from "../types";
import { buildPracticeCalendar, calculatePracticeStreaks } from "./practiceCalendar";

function session(id: string, startedAt: string): TrainingSession {
  return {
    id,
    asset: "WINFUT",
    tradeDate: startedAt.slice(0, 10),
    startTime: "09:00",
    endTime: "10:00",
    timeframeMinutes: 2,
    warmupBars: 20,
    mode: "FREE",
    startedAt,
    endedAt: null,
    status: "ENDED",
  };
}

describe("practice calendar", () => {
  it("counts practice sessions by local calendar day and pads complete weeks", () => {
    const sessions = [
      session("a", "2026-11-02T12:00:00"),
      session("b", "2026-11-02T14:00:00"),
      session("c", "2026-11-04T12:00:00"),
    ];
    const days = buildPracticeCalendar(sessions, new Date(2026, 10, 1), new Date(2026, 10, 5));
    const second = days.find((day) => day?.dateKey === "2026-11-02");
    expect(second?.sessionCount).toBe(2);
    expect(days.length % 7).toBe(0);
  });

  it("calculates current and longest consecutive practice streaks", () => {
    const sessions = [
      session("a", "2026-11-01T12:00:00"),
      session("b", "2026-11-02T12:00:00"),
      session("c", "2026-11-03T12:00:00"),
      session("d", "2026-11-06T12:00:00"),
      session("e", "2026-11-07T12:00:00"),
    ];
    const result = calculatePracticeStreaks(sessions, new Date(2026, 10, 8, 12));
    expect(result.practiceDays).toBe(5);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(3);
  });

  it("keeps the current streak alive through a day with no session yet", () => {
    const sessions = [
      session("a", "2026-11-11T12:00:00"),
      session("b", "2026-11-12T12:00:00"),
    ];
    const result = calculatePracticeStreaks(sessions, new Date(2026, 10, 13, 9));
    expect(result.currentStreak).toBe(2);
  });
});
