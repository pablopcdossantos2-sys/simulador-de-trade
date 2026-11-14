import { describe, expect, it } from "vitest";
import type { Trade, TradeEntryContext, TradeReview } from "../types";
import { buildTradeReviewContextInsights } from "./tradeReviewContextInsights";

function makeContext(zone: "GREEN" | "RED", vwap = 99): TradeEntryContext {
  const candles = Array.from({ length: 8 }, (_, index) => ({
    index,
    timestamp: `2026-11-01T10:${String(index).padStart(2, "0")}:00`,
    open: 100,
    high: 104,
    low: 98,
    close: index === 7 ? 102 : 101,
    volume: 100,
  }));
  return {
    capturedAt: "2026-11-01T13:00:00.000Z",
    marketTimestamp: "2026-11-01T10:07:00-03:00",
    asset: "WINFUT",
    candleIndex: 7,
    currentPrice: 102,
    zone,
    signal: {
      id: "signal-7",
      asset: "WINFUT",
      side: zone === "GREEN" ? "BUY" : "SELL",
      candleIndex: 7,
      timestamp: candles[7].timestamp,
      price: 102,
      label: zone === "GREEN" ? "Compra" : "Venda",
    },
    indicatorVersion: "test-v1",
    candles,
    indicatorSeries: candles.map((candle) => ({
      candleIndex: candle.index,
      wma20: 101,
      vwap,
      ema8: 102,
      ema52: 100,
      zone,
    })),
    signals: [],
  };
}

function makeTrade(
  id: string,
  index: number,
  changes: Partial<TradeReview> = {},
  zone: "GREEN" | "RED" = "GREEN",
): Trade {
  const timestamp = new Date(Date.UTC(2026, 10, index + 1)).toISOString();
  const review: TradeReview = {
    tradeId: id,
    reviewedAt: timestamp,
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
    side: zone === "GREEN" ? "BUY" : "SELL",
    signalId: `signal-${id}`,
    requestedEntry: 130000,
    entry: 130000,
    stopLoss: zone === "GREEN" ? 129900 : 130100,
    target: zone === "GREEN" ? 130200 : 129800,
    contracts: 1,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 0,
    openedAt: timestamp,
    status: "CLOSED",
    exitPrice: 130100,
    exitReason: "MANUAL_STOP",
    closedAt: timestamp,
    resultPoints: 100,
    grossResultBRL: 20,
    operationalCostsBRL: 0,
    netResultBRL: 20,
    postTradeNote: "",
    entryContext: makeContext(zone),
    review,
  };
}

describe("buildTradeReviewContextInsights", () => {
  it("relates a recurring deviation to a market zone and compares it with the baseline", () => {
    const trades = Array.from({ length: 10 }, (_, index) => makeTrade(
      `t${index}`,
      index,
      index < 3 ? { stopDiscipline: "MOVED_AGAINST_PLAN" } : {},
      index < 5 ? "RED" : "GREEN",
    ));

    const result = buildTradeReviewContextInsights(trades);
    const association = result.associations.find(
      (item) => item.dimension === "INDICATOR_ZONE" && item.patternKey === "STOP_MOVED_AGAINST_PLAN",
    );

    expect(result.reviewedWithContext).toBe(10);
    expect(result.reviewedWithoutContext).toBe(0);
    expect(association?.contextLabel).toBe("Zona vermelha");
    expect(association?.count).toBe(3);
    expect(association?.sampleSize).toBe(5);
    expect(association?.percentage).toBe(60);
    expect(association?.baselinePercentage).toBe(30);
    expect(association?.differencePercentagePoints).toBe(30);
    expect(association?.strength).toBe("RECURRENT");
  });

  it("uses VWAP distance and entry-candle properties when the snapshot supports them", () => {
    const trades = Array.from({ length: 10 }, (_, index) => {
      const trade = makeTrade(
        `t${index}`,
        index,
        index < 3 ? { emotionalInterference: "FEAR" } : {},
      );
      if (trade.entryContext && index < 5) {
        trade.entryContext = {
          ...trade.entryContext,
          indicatorSeries: trade.entryContext.indicatorSeries.map((point) => ({
            ...point,
            vwap: 103,
          })),
        };
      }
      return trade;
    });

    const result = buildTradeReviewContextInsights(trades);
    const vwapAssociation = result.associations.find(
      (item) => item.dimension === "VWAP_POSITION" && item.patternKey === "EMOTION_FEAR",
    );
    expect(vwapAssociation?.contextLabel).toBe("Abaixo da VWAP");
    expect(vwapAssociation?.count).toBe(3);
    expect(vwapAssociation?.sampleSize).toBe(5);
  });

  it("keeps older trades in asset and direction analysis but excludes them from unavailable chart context", () => {
    const trades = Array.from({ length: 6 }, (_, index) => {
      const trade = makeTrade(
        `t${index}`,
        index,
        index < 2 ? { entryExecution: "OUTSIDE_PLAN" } : {},
      );
      if (index < 3) trade.entryContext = null;
      return trade;
    });

    const result = buildTradeReviewContextInsights(trades);
    expect(result.reviewedWithContext).toBe(3);
    expect(result.reviewedWithoutContext).toBe(3);
    expect(result.contextCoveragePercentage).toBe(50);
    expect(result.associations.some((item) => item.dimension === "INDICATOR_ZONE")).toBe(false);
  });
});
