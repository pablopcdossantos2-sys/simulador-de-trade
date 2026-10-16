import type { Asset, Candle, IndicatorSignal } from "../types";

export interface IndicatorAdapter {
  readonly name: string;
  evaluate(asset: Asset, candles: Candle[]): IndicatorSignal | null;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function smaAt(candles: Candle[], endIndex: number, length: number): number | null {
  const start = endIndex - length + 1;
  if (start < 0) return null;
  return average(candles.slice(start, endIndex + 1).map((c) => c.close));
}

/**
 * Adaptador temporário apenas para demonstrar o fluxo completo do simulador.
 *
 * IMPORTANTE: este código NÃO representa o indicador real do TradingView.
 * Quando o Pine Script for fornecido, sua lógica deve ser portada para um
 * adaptador próprio mantendo esta mesma interface.
 */
export class DemoMovingAverageSignalAdapter implements IndicatorAdapter {
  readonly name = "Demonstração — cruzamento SMA 3 × SMA 8";

  evaluate(asset: Asset, candles: Candle[]): IndicatorSignal | null {
    if (candles.length < 10) return null;

    for (let i = candles.length - 1; i >= 8; i -= 1) {
      const fastNow = smaAt(candles, i, 3);
      const slowNow = smaAt(candles, i, 8);
      const fastPrev = smaAt(candles, i - 1, 3);
      const slowPrev = smaAt(candles, i - 1, 8);
      if (
        fastNow === null ||
        slowNow === null ||
        fastPrev === null ||
        slowPrev === null
      ) {
        continue;
      }

      const candle = candles[i];
      if (fastPrev <= slowPrev && fastNow > slowNow) {
        return {
          id: `${asset}-BUY-${candle.index}`,
          asset,
          side: "BUY",
          candleIndex: candle.index,
          timestamp: candle.timestamp,
          price: candle.close,
          label: "Compra",
        };
      }

      if (fastPrev >= slowPrev && fastNow < slowNow) {
        return {
          id: `${asset}-SELL-${candle.index}`,
          asset,
          side: "SELL",
          candleIndex: candle.index,
          timestamp: candle.timestamp,
          price: candle.close,
          label: "Venda",
        };
      }
    }

    return null;
  }
}

export const indicator = new DemoMovingAverageSignalAdapter();
