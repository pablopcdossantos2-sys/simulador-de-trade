import type { Asset, Candle } from "../types";

const ASSET_CONFIG = {
  WINFUT: { base: 130000, tick: 5, amplitude: 180 },
  WDOFUT: { base: 5200, tick: 0.5, amplitude: 24 },
} satisfies Record<Asset, { base: number; tick: number; amplitude: number }>;

const roundToTick = (value: number, tick: number) =>
  Math.round(value / tick) * tick;

function closeFor(asset: Asset, index: number): number {
  const { base, tick, amplitude } = ASSET_CONFIG[asset];
  const wave =
    Math.sin(index / 3.2) * amplitude +
    Math.sin(index / 7.4) * amplitude * 0.55 +
    Math.cos(index / 2.1) * amplitude * 0.18;
  return roundToTick(base + wave, tick);
}

export function createDemoCandles(asset: Asset, count = 52): Candle[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const close = closeFor(asset, index);
    const open = index === 0 ? close : closeFor(asset, index - 1);
    const { tick, amplitude } = ASSET_CONFIG[asset];
    const wick = roundToTick(
      tick * 2 + Math.abs(Math.sin(index * 1.7)) * amplitude * 0.12,
      tick,
    );
    return {
      index,
      timestamp: new Date(now - (count - index) * 60_000).toISOString(),
      open,
      high: roundToTick(Math.max(open, close) + wick, tick),
      low: roundToTick(Math.min(open, close) - wick, tick),
      close,
      volume: 1000 + Math.round(Math.abs(Math.sin(index)) * 4500),
    };
  });
}

export function nextDemoCandle(asset: Asset, previous: Candle[]): Candle {
  const index = previous.length ? previous[previous.length - 1].index + 1 : 0;
  const close = closeFor(asset, index);
  const open = previous.length ? previous[previous.length - 1].close : close;
  const { tick, amplitude } = ASSET_CONFIG[asset];
  const wick = roundToTick(
    tick * 2 + Math.abs(Math.cos(index * 1.37)) * amplitude * 0.12,
    tick,
  );

  return {
    index,
    timestamp: new Date().toISOString(),
    open,
    high: roundToTick(Math.max(open, close) + wick, tick),
    low: roundToTick(Math.min(open, close) - wick, tick),
    close,
    volume: 1000 + Math.round(Math.abs(Math.cos(index)) * 5000),
  };
}

export function suggestedOcoDistance(asset: Asset): {
  stop: number;
  target: number;
} {
  return asset === "WINFUT"
    ? { stop: 100, target: 200 }
    : { stop: 10, target: 20 };
}
