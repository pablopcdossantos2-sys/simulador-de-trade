import { describe, expect, it } from "vitest";
import type {
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";
import {
  buildStudentProgress,
  summarizeStudentProgress,
} from "./studentProgress";

const sessions: TrainingSession[] = [
  {
    id: "s2",
    asset: "WDOFUT",
    tradeDate: "2026-10-15",
    startTime: "09:00",
    endTime: "12:00",
    timeframeMinutes: 2,
    warmupBars: 260,
    mode: "EXAM",
    startedAt: "2026-10-16T12:00:00Z",
    endedAt: "2026-10-16T13:00:00Z",
    status: "ENDED",
  },
  {
    id: "s1",
    asset: "WINFUT",
    tradeDate: "2026-10-14",
    startTime: "09:00",
    endTime: "12:00",
    timeframeMinutes: 2,
    warmupBars: 260,
    mode: "FREE",
    startedAt: "2026-10-15T12:00:00Z",
    endedAt: "2026-10-15T13:00:00Z",
    status: "ENDED",
  },
  {
    id: "active",
    asset: "WINFUT",
    tradeDate: "2026-10-16",
    startTime: "09:00",
    endTime: "12:00",
    timeframeMinutes: 2,
    warmupBars: 260,
    mode: "EXAM",
    startedAt: "2026-10-16T14:00:00Z",
    endedAt: null,
    status: "ACTIVE",
  },
];

function trade(id: string, asset: Trade["asset"], result: number): Trade {
  return {
    id,
    asset,
    side: "BUY",
    signalId: "sig",
    requestedEntry: 100,
    entry: 100,
    stopLoss: 90,
    target: 120,
    contracts: 1,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 0,
    openedAt: "2026-10-14T09:00:00",
    status: "CLOSED",
    exitPrice: 100 + result,
    exitReason: result >= 0 ? "TARGET" : "STOP",
    closedAt: "2026-10-14T09:10:00",
    resultPoints: result,
    grossResultBRL: result,
    operationalCostsBRL: 0,
    netResultBRL: result,
    postTradeNote: "",
  };
}

const events: TrainingEvent[] = [
  {
    id: "e1",
    sessionId: "s1",
    type: "TRADE_OPENED",
    timestamp: "",
    marketTimestamp: null,
    signalId: "sig",
    side: "BUY",
    reason: null,
    tradeId: "t1",
  },
  {
    id: "e2",
    sessionId: "s1",
    type: "TRADE_CLOSED",
    timestamp: "",
    marketTimestamp: null,
    signalId: "sig",
    side: "BUY",
    reason: "TARGET",
    tradeId: "t1",
  },
  {
    id: "e3",
    sessionId: "s2",
    type: "TRADE_OPENED",
    timestamp: "",
    marketTimestamp: null,
    signalId: "sig2",
    side: "BUY",
    reason: null,
    tradeId: "t2",
  },
  {
    id: "e4",
    sessionId: "s2",
    type: "TRADE_CLOSED",
    timestamp: "",
    marketTimestamp: null,
    signalId: "sig2",
    side: "BUY",
    reason: "STOP",
    tradeId: "t2",
  },
  {
    id: "e5",
    sessionId: "s2",
    type: "BLOCKED_ATTEMPT",
    timestamp: "",
    marketTimestamp: null,
    signalId: null,
    side: "BUY",
    reason: "Sem sinal",
    tradeId: null,
  },
  {
    id: "e6",
    sessionId: "s2",
    type: "SIGNAL_IGNORED",
    timestamp: "",
    marketTimestamp: null,
    signalId: "sig3",
    side: "SELL",
    reason: null,
    tradeId: null,
  },
];

describe("evolução do aluno", () => {
  it("usa somente sessões encerradas e preserva ordem cronológica", () => {
    const points = buildStudentProgress(
      sessions,
      events,
      [trade("t1", "WINFUT", 20), trade("t2", "WDOFUT", -10)],
    );

    expect(points.map((point) => point.sessionId)).toEqual(["s1", "s2"]);
    expect(points[0].totalR).toBe(2);
    expect(points[1].totalR).toBe(-1);
    expect(points[1].adherencePct).toBe(50);
    expect(points[1].signalAdherencePct).toBe(50);
  });

  it("agrega o histórico sem contar sessão ativa", () => {
    const points = buildStudentProgress(
      sessions,
      events,
      [trade("t1", "WINFUT", 20), trade("t2", "WDOFUT", -10)],
    );
    const summary = summarizeStudentProgress(points);

    expect(summary.sessions).toBe(2);
    expect(summary.trades).toBe(2);
    expect(summary.totalR).toBe(1);
    expect(summary.netResultBRL).toBe(10);
    expect(summary.averageAdherencePct).toBe(75);
    expect(summary.averageSignalAdherencePct).toBe(75);
    expect(summary.blockedAttempts).toBe(1);
  });
});
