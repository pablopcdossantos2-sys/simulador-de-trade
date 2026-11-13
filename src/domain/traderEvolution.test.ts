import { describe, expect, it } from "vitest";
import { buildTraderEvolutionMetrics } from "./traderEvolution";
import type { Trade, TrainingEvent, TrainingSession } from "../types";
import type { UsageSessionRecord } from "../services/usageTracking";

const usage: UsageSessionRecord[] = [
  { id: "u1", startedAt: "2026-11-12T10:00:00.000Z", endedAt: "2026-11-12T10:10:00.000Z", lastActiveAt: "2026-11-12T10:10:00.000Z", activeSeconds: 600 },
  { id: "u2", startedAt: "2026-11-13T10:00:00.000Z", endedAt: null, lastActiveAt: "2026-11-13T10:05:00.000Z", activeSeconds: 300 },
];

const sessions: TrainingSession[] = [
  { id: "s1", asset: "WINFUT", tradeDate: "2026-11-12", startTime: "09:00", endTime: "10:00", timeframeMinutes: 2, warmupBars: 20, mode: "FREE", startedAt: "2026-11-12T10:00:00.000Z", endedAt: "2026-11-12T11:00:00.000Z", status: "ENDED" },
  { id: "s2", asset: "WINFUT", tradeDate: "2026-11-13", startTime: "09:00", endTime: "10:00", timeframeMinutes: 2, warmupBars: 20, mode: "FREE", startedAt: "2026-11-13T10:00:00.000Z", endedAt: null, status: "ACTIVE" },
];

const events: TrainingEvent[] = [
  { id: "e1", sessionId: "s1", type: "TRADE_OPENED", timestamp: "2026-11-12T10:01:00.000Z", marketTimestamp: null, signalId: "sig1", side: "BUY", reason: null, tradeId: "t1" },
  { id: "e2", sessionId: "s1", type: "TRADE_OPENED", timestamp: "2026-11-12T10:02:00.000Z", marketTimestamp: null, signalId: "sig2", side: "SELL", reason: null, tradeId: "t2" },
  { id: "e3", sessionId: "s1", type: "BLOCKED_ATTEMPT", timestamp: "2026-11-12T10:03:00.000Z", marketTimestamp: null, signalId: null, side: null, reason: "OCO inválida", tradeId: null },
];

const trades: Trade[] = [
  { id: "t1", asset: "WINFUT", side: "BUY", signalId: "sig1", requestedEntry: 130000, entry: 130000, stopLoss: 129900, target: 130200, contracts: 1, slippageTicksPerSide: 0, costPerContractRoundTripBRL: 0, openedAt: "2026-11-12T10:01:00.000Z", status: "CLOSED", exitPrice: 130200, exitReason: "TARGET", closedAt: "2026-11-12T10:02:00.000Z", resultPoints: 200, grossResultBRL: 40, operationalCostsBRL: 0, netResultBRL: 40, postTradeNote: "" },
  { id: "t2", asset: "WINFUT", side: "SELL", signalId: "sig2", requestedEntry: 130000, entry: 130000, stopLoss: 130100, target: 129800, contracts: 1, slippageTicksPerSide: 0, costPerContractRoundTripBRL: 0, openedAt: "2026-11-12T10:02:00.000Z", status: "CLOSED", exitPrice: 130100, exitReason: "STOP", closedAt: "2026-11-12T10:03:00.000Z", resultPoints: -100, grossResultBRL: -20, operationalCostsBRL: 0, netResultBRL: -20, postTradeNote: "" },
];

describe("buildTraderEvolutionMetrics", () => {
  it("separa aderência às regras de resultado financeiro", () => {
    const result = buildTraderEvolutionMetrics(usage, sessions, events, trades, new Date("2026-11-13T12:00:00.000Z"));
    expect(result.launches).toBe(2);
    expect(result.activeUsageSeconds).toBe(900);
    expect(result.totalTrades).toBe(2);
    expect(result.profitableTrades).toBe(1);
    expect(result.losingTrades).toBe(1);
    expect(result.approvedTrainingEntries).toBe(2);
    expect(result.blockedTrainingAttempts).toBe(1);
    expect(result.trainingAttemptAdherencePct).toBeCloseTo(66.666, 2);
  });

  it("não apresenta diagnóstico de consistência com histórico pequeno", () => {
    const result = buildTraderEvolutionMetrics([], [], [], [], new Date("2026-11-13T12:00:00.000Z"));
    expect(result.diagnosticTitle).toBe("Histórico em formação");
    expect(result.trainingAttemptAdherencePct).toBeNull();
  });
});
