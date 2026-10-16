import { describe, expect, it } from "vitest";
import type {
  Candle,
  IndicatorEvaluation,
  IndicatorSignal,
} from "../types";
import { captureEntryContext } from "./entryContext";

const candles: Candle[] = Array.from({ length: 60 }, (_, index) => ({
  index,
  timestamp: `2026-10-14T09:${String(index).padStart(2, "0")}:00`,
  open: 100 + index,
  high: 102 + index,
  low: 99 + index,
  close: 101 + index,
  volume: 10,
}));

const signal: IndicatorSignal = {
  id: "WINFUT-BUY-59",
  asset: "WINFUT",
  side: "BUY",
  candleIndex: 59,
  timestamp: candles[59].timestamp,
  price: candles[59].close,
  label: "Compra",
};

const evaluation: IndicatorEvaluation = {
  authorization: signal,
  signals: [
    {
      ...signal,
      id: "old",
      candleIndex: 5,
    },
    signal,
  ],
  series: candles.map((candle) => ({
    candleIndex: candle.index,
    wma20: candle.close - 1,
    vwap: candle.close - 2,
    ema8: candle.close + 1,
    ema52: candle.close - 3,
    zone: "GREEN",
  })),
  zone: "GREEN",
};

describe("snapshot do contexto da entrada", () => {
  it("captura somente os últimos candles visíveis", () => {
    const context = captureEntryContext({
      asset: "WINFUT",
      candles,
      evaluation,
      signal,
      marketTimestamp: "2026-10-14T10:59:00-03:00",
      capturedAt: "2026-10-16T18:00:00Z",
    });

    expect(context).not.toBeNull();
    expect(context?.candles).toHaveLength(48);
    expect(context?.candles[0].index).toBe(12);
    expect(context?.candles.at(-1)?.index).toBe(59);
    expect(context?.indicatorSeries).toHaveLength(48);
    expect(context?.signals.map((item) => item.id)).toEqual([
      "WINFUT-BUY-59",
    ]);
  });

  it("não cria snapshot sem sinal válido", () => {
    expect(
      captureEntryContext({
        asset: "WINFUT",
        candles,
        evaluation,
        signal: null,
        marketTimestamp: "2026-10-14T10:59:00-03:00",
      }),
    ).toBeNull();
  });
});
