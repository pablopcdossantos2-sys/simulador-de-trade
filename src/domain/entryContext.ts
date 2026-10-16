import type {
  Asset,
  Candle,
  IndicatorEvaluation,
  IndicatorSignal,
  TradeEntryContext,
} from "../types";

interface CaptureEntryContextInput {
  asset: Asset;
  candles: Candle[];
  evaluation: IndicatorEvaluation;
  signal: IndicatorSignal | null;
  marketTimestamp: string;
  capturedAt?: string;
  maxCandles?: number;
}

export function captureEntryContext({
  asset,
  candles,
  evaluation,
  signal,
  marketTimestamp,
  capturedAt = new Date().toISOString(),
  maxCandles = 48,
}: CaptureEntryContextInput): TradeEntryContext | null {
  if (!signal || candles.length === 0) return null;

  const visible = candles.slice(-Math.max(1, maxCandles));
  const firstIndex = visible[0].index;
  const lastIndex = visible[visible.length - 1].index;

  return {
    capturedAt,
    marketTimestamp,
    asset,
    candleIndex: lastIndex,
    currentPrice: visible[visible.length - 1].close,
    zone: evaluation.zone,
    signal: { ...signal },
    candles: visible.map((candle) => ({ ...candle })),
    indicatorSeries: evaluation.series
      .filter(
        (point) =>
          point.candleIndex >= firstIndex &&
          point.candleIndex <= lastIndex,
      )
      .map((point) => ({ ...point })),
    signals: evaluation.signals
      .filter(
        (item) =>
          item.candleIndex >= firstIndex &&
          item.candleIndex <= lastIndex,
      )
      .map((item) => ({ ...item })),
  };
}
