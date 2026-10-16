import type { Candle } from "../types";

export const INDICATOR_V1_REGRESSION_CANDLES: Candle[] = Array.from(
  { length: 70 },
  (_, index) => {
    const rising = index < 35;
    const close = rising
      ? 1000 + index * 3
      : 1105 - (index - 35) * 4;
    const open = rising ? close - 1 : close + 1;

    return {
      index,
      timestamp: new Date(
        Date.UTC(2026, 0, 2, 12, index),
      ).toISOString(),
      open,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close,
      volume: 100 + index,
    };
  },
);

export const INDICATOR_V1_EXPECTED = {
  version: "multi-medias-nuvem-v1.0.0",
  signals: [
    { side: "BUY", candleIndex: 19 },
    { side: "SELL", candleIndex: 54 },
  ],
  last: {
    candleIndex: 69,
    wma20: 994.3333333333334,
    vwap: 1042.7534076827758,
    ema8: 982.9952332107055,
    ema52: 1028.115938062153,
    zone: "RED",
  },
} as const;
