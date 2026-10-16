import { describe, expect, it, vi } from "vitest";
import {
  createTrainingEvent,
  createTrainingSession,
  endTrainingSession,
  summarizeTraining,
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
      now: new Date("2026-10-16T10:00:00Z"),
    });

    const ended = endTrainingSession(
      session,
      new Date("2026-10-16T11:00:00Z"),
    );

    expect(ended.id).toBe("session-1");
    expect(ended.status).toBe("ENDED");
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
