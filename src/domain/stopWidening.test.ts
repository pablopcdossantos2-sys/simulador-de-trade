import { describe, expect, it } from "vitest";
import type { Position, ReplayTrade } from "../types";
import { simulateStopWideningScenario } from "./stopWidening";

const position: Position = {
  id: "p1",
  asset: "WINFUT",
  side: "BUY",
  signalId: "s1",
  openedCandleIndex: 0,
  openedReplaySequence: 0,
  requestedEntry: 1000,
  entry: 1000,
  stopLoss: 950,
  target: 1100,
  contracts: 1,
  slippageTicksPerSide: 0,
  costPerContractRoundTripBRL: 0,
  intrabarPolicy: "STOP_FIRST",
  entryContext: null,
  openedAt: "2026-11-13T09:00:00",
  status: "OPEN",
};

function trade(sequence: number, price: number): ReplayTrade {
  return {
    asset: "WINFUT",
    timestamp: `2026-11-13T09:00:${String(sequence).padStart(2, "0")}`,
    sourceRow: sequence,
    sequence,
    price,
    quantity: 1,
  };
}

describe("simulateStopWideningScenario", () => {
  it("moves the stop away by one original R when reached and can still hit target", () => {
    const result = simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [trade(1, 900), trade(2, 950), trade(3, 1100)],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    });
    expect(result.outcome).toBe("TARGET");
    expect(result.widenedTimes).toBe(1);
    expect(result.adjustments).toEqual([{
      timestamp: trade(1, 900).timestamp,
      marketPrice: 900,
      previousStop: 900,
      nextStop: 850,
    }]);
    expect(result.finalBalanceBRL).toBe(10020);
  });

  it("marks theoretical account exhaustion before the target", () => {
    const result = simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [trade(1, 900), trade(2, 400)],
      startingBalanceBRL: 100,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    });
    expect(result.outcome).toBe("BANKRUPTCY");
    expect(result.finalBalanceBRL).toBeLessThan(0);
  });

  it("handles SELL positions when stop is widened away from the market", () => {
    const sellPosition: Position = {
      ...position,
      side: "SELL",
      stopLoss: 1050,
      target: 900,
    };
    const result = simulateStopWideningScenario({
      position: sellPosition,
      attemptedStop: 1100,
      tradesAfterViolation: [trade(1, 1100), trade(2, 1050), trade(3, 900)],
      startingBalanceBRL: 10000,
      lastObservedPrice: 1010,
      lastObservedTimestamp: trade(0, 1010).timestamp,
    });
    expect(result.outcome).toBe("TARGET");
    expect(result.widenedTimes).toBe(1);
    expect(result.adjustments).toEqual([{
      timestamp: trade(1, 1100).timestamp,
      marketPrice: 1100,
      previousStop: 1100,
      nextStop: 1150,
    }]);
    expect(result.finalBalanceBRL).toBe(10020);
  });

  it("rejects a stop movement that reduces risk", () => {
    expect(() => simulateStopWideningScenario({
      position,
      attemptedStop: 975,
      tradesAfterViolation: [],
      startingBalanceBRL: 1000,
      lastObservedPrice: 990,
      lastObservedTimestamp: "2026-11-13T09:00:00",
    })).toThrow(/afastamento/);
  });

  it("rejects replay trades from a different asset", () => {
    expect(() => simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [{ ...trade(1, 900), asset: "WDOFUT" }],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    })).toThrow(/ativo diferente/);
  });

  it("rejects duplicate or out-of-order replay sequences", () => {
    expect(() => simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [trade(2, 900), trade(1, 890)],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    })).toThrow(/ordem crescente/);
  });

  it("rejects prices that do not respect the asset tick", () => {
    expect(() => simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [trade(1, 902.5)],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    })).toThrow(/tick do ativo/);
  });

  it("rejects invalid stop/target geometry", () => {
    expect(() => simulateStopWideningScenario({
      position: { ...position, target: 950 },
      attemptedStop: 900,
      tradesAfterViolation: [],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    })).toThrow(/lados válidos/);
  });

  it("rejects replay timestamps earlier than the last observed price", () => {
    expect(() => simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [{
        ...trade(1, 900),
        timestamp: "2026-11-13T08:59:59",
      }],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: "2026-11-13T09:00:00",
    })).toThrow(/horários dos negócios/);
  });

  it("compares offset timestamps as market wall-clock time, independent of PC timezone", () => {
    expect(() => simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [{
        ...trade(1, 900),
        timestamp: "2026-11-13T08:59:59Z",
      }],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: "2026-11-13T09:00:00+03:00",
    })).toThrow(/horários dos negócios/);
  });

  it("rejects malformed offsets and impossible calendar dates", () => {
    for (const timestamp of [
      "2026-11-13T09:00:00+99:99",
      "2026-02-30T09:00:00",
    ]) {
      expect(() => simulateStopWideningScenario({
        position,
        attemptedStop: 900,
        tradesAfterViolation: [],
        startingBalanceBRL: 10000,
        lastObservedPrice: 990,
        lastObservedTimestamp: timestamp,
      })).toThrow(/horário válido/);
    }
  });

  it("rejects an exit price made impossible by excessive slippage", () => {
    expect(() => simulateStopWideningScenario({
      position: { ...position, slippageTicksPerSide: 181 },
      attemptedStop: 900,
      tradesAfterViolation: [trade(1, 900)],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    })).toThrow(/preço de saída após slippage/);
  });

  it("rejects zero-quantity replay records", () => {
    expect(() => simulateStopWideningScenario({
      position,
      attemptedStop: 900,
      tradesAfterViolation: [{ ...trade(1, 900), quantity: 0 }],
      startingBalanceBRL: 10000,
      lastObservedPrice: 990,
      lastObservedTimestamp: trade(0, 990).timestamp,
    })).toThrow(/quantidade ou horário inválido/);
  });
});
