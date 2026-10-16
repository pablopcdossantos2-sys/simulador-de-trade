import { describe, expect, it } from "vitest";
import type { Trade } from "../types";
import { performanceByAsset } from "./portfolioMetrics";

function trade(
  id: string,
  asset: Trade["asset"],
  resultPoints: number,
  gross: number,
  costs: number,
): Trade {
  return {
    id,
    asset,
    side: "BUY",
    signalId: "sig",
    requestedEntry: 100,
    entry: 100,
    stopLoss: 90,
    target: 110,
    contracts: 1,
    slippageTicksPerSide: 0,
    costPerContractRoundTripBRL: costs,
    openedAt: "2026-10-14T09:00:00",
    status: "CLOSED",
    exitPrice: 110,
    exitReason: resultPoints >= 0 ? "TARGET" : "STOP",
    closedAt: "2026-10-14T09:10:00",
    resultPoints,
    grossResultBRL: gross,
    operationalCostsBRL: costs,
    netResultBRL: gross - costs,
    postTradeNote: "",
  };
}

describe("resultado agregado por ativo", () => {
  it("separa WIN e WDO", () => {
    const result = performanceByAsset([
      trade("w1", "WINFUT", 100, 20, 1),
      trade("w2", "WINFUT", -50, -10, 1),
      trade("d1", "WDOFUT", 2, 20, 2),
    ]);

    expect(result[0]).toMatchObject({
      asset: "WINFUT",
      trades: 2,
      wins: 1,
      losses: 1,
      winRatePct: 50,
      netPoints: 50,
      grossResultBRL: 10,
      operationalCostsBRL: 2,
      netResultBRL: 8,
    });

    expect(result[1]).toMatchObject({
      asset: "WDOFUT",
      trades: 1,
      wins: 1,
      netPoints: 2,
      netResultBRL: 18,
    });
  });
});
