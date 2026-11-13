import { describe, expect, it } from "vitest";
import type { TradeReview } from "../types";
import { assessTradeReview } from "./tradeReview";

const base: TradeReview = {
  tradeId: "trade-1",
  reviewedAt: "2026-11-13T12:00:00.000Z",
  entryExecution: "PLANNED",
  stopDiscipline: "RESPECTED",
  targetDiscipline: "RESPECTED",
  ruleAdherence: "ALL",
  emotionalInterference: "NONE",
  lesson: "",
};

describe("assessTradeReview", () => {
  it("classifies an operation aligned with the plan without looking at P&L", () => {
    expect(assessTradeReview(base)).toBe("ALIGNED");
  });

  it("flags an entry outside the plan even if the trade might have made money", () => {
    expect(assessTradeReview({ ...base, entryExecution: "OUTSIDE_PLAN" })).toBe("NEEDS_REVIEW");
  });

  it("flags moving the stop away from the planned level", () => {
    expect(assessTradeReview({ ...base, stopDiscipline: "MOVED_AGAINST_PLAN" })).toBe("NEEDS_REVIEW");
  });

  it("treats partial adherence as partial rather than a failure", () => {
    expect(assessTradeReview({ ...base, emotionalInterference: "FEAR" })).toBe("PARTIAL");
  });

  it("accepts planned adjustments and not-applicable exit criteria", () => {
    expect(assessTradeReview({
      ...base,
      stopDiscipline: "MOVED_WITH_PLAN",
      targetDiscipline: "NOT_APPLICABLE",
    })).toBe("ALIGNED");
  });
});
