import type { Candle } from "../types";
import { marketDateKey, marketTimestampFromOrdinalMs, marketTimestampOrdinalMs, parseMarketTimestamp } from "../domain/marketTime";

export type MtfAverageMethod = "SMA" | "EMA" | "WMA";

export interface MtfAverageConfig {
  id: "M1" | "M2" | "M3" | "M4";
  method: MtfAverageMethod;
  length: number;
  enabled: boolean;
}

export interface CausalMtfConfig {
  chartTimeframeMinutes: number;
  indicatorTimeframeMinutes: number;
  sessionStartHour: number;
  sessionStartMinute: number;
  averages: MtfAverageConfig[];
}

export interface CausalMtfSnapshot {
  candleIndex: number;
  timestamp: string;
  availableAt: string;
  indicatorBarStart: string;
  indicatorBarIsForming: boolean;
  averages: Record<string, number | null>;
  sourceClose: number;
  aggregatedBar: Pick<Candle, "open" | "high" | "low" | "close" | "volume">;
}

export const DEFAULT_CAUSAL_MTF_CONFIG: CausalMtfConfig = {
  chartTimeframeMinutes: 2,
  indicatorTimeframeMinutes: 15,
  sessionStartHour: 9,
  sessionStartMinute: 0,
  averages: [
    { id: "M1", method: "EMA", length: 8, enabled: true },
    { id: "M2", method: "EMA", length: 20, enabled: true },
    { id: "M3", method: "EMA", length: 50, enabled: true },
    { id: "M4", method: "EMA", length: 200, enabled: true },
  ],
};

interface MarketTimestamp {
  day: string;
  minute: number;
  second: number;
}

function parseMtfTimestamp(value: string): MarketTimestamp {
  const parsed = parseMarketTimestamp(value);
  return {
    day: marketDateKey(value),
    minute: parsed.hour * 60 + parsed.minute,
    second: parsed.second,
  };
}

function formatMarketMinute(day: string, minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${day}T${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

function average(values: number[], method: MtfAverageMethod, length: number): number | null {
  if (length < 1 || values.length < length) return null;
  const window = values.slice(-length);

  if (method === "SMA") {
    return window.reduce((sum, value) => sum + value, 0) / length;
  }

  if (method === "WMA") {
    const denominator = (length * (length + 1)) / 2;
    return window.reduce((sum, value, index) => sum + value * (index + 1), 0) / denominator;
  }

  // Inicialização por SMA, seguida da recorrência EMA padrão.
  let result = values.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
  const alpha = 2 / (length + 1);
  for (let index = length; index < values.length; index += 1) {
    result = alpha * values[index] + (1 - alpha) * result;
  }
  return result;
}

function aggregate(previous: CausalMtfSnapshot["aggregatedBar"] | null, candle: Candle) {
  if (!previous) {
    return {
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    };
  }
  return {
    open: previous.open,
    high: Math.max(previous.high, candle.high),
    low: Math.min(previous.low, candle.low),
    close: candle.close,
    volume: previous.volume + candle.volume,
  };
}

/**
 * Calcula médias de um timeframe superior a partir de candles fechados do gráfico.
 *
 * O snapshot de cada candle usa somente candles presentes até aquele índice. A barra
 * MTF em formação é recalculada com o OHLCV parcial conhecido naquele instante; ela
 * nunca recebe candles posteriores. As médias são reiniciadas a cada dia de pregão.
 *
 * Como 2 não divide 15, um candle M2 pode atravessar a fronteira de uma barra M15.
 * Sem dados tick a tick não é possível repartir seu OHLCV com exatidão. Para manter
 * causalidade, o candle M2 inteiro é incorporado quando já está fechado; portanto,
 * a barra MTF pode ficar disponível com atraso de até um candle M2.
 */
export function calculateCausalMtfAverages(
  candles: Candle[],
  config: CausalMtfConfig = DEFAULT_CAUSAL_MTF_CONFIG,
): CausalMtfSnapshot[] {
  if (
    !Number.isInteger(config.chartTimeframeMinutes) ||
    config.chartTimeframeMinutes < 1 ||
    !Number.isInteger(config.indicatorTimeframeMinutes) ||
    config.indicatorTimeframeMinutes < 1 ||
    !Number.isInteger(config.sessionStartHour) ||
    config.sessionStartHour < 0 ||
    config.sessionStartHour > 23 ||
    !Number.isInteger(config.sessionStartMinute) ||
    config.sessionStartMinute < 0 ||
    config.sessionStartMinute > 59 ||
    config.averages.some((item) => !Number.isInteger(item.length) || item.length < 1)
  ) {
    throw new Error("Configuração de timeframe, sessão ou período de média inválida.");
  }

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  const averageIds = new Set<string>();
  for (const item of config.averages) {
    if (
      !["M1", "M2", "M3", "M4"].includes(item.id) ||
      !["SMA", "EMA", "WMA"].includes(item.method) ||
      typeof item.enabled !== "boolean" ||
      averageIds.has(item.id)
    ) {
      throw new Error("Configuração das médias MTF inválida ou com identificadores duplicados.");
    }
    averageIds.add(item.id);
  }

  for (const candle of candles) {
    const timestamp = marketTimestampOrdinalMs(candle.timestamp);
    if (timestamp <= previousTimestamp) {
      throw new Error("Os candles do cálculo MTF devem estar em ordem cronológica, sem timestamps duplicados.");
    }
    previousTimestamp = timestamp;

    const prices = [candle.open, candle.high, candle.low, candle.close];
    if (
      prices.some((price) => !Number.isFinite(price)) ||
      !Number.isFinite(candle.volume) ||
      candle.volume < 0 ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close, candle.high)
    ) {
      throw new Error("O candle contém OHLC ou volume inválido para o cálculo MTF.");
    }
  }

  const snapshots: CausalMtfSnapshot[] = [];
  let currentDay: string | null = null;
  let currentBucket = Number.NaN;
  let currentBar: CausalMtfSnapshot["aggregatedBar"] | null = null;
  let currentBarStart = "";
  let dailyCloses: number[] = [];

  for (let candlePosition = 0; candlePosition < candles.length; candlePosition += 1) {
    const candle = candles[candlePosition];
    const parsed = parseMtfTimestamp(candle.timestamp);

    if (parsed.day !== currentDay) {
      currentDay = parsed.day;
      currentBucket = Number.NaN;
      currentBar = null;
      currentBarStart = "";
      dailyCloses = [];
    }

    const sessionStart = config.sessionStartHour * 60 + config.sessionStartMinute;
    const bucket = Math.floor((parsed.minute - sessionStart) / config.indicatorTimeframeMinutes);

    if (bucket !== currentBucket) {
      currentBucket = bucket;
      currentBar = null;
      currentBarStart = formatMarketMinute(
        parsed.day,
        sessionStart + bucket * config.indicatorTimeframeMinutes,
      );
    }

    currentBar = aggregate(currentBar, candle);
    const candleCloseOrdinal =
      marketTimestampOrdinalMs(candle.timestamp) + config.chartTimeframeMinutes * 60_000;
    const closeTimestamp = marketTimestampFromOrdinalMs(candleCloseOrdinal);
    const bucketEnd = sessionStart + (bucket + 1) * config.indicatorTimeframeMinutes;
    const bucketEndTimestamp = formatMarketMinute(parsed.day, bucketEnd);
    const bucketEndOrdinal = marketTimestampOrdinalMs(bucketEndTimestamp);
    const values = [...dailyCloses, currentBar.close];
    const averages: Record<string, number | null> = {};

    for (const item of config.averages) {
      averages[item.id] = item.enabled
        ? average(values, item.method, item.length)
        : null;
    }

    snapshots.push({
      candleIndex: candle.index,
      timestamp: candle.timestamp,
      availableAt: closeTimestamp,
      indicatorBarStart: currentBarStart,
      indicatorBarIsForming: candleCloseOrdinal < bucketEndOrdinal,
      averages,
      sourceClose: currentBar.close,
      aggregatedBar: { ...currentBar },
    });

    // A barra MTF passa a integrar o histórico diário apenas quando o próximo
    // bucket é encontrado; o valor corrente não é duplicado no aquecimento.
    const next = candles[candlePosition + 1];
    const nextParsed = next ? parseMtfTimestamp(next.timestamp) : null;
    const nextBucket = nextParsed && nextParsed.day === parsed.day
      ? Math.floor((nextParsed.minute - sessionStart) / config.indicatorTimeframeMinutes)
      : Number.NaN;
    if (nextBucket !== bucket) {
      dailyCloses.push(currentBar.close);
      currentBar = null;
    }
  }

  return snapshots;
}
