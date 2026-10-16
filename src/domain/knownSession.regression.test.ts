import { describe, expect, it } from "vitest";
import {
  KNOWN_SESSION,
  KNOWN_SESSION_EVENTS,
  KNOWN_SESSION_EXPECTED,
  KNOWN_SESSION_TRADES,
} from "../fixtures/knownSession";
import { calculateSessionPerformance } from "./sessionReport";

describe("fixture de sessão conhecida", () => {
  it("mantém as métricas esperadas da sessão de referência", () => {
    const result = calculateSessionPerformance(
      KNOWN_SESSION,
      KNOWN_SESSION_EVENTS,
      KNOWN_SESSION_TRADES,
    );

    expect(result.totalTrades).toBe(KNOWN_SESSION_EXPECTED.totalTrades);
    expect(result.wins).toBe(KNOWN_SESSION_EXPECTED.wins);
    expect(result.losses).toBe(KNOWN_SESSION_EXPECTED.losses);
    expect(result.netPoints).toBe(KNOWN_SESSION_EXPECTED.netPoints);
    expect(result.grossResultBRL).toBe(KNOWN_SESSION_EXPECTED.grossResultBRL);
    expect(result.operationalCostsBRL).toBe(
      KNOWN_SESSION_EXPECTED.operationalCostsBRL,
    );
    expect(result.netResultBRL).toBe(KNOWN_SESSION_EXPECTED.netResultBRL);
    expect(result.totalR).toBe(KNOWN_SESSION_EXPECTED.totalR);
    expect(result.expectancyR).toBe(KNOWN_SESSION_EXPECTED.expectancyR);
    expect(result.winRatePct).toBe(KNOWN_SESSION_EXPECTED.winRatePct);
    expect(result.executionAdherencePct).toBeCloseTo(
      KNOWN_SESSION_EXPECTED.executionAdherencePct,
      8,
    );
    expect(result.signalAdherencePct).toBeCloseTo(
      KNOWN_SESSION_EXPECTED.signalAdherencePct,
      8,
    );
    expect(result.blockedAttempts).toBe(
      KNOWN_SESSION_EXPECTED.blockedAttempts,
    );
    expect(result.ignoredSignals).toBe(
      KNOWN_SESSION_EXPECTED.ignoredSignals,
    );
  });
});
