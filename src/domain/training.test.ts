import { describe, expect, it, vi } from "vitest";
import {
  createTrainingEvent,
  createTrainingSession,
  endTrainingSession,
  summarizeTraining,
  visibleTradesForTrainingState,
} from "./training";

describe("sessão formal de treino", () => {
  it("calcula aderência somente sobre tentativas de operação", () => {
    const session = {
      id: "s1",
      asset: "WINFUT" as const,
      tradeDate: "2026-10-14",
      startTime: "09:00",
      endTime: "12:00",
      timeframeMinutes: 2,
      warmupBars: 260,
      mode: "FREE" as const,
      startedAt: "2026-10-16T10:00:00Z",
      endedAt: null,
      status: "ACTIVE" as const,
    };

    const events = [
      {
        id: "e1",
        sessionId: "s1",
        type: "TRADE_OPENED" as const,
        timestamp: "",
        marketTimestamp: null,
        signalId: "a",
        side: "BUY" as const,
        reason: null,
        tradeId: "t1",
      },
      {
        id: "e2",
        sessionId: "s1",
        type: "BLOCKED_ATTEMPT" as const,
        timestamp: "",
        marketTimestamp: null,
        signalId: null,
        side: "SELL" as const,
        reason: "Sem sinal",
        tradeId: null,
      },
      {
        id: "e3",
        sessionId: "s1",
        type: "SIGNAL_IGNORED" as const,
        timestamp: "",
        marketTimestamp: null,
        signalId: "b",
        side: "BUY" as const,
        reason: null,
        tradeId: null,
      },
    ];

    const summary = summarizeTraining(session, events);
    expect(summary.tradesExecuted).toBe(1);
    expect(summary.blockedAttempts).toBe(1);
    expect(summary.ignoredSignals).toBe(1);
    expect(summary.executionAdherencePct).toBe(50);
  });

  it("encerra a sessão mantendo seus metadados", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "session-1" });
    const session = createTrainingSession({
      asset: "WDOFUT",
      tradeDate: "2026-10-14",
      startTime: "09:00",
      endTime: "12:00",
      timeframeMinutes: 2,
      warmupBars: 260,
      mode: "EXAM",
      now: new Date("2026-10-16T10:00:00Z"),
    });

    const ended = endTrainingSession(
      session,
      new Date("2026-10-16T11:00:00Z"),
    );

    expect(ended.id).toBe("session-1");
    expect(ended.status).toBe("ENDED");
    expect(ended.mode).toBe("EXAM");
    expect(ended.endedAt).toBe("2026-10-16T11:00:00.000Z");
  });

  it("cria eventos vinculados à sessão", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "event-1" });
    const event = createTrainingEvent({
      sessionId: "s1",
      type: "BLOCKED_ATTEMPT",
      side: "BUY",
      reason: "Fora do operacional",
      now: new Date("2026-10-16T10:30:00Z"),
    });

    expect(event.id).toBe("event-1");
    expect(event.sessionId).toBe("s1");
    expect(event.reason).toBe("Fora do operacional");
  });
});


describe("visibilidade no Modo Prova", () => {
  const trade = {
    id: "trade-exam-1",
    asset: "WINFUT" as const,
    side: "BUY" as const,
    signalId: "signal-1",
    requestedEntry: 130000,
    entry: 130000,
    stopLoss: 129900,
    target: 130150,
    contracts: 1,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: 0,
    openedAt: "2026-10-14T09:10:00",
    status: "CLOSED" as const,
    exitPrice: 130150,
    exitReason: "TARGET" as const,
    closedAt: "2026-10-14T09:20:00",
    resultPoints: 150,
    grossResultBRL: 30,
    operationalCostsBRL: 0,
    netResultBRL: 30,
    postTradeNote: "",
  };

  const event = {
    id: "event-exam-1",
    sessionId: "session-exam",
    type: "TRADE_CLOSED" as const,
    timestamp: "2026-10-14T09:20:00",
    marketTimestamp: "2026-10-14T09:20:00",
    signalId: "signal-1",
    side: "BUY" as const,
    reason: "TARGET",
    tradeId: trade.id,
  };

  const activeExam = {
    id: "session-exam",
    asset: "WINFUT" as const,
    tradeDate: "2026-10-14",
    startTime: "09:00",
    endTime: "12:00",
    timeframeMinutes: 2,
    warmupBars: 260,
    mode: "EXAM" as const,
    startedAt: "2026-10-14T09:00:00",
    endedAt: null,
    status: "ACTIVE" as const,
  };

  it("oculta trades da prova ativa", () => {
    expect(
      visibleTradesForTrainingState([trade], activeExam, [event]),
    ).toEqual([]);
  });

  it("revela os trades quando a prova termina", () => {
    expect(
      visibleTradesForTrainingState(
        [trade],
        {
          ...activeExam,
          status: "ENDED",
          endedAt: "2026-10-14T12:00:00",
        },
        [event],
      ),
    ).toEqual([trade]);
  });

  it("não oculta trades no treino livre", () => {
    expect(
      visibleTradesForTrainingState(
        [trade],
        { ...activeExam, mode: "FREE" },
        [event],
      ),
    ).toEqual([trade]);
  });
});
