import type { Asset } from "../types";

export interface MarketSpec {
  tickSize: number;
  pointValueBRL: number;
  displayName: string;
}

export const MARKET_SPECS: Record<Asset, MarketSpec> = {
  WINFUT: {
    tickSize: 5,
    pointValueBRL: 0.2,
    displayName: "Mini Ibovespa Futuro",
  },
  WDOFUT: {
    tickSize: 0.5,
    pointValueBRL: 10,
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


export function pointValueBRLFor(asset: Asset): number {
  return MARKET_SPECS[asset].pointValueBRL;
}

export function grossResultBRL(
  asset: Asset,
  resultPoints: number,
  contracts: number,
): number {
  return resultPoints * pointValueBRLFor(asset) * contracts;
}
