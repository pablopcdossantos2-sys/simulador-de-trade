import { describe, expect, it } from "vitest";
import type {
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";
import {
  calculateSessionPerformance,
  classifyTrainingEvent,
  performanceByHour,
} from "./sessionReport";

const session: TrainingSession = {
  id: "s1",
  asset: "WINFUT",
  tradeDate: "2026-10-14",
  startTime: "09:00",
  endTime: "12:00",
  timeframeMinutes: 2,
  warmupBars: 260,
  startedAt: "2026-10-16T12:00:00Z",
  endedAt: "2026-10-16T13:00:00Z",
  status: "ENDED",
};

const events: TrainingEvent[] = [
  {
    id: "e1",
    sessionId: "s1",
    type: "TRADE_OPENED",
    timestamp: "",
    marketTimestamp: "2026-10-14T09:15:00",
    signalId: "sig1",
    side: "BUY",
    reason: null,
    tradeId: "t1",
  },
  {
    id: "e2",
    sessionId: "s1",
    type: "TRADE_CLOSED",
    timestamp: "",
    marketTimestamp: "2026-10-14T09:20:00",
    signalId: "sig1",
    side: "BUY",
    reason: "TARGET",
    tradeId: "t1",
  },
  {
    id: "e3",
    sessionId: "s1",
    type: "TRADE_OPENED",
    timestamp: "",
    marketTimestamp: "2026-10-14T10:00:00",
    signalId: "sig2",
    side: "SELL",
    reason: null,
    tradeId: "t2",
  },
  {
    id: "e4",
    sessionId: "s1",
    type: "TRADE_CLOSED",
    timestamp: "",
    marketTimestamp: "2026-10-14T10:05:00",
    signalId: "sig2",
    side: "SELL",
    reason: "STOP",
    tradeId: "t2",
  },
  {
    id: "e5",
    sessionId: "s1",
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
    sessionId: "s1",
    type: "TECHNICAL_ISSUE",
    timestamp: "",
    marketTimestamp: null,
    signalId: null,
    side: null,
    reason: "Falha de leitura",
    tradeId: null,
  },
];

const trades: Trade[] = [
  {
    id: "t1",
    asset: "WINFUT",
    side: "BUY",
    signalId: "sig1",
    requestedEntry: 130000,
    entry: 130000,
    stopLoss: 129900,
    target: 130150,
    contracts: 1,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 1,
    openedAt: "2026-10-14T09:15:00",
    status: "CLOSED",
    exitPrice: 130150,
    exitReason: "TARGET",
    closedAt: "2026-10-14T09:20:00",
    resultPoints: 150,
    grossResultBRL: 30,
    operationalCostsBRL: 1,
    netResultBRL: 29,
  },
  {
    id: "t2",
    asset: "WINFUT",
    side: "SELL",
    signalId: "sig2",
    requestedEntry: 130100,
    entry: 130100,
    stopLoss: 130200,
    target: 129950,
    contracts: 1,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 1,
    openedAt: "2026-10-14T10:00:00",
    status: "CLOSED",
    exitPrice: 130200,
    exitReason: "STOP",
    closedAt: "2026-10-14T10:05:00",
    resultPoints: -100,
    grossResultBRL: -20,
    operationalCostsBRL: 1,
    netResultBRL: -21,
  },
];

describe("relatório por sessão", () => {
  it("separa disciplina de problema técnico", () => {
    expect(classifyTrainingEvent(events[4])).toBe("DISCIPLINE");
    expect(classifyTrainingEvent(events[5])).toBe("TECHNICAL");
  });

  it("calcula métricas financeiras em pontos", () => {
    const result = calculateSessionPerformance(session, events, trades);

    expect(result.totalTrades).toBe(2);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.winRatePct).toBe(50);
    expect(result.netPoints).toBe(50);
    expect(result.payoff).toBe(1.5);
    expect(result.profitFactor).toBe(1.5);
    expect(result.buyNetPoints).toBe(150);
    expect(result.sellNetPoints).toBe(-100);
    expect(result.totalR).toBeCloseTo(0.5, 6);
    expect(result.expectancyR).toBeCloseTo(0.25, 6);
    expect(result.maxDrawdownPoints).toBe(100);
    expect(result.grossResultBRL).toBe(10);
    expect(result.operationalCostsBRL).toBe(2);
    expect(result.netResultBRL).toBe(8);
    expect(result.blockedAttempts).toBe(1);
    expect(result.technicalIssues).toBe(1);
    expect(result.executionAdherencePct).toBeCloseTo(66.666, 2);
  });

  it("agrupa resultado por horário da entrada", () => {
    expect(performanceByHour(trades)).toEqual([
      { hour: "09:00", trades: 1, netPoints: 150 },
      { hour: "10:00", trades: 1, netPoints: -100 },
    ]);
  });
});
