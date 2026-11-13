import { describe, expect, it } from "vitest";
import type { Trade, TradeReview } from "../types";
import { buildTradeReviewInsights } from "./tradeReviewInsights";

function makeTrade(
  id: string,
  index: number,
  changes: Partial<TradeReview> = {},
  netResultBRL = 10,
): Trade {
  const review: TradeReview = {
    tradeId: id,
    reviewedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    entryExecution: "PLANNED",
    stopDiscipline: "RESPECTED",
    targetDiscipline: "RESPECTED",
    ruleAdherence: "ALL",
    emotionalInterference: "NONE",
    lesson: "",
    ...changes,
  };
  return {
    id,
    asset: "WINFUT",
    side: "BUY",
    signalId: `signal-${id}`,
    requestedEntry: 130000,
    entry: 130000,
    stopLoss: 129900,
    target: 130200,
    contracts: 1,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 0,
    openedAt: review.reviewedAt,
    status: "CLOSED",
    exitPrice: 130100,
    exitReason: "MANUAL_STOP",
    closedAt: review.reviewedAt,
    resultPoints: netResultBRL / 0.2,
    grossResultBRL: netResultBRL,
    operationalCostsBRL: 0,
    netResultBRL,
    postTradeNote: "",
    review,
  };
}

describe("buildTradeReviewInsights", () => {
  it("does not call a single occurrence a recurring pattern", () => {
    const trades = Array.from({ length: 6 }, (_, i) => makeTrade(
      `t${i}`,
      i,
      i === 0 ? { stopDiscipline: "MOVED_AGAINST_PLAN" } : {},
    ));
    const result = buildTradeReviewInsights(trades);
    const stopPattern = result.patterns.find((pattern) => pattern.key === "STOP_MOVED_AGAINST_PLAN");
    expect(stopPattern?.strength).toBe("EARLY_SIGNAL");
    expect(result.recurrentPatterns).toBe(0);
  });

  it("identifies repeated behaviors only after a minimum sample", () => {
    const trades = Array.from({ length: 10 }, (_, i) => makeTrade(
      `t${i}`,
      i,
      i < 3 ? { stopDiscipline: "MOVED_AGAINST_PLAN" } : {},
    ));
    const result = buildTradeReviewInsights(trades);
    const stopPattern = result.patterns.find((pattern) => pattern.key === "STOP_MOVED_AGAINST_PLAN");
    expect(stopPattern?.strength).toBe("RECURRENT");
    expect(stopPattern?.count).toBe(3);
    expect(stopPattern?.percentage).toBe(30);
  });

  it("detects profitable trades closed early before the target", () => {
    const trades = [
      ...Array.from({ length: 4 }, (_, i) => makeTrade(`win${i}`, i, {}, 20)),
      makeTrade("early-win", 5, { targetDiscipline: "CLOSED_EARLY" }, 5),
      makeTrade("early-loss", 6, { targetDiscipline: "CLOSED_EARLY" }, -5),
    ];
    const result = buildTradeReviewInsights(trades);
    const pattern = result.patterns.find((item) => item.key === "PROFIT_CLOSED_EARLY");
    expect(pattern?.count).toBe(1);
    expect(pattern?.sampleSize).toBe(5);
    expect(pattern?.percentage).toBe(20);
  });

  it("compares the latest ten reviews with the previous ten", () => {
    const trades = Array.from({ length: 20 }, (_, i) => makeTrade(
      `t${i}`,
      i,
      i < 5 ? { entryExecution: "OUTSIDE_PLAN" } : {},
    ));
    const result = buildTradeReviewInsights(trades);
    const entryPattern = result.patterns.find((pattern) => pattern.key === "ENTRY_OUTSIDE_PLAN");
    expect(result.comparisonAvailable).toBe(true);
    expect(entryPattern?.trend).toBe("IMPROVING");
    expect(entryPattern?.recentPercentage).toBe(0);
    expect(entryPattern?.previousPercentage).toBe(50);
  });

  it("returns an empty analysis when no behavior deviations were recorded", () => {
    const trades = [makeTrade("t1", 0), makeTrade("t2", 1)];
    const result = buildTradeReviewInsights(trades);
    expect(result.reviewedTrades).toBe(2);
    expect(result.patterns).toHaveLength(0);
    expect(result.comparisonAvailable).toBe(false);
  });
});
