import type { Asset } from "../types";

export interface MarketSpec {
  tickSize: number;
  displayName: string;
}

export const MARKET_SPECS: Record<Asset, MarketSpec> = {
  WINFUT: {
    tickSize: 5,
    displayName: "Mini Ibovespa Futuro",
  },
  WDOFUT: {
    tickSize: 0.5,
    displayName: "Mini Dólar Futuro",
  },
};

export function tickSizeFor(asset: Asset): number {
  return MARKET_SPECS[asset].tickSize;
}

export function isPriceOnTick(asset: Asset, price: number): boolean {
  const tick = tickSizeFor(asset);
  const steps = price / tick;
  return Math.abs(steps - Math.round(steps)) < 1e-8;
}
