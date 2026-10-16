import type { Asset, Trade } from "../types";

export interface AssetPerformance {
  asset: Asset;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPoints: number;
  grossResultBRL: number;
  operationalCostsBRL: number;
  netResultBRL: number;
}

export function performanceByAsset(trades: Trade[]): AssetPerformance[] {
  const assets: Asset[] = ["WINFUT", "WDOFUT"];

  return assets.map((asset) => {
    const scoped = trades.filter((trade) => trade.asset === asset);
    const wins = scoped.filter((trade) => trade.resultPoints > 0).length;
    const losses = scoped.filter((trade) => trade.resultPoints < 0).length;

    return {
      asset,
      trades: scoped.length,
      wins,
      losses,
      winRatePct:
        scoped.length === 0 ? 0 : (wins / scoped.length) * 100,
      netPoints: scoped.reduce(
        (sum, trade) => sum + trade.resultPoints,
        0,
      ),
      grossResultBRL: scoped.reduce(
        (sum, trade) => sum + trade.grossResultBRL,
        0,
      ),
      operationalCostsBRL: scoped.reduce(
        (sum, trade) => sum + trade.operationalCostsBRL,
        0,
      ),
      netResultBRL: scoped.reduce(
        (sum, trade) => sum + trade.netResultBRL,
        0,
      ),
    };
  });
}
