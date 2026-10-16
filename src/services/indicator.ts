import type {
  Asset,
  Candle,
  IndicatorEvaluation,
  IndicatorPoint,
  IndicatorSignal,
  IndicatorZone,
  VwapAnchor,
} from "../types";

export interface MultiMediasConfig {
  wmaLength: number;
  emaFastLength: number;
  emaSlowLength: number;
  vwapAnchor: VwapAnchor;
}

export interface IndicatorAdapter {
  readonly name: string;
  readonly config: MultiMediasConfig;
  calculate(asset: Asset, candles: Candle[]): IndicatorEvaluation;
  evaluate(asset: Asset, candles: Candle[]): IndicatorSignal | null;
}

export const DEFAULT_MULTI_MEDIAS_CONFIG: MultiMediasConfig = {
  wmaLength: 20,
  emaFastLength: 8,
  emaSlowLength: 52,
  vwapAnchor: "Session",
};

function emaNext(previous: number | null, source: number, length: number): number {
  const alpha = 2 / (length + 1);
  return previous === null ? source : alpha * source + (1 - alpha) * previous;
}

function wmaAt(candles: Candle[], endIndex: number, length: number): number | null {
  const start = endIndex - length + 1;
  if (start < 0) return null;

  const denominator = (length * (length + 1)) / 2;
  let numerator = 0;

  for (let offset = 0; offset < length; offset += 1) {
    numerator += candles[start + offset].close * (offset + 1);
  }

  return numerator / denominator;
}

function hlc3(candle: Candle): number {
  return (candle.high + candle.low + candle.close) / 3;
}

function isoWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodKey(timestamp: string, anchor: VwapAnchor): string {
  const date = new Date(timestamp);

  if (anchor === "Year") return String(date.getUTCFullYear());
  if (anchor === "Month") {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (anchor === "Week") return isoWeekKey(date);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function zoneAuthorization(
  zone: IndicatorZone,
  lastBuySignal: IndicatorSignal | null,
  lastSellSignal: IndicatorSignal | null,
): IndicatorSignal | null {
  if (zone === "GREEN") return lastBuySignal;
  if (zone === "RED") return lastSellSignal;
  return null;
}

/**
 * Port da lógica do Pine Script "Multi Médias - Nuvem e Sinais".
 *
 * Regras preservadas:
 * - Compra: EMA 8 > WMA 20 > EMA 52 + candle de alta para iniciar a zona verde.
 * - Venda: EMA 52 > WMA 20 > EMA 8 + candle de baixa para iniciar a zona vermelha.
 * - O sinal é emitido apenas no candle que inicia a respectiva nuvem.
 * - A zona continua ativa enquanto o alinhamento correspondente permanecer válido.
 *
 * A VWAP é calculada com HLC3 * volume e reiniciada conforme a ancoragem.
 * No replay real, o agrupamento de "Session" será ligado ao timezone/sessão da B3.
 */
export class MultiMediasNuvemAdapter implements IndicatorAdapter {
  readonly name = "Multi Médias - Nuvem e Sinais";
  readonly config: MultiMediasConfig;

  constructor(config: MultiMediasConfig = DEFAULT_MULTI_MEDIAS_CONFIG) {
    this.config = config;
  }

  calculate(asset: Asset, candles: Candle[]): IndicatorEvaluation {
    const series: IndicatorPoint[] = [];
    const signals: IndicatorSignal[] = [];

    let emaFast: number | null = null;
    let emaSlow: number | null = null;
    let inGreenZone = false;
    let inRedZone = false;
    let lastBuySignal: IndicatorSignal | null = null;
    let lastSellSignal: IndicatorSignal | null = null;

    let currentVwapPeriod: string | null = null;
    let sourceVolume = 0;
    let cumulativeVolume = 0;

    candles.forEach((candle, i) => {
      emaFast = emaNext(emaFast, candle.close, this.config.emaFastLength);
      emaSlow = emaNext(emaSlow, candle.close, this.config.emaSlowLength);
      const wma = wmaAt(candles, i, this.config.wmaLength);

      const nextPeriod = periodKey(candle.timestamp, this.config.vwapAnchor);
      if (nextPeriod !== currentVwapPeriod) {
        currentVwapPeriod = nextPeriod;
        sourceVolume = 0;
        cumulativeVolume = 0;
      }
      sourceVolume += hlc3(candle) * candle.volume;
      cumulativeVolume += candle.volume;
      const vwap = cumulativeVolume > 0 ? sourceVolume / cumulativeVolume : null;

      const alignedBull =
        wma !== null && emaFast > wma && wma > emaSlow;
      const alignedBear =
        wma !== null && emaSlow > wma && wma > emaFast;
      const bullishCandle = candle.close > candle.open;
      const bearishCandle = candle.close < candle.open;

      if (alignedBull) {
        if (!inGreenZone && bullishCandle) {
          inGreenZone = true;
          inRedZone = false;
          const signal: IndicatorSignal = {
            id: `${asset}-BUY-${candle.index}`,
            asset,
            side: "BUY",
            candleIndex: candle.index,
            timestamp: candle.timestamp,
            price: candle.close,
            label: "Compra",
          };
          lastBuySignal = signal;
          signals.push(signal);
        }
      } else {
        inGreenZone = false;
      }

      if (alignedBear) {
        if (!inRedZone && bearishCandle) {
          inRedZone = true;
          inGreenZone = false;
          const signal: IndicatorSignal = {
            id: `${asset}-SELL-${candle.index}`,
            asset,
            side: "SELL",
            candleIndex: candle.index,
            timestamp: candle.timestamp,
            price: candle.close,
            label: "Venda",
          };
          lastSellSignal = signal;
          signals.push(signal);
        }
      } else {
        inRedZone = false;
      }

      const zone: IndicatorZone = inGreenZone
        ? "GREEN"
        : inRedZone
          ? "RED"
          : "NONE";

      series.push({
        candleIndex: candle.index,
        wma20: wma,
        vwap,
        ema8: emaFast,
        ema52: emaSlow,
        zone,
      });
    });

    const zone = series.at(-1)?.zone ?? "NONE";

    return {
      authorization: zoneAuthorization(zone, lastBuySignal, lastSellSignal),
      signals,
      series,
      zone,
    };
  }

  evaluate(asset: Asset, candles: Candle[]): IndicatorSignal | null {
    return this.calculate(asset, candles).authorization;
  }
}

export const indicator = new MultiMediasNuvemAdapter();
