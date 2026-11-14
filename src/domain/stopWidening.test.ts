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
});
