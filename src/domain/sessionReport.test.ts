import { describe, expect, it } from "vitest";
import type {
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";
import {
  blockedAttemptBreakdown,
  calculateSessionPerformance,
  classifyTrainingEvent,
  performanceByHour,
  performanceBySetup,
  tradeSetupLabel,
} from "./sessionReport";

const session: TrainingSession = {
  id: "s1",
  asset: "WINFUT",
  tradeDate: "2026-10-14",
  startTime: "09:00",
  endTime: "12:00",
  timeframeMinutes: 2,
  warmupBars: 260,
  mode: "FREE",
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
  {
    id: "e7",
    sessionId: "s1",
    type: "SIGNAL_IGNORED",
    timestamp: "",
    marketTimestamp: "2026-10-14T11:00:00",
    signalId: "sig3",
    side: "BUY",
    reason: null,
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
    postTradeNote: "",
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
    postTradeNote: "",
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
    expect(result.signalAdherencePct).toBeCloseTo(66.666, 2);
    expect(result.executionAdherencePct).toBeCloseTo(66.666, 2);
  });

  it("agrupa tentativas bloqueadas por motivo", () => {
    expect(blockedAttemptBreakdown(events)).toEqual([
      {
        reason: "Sem sinal",
        count: 1,
        buyAttempts: 1,
        sellAttempts: 0,
      },
    ]);
  });

  it("classifica setup a partir do snapshot da entrada", () => {
    const classified: Trade = {
      ...trades[0],
      entryContext: {
        capturedAt: "2026-10-14T09:15:00",
        marketTimestamp: "2026-10-14T09:15:00",
        asset: "WINFUT",
        candleIndex: 10,
        currentPrice: 130000,
        zone: "GREEN",
        signal: {
          id: "sig1",
          asset: "WINFUT",
          side: "BUY",
          candleIndex: 10,
          timestamp: "2026-10-14T09:14:00",
          price: 130000,
          label: "Compra",
        },
        indicatorVersion: "multi-medias-nuvem-v1.0.0",
        candles: [],
        indicatorSeries: [],
        signals: [],
      },
    };

    expect(tradeSetupLabel(classified)).toBe(
      "multi-medias-nuvem-v1.0.0 · Compra",
    );
    expect(tradeSetupLabel(trades[1])).toBe(
      "Legado / sem classificação",
    );
  });

  it("agrupa resultado por setup sem inventar classificação para legado", () => {
    const buyWithContext: Trade = {
      ...trades[0],
      entryContext: {
        capturedAt: "2026-10-14T09:15:00",
        marketTimestamp: "2026-10-14T09:15:00",
        asset: "WINFUT",
        candleIndex: 10,
        currentPrice: 130000,
        zone: "GREEN",
        signal: {
          id: "sig1",
          asset: "WINFUT",
          side: "BUY",
          candleIndex: 10,
          timestamp: "2026-10-14T09:14:00",
          price: 130000,
          label: "Compra",
        },
        indicatorVersion: "multi-medias-nuvem-v1.0.0",
        candles: [],
        indicatorSeries: [],
        signals: [],
      },
    };

    expect(performanceBySetup([buyWithContext, trades[1]])).toEqual([
      {
        setup: "Legado / sem classificação",
        trades: 1,
        wins: 0,
        losses: 1,
        winRatePct: 0,
        netPoints: -100,
        netResultBRL: -21,
      },
      {
        setup: "multi-medias-nuvem-v1.0.0 · Compra",
        trades: 1,
        wins: 1,
        losses: 0,
        winRatePct: 100,
        netPoints: 150,
        netResultBRL: 29,
      },
    ]);
  });

  it("agrupa resultado por horário da entrada", () => {
    expect(performanceByHour(trades)).toEqual([
      { hour: "09:00", trades: 1, netPoints: 150 },
      { hour: "10:00", trades: 1, netPoints: -100 },
    ]);
  });
});
