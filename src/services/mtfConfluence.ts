import type { Candle, IndicatorZone, MtfVoteFilters } from "../types";
import {
  calculateCausalMtfAverages,
  DEFAULT_CAUSAL_MTF_CONFIG,
  type CausalMtfSnapshot,
} from "./causalMtfIndicator";

// Parâmetros padrão do Pine Indicador_v13_alinhamento_total (versão 13).
// M4/EMA200 é plotada, mas NÃO participa do fundo por padrão.
export const MTF_CONFLUENCE_VERSION = "mtf-confluencia-v13-beta1";
export const MTF_CONFLUENCE_DEFAULTS = {
  periods: [8, 20, 50, 200] as const,
  voteOn: [true, true, true, false] as const,
  angleThresholds: [2, 1, 1.5, 1] as const,
  angleLookback: 1,
  atrPeriod: 14,
  vwapAngleLookback: 3,
  vwapAngleThreshold: 1,
  tpvPeriod: 50,
  tpvProximity: 0.45,
  requireAlignment: true,
} as const;

export const DEFAULT_MTF_VOTE_FILTERS: MtfVoteFilters = {
  useAngles: true,
  requireAlignment: true,
  voteOn: [true, true, true, false],
  useVwap: true,
  useTpv: true,
};

export type MtfRegime = "GREEN" | "RED" | "NONE";

export interface MtfConfluencePoint {
  candleIndex: number;
  timestamp: string;
  availableAt: string;
  /** M15 em formação; somente dados que já fecharam no M2 estão incluídos. */
  barStart: string;
  averages: Record<"M1" | "M2" | "M3" | "M4", number | null>;
  angles: Record<"M1" | "M2" | "M3" | "M4", number | null>;
  atr: number | null;
  vwap: number | null;
  vwapAngle: number | null;
  tpv: number;
  tpvMean: number | null;
  tpvDeviation: number | null;
  tpvVote: -1 | 0 | 1 | null;
  aligned: "BUY" | "SELL" | null;
  zone: IndicatorZone;
  /** Pine v13 não colore nem o cinza se não houver alinhamento total. */
  showBackground: boolean;
}

export interface MtfConfluenceEvaluation {
  points: MtfConfluencePoint[];
  zone: IndicatorZone;
}

type Bar = CausalMtfSnapshot["aggregatedBar"] & { start: string };

function emaSeries(values: number[], length: number): number[] {
  // Pine ta.ema: começa no primeiro valor, não na SMA dos primeiros N.
  const alpha = 2 / (length + 1);
  const result: number[] = [];
  for (const value of values) {
    result.push(result.length ? alpha * value + (1 - alpha) * result[result.length - 1] : value);
  }
  return result;
}

function atrSeries(bars: Bar[], length: number): (number | null)[] {
  const values: (number | null)[] = [];
  let total = 0;
  let atr: number | null = null;
  for (let i = 0; i < bars.length; i += 1) {
    const previousClose = i ? bars[i - 1].close : bars[i].close;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - previousClose),
      Math.abs(bars[i].low - previousClose),
    );
    if (i < length) total += tr;
    if (i === length - 1) atr = total / length;
    else if (i >= length && atr !== null) atr = (atr * (length - 1) + tr) / length;
    values.push(atr);
  }
  return values;
}

function vwapSeries(bars: Bar[]): (number | null)[] {
  let day = "";
  let weighted = 0;
  let volume = 0;
  return bars.map((bar) => {
    const nextDay = bar.start.slice(0, 10);
    if (nextDay !== day) {
      day = nextDay;
      weighted = 0;
      volume = 0;
    }
    weighted += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
    volume += bar.volume;
    return volume > 0 ? weighted / volume : null;
  });
}

function tpvSeries(bars: Bar[]): number[] {
  const values: number[] = [];
  let total = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const prior = i ? bars[i - 1].close : 0;
    // Pine original tipoVol="Financeiro": (volume * close) * variação percentual.
    if (prior > 0) total += (bars[i].volume * bars[i].close) * (bars[i].close - prior) / prior;
    values.push(total);
  }
  return values;
}

function voteForAngle(value: number | null, threshold: number): -1 | 0 | 1 {
  if (value === null) return 0;
  if (value >= threshold) return 1;
  if (value <= -threshold) return -1;
  return 0;
}

function angle(values: (number | null)[], index: number, lookback: number, atr: number | null): number | null {
  if (index < lookback || atr === null || atr <= 0) return null;
  const current = values[index];
  const previous = values[index - lookback];
  if (current === null || previous === null) return null;
  return Math.atan(((current - previous) / lookback) / atr) * 180 / Math.PI;
}

function evaluateBars(
  bars: Bar[],
  periods: readonly [number, number, number, number],
  filters: MtfVoteFilters,
): Omit<MtfConfluencePoint, "candleIndex" | "timestamp" | "availableAt" | "barStart"> {
  const config = { ...MTF_CONFLUENCE_DEFAULTS, periods };
  const index = bars.length - 1;
  const closeSeries = bars.map((bar) => bar.close);
  const ma = config.periods.map((length) => emaSeries(closeSeries, length));
  const atr = atrSeries(bars, config.atrPeriod).at(-1) ?? null;
  const ids = ["M1", "M2", "M3", "M4"] as const;
  const averages = {} as MtfConfluencePoint["averages"];
  const angles = {} as MtfConfluencePoint["angles"];
  const votes: (-1 | 0 | 1)[] = [];
  let requiredData = true;

  for (let j = 0; j < ids.length; j += 1) {
    averages[ids[j]] = ma[j][index] ?? null;
    const ang = angle(ma[j], index, config.angleLookback, atr);
    angles[ids[j]] = ang;
    // Com angulação desligada, as médias participam apenas do voto único
    // de alinhamento (se a trava estiver ligada), como no Pine v13.
    if (filters.useAngles && filters.voteOn[j]) {
      if (ang === null) requiredData = false;
      votes.push(voteForAngle(ang, config.angleThresholds[j]));
    }
  }

  const selected = ids.filter((_, i) => filters.voteOn[i]);
  const ascending = selected.every((id, i) =>
    i === 0 || (averages[selected[i - 1]] !== null && averages[id] !== null &&
      averages[selected[i - 1]]! > averages[id]!));
  const descending = selected.every((id, i) =>
    i === 0 || (averages[selected[i - 1]] !== null && averages[id] !== null &&
      averages[selected[i - 1]]! < averages[id]!));
  const aligned: MtfConfluencePoint["aligned"] =
    selected.length >= 2 && ascending ? "BUY" :
    selected.length >= 2 && descending ? "SELL" : null;

  const vwaps = vwapSeries(bars);
  const vwap = vwaps[index];
  // Pine "Ignorar após reinício": 3 barras M15 completas no mesmo dia.
  const today = bars[index].start.slice(0, 10);
  let dayBarIndex = index;
  while (dayBarIndex > 0 && bars[dayBarIndex - 1].start.slice(0, 10) === today) {
    dayBarIndex -= 1;
  }
  const vwapAngle = index - dayBarIndex >= config.vwapAngleLookback
    ? angle(vwaps, index, config.vwapAngleLookback, atr)
    : null;
  if (filters.useAngles && filters.useVwap) {
    // Ângulo da VWAP indisponível equivale a um voto neutro.
    votes.push(voteForAngle(vwapAngle, config.vwapAngleThreshold));
  }

  const tpvs = tpvSeries(bars);
  const tpv = tpvs[index];
  let tpvMean: number | null = null;
  let tpvDeviation: number | null = null;
  let tpvVote: MtfConfluencePoint["tpvVote"] = null;
  if (tpvs.length >= config.tpvPeriod) {
    const window = tpvs.slice(-config.tpvPeriod);
    tpvMean = window.reduce((sum, item) => sum + item, 0) / config.tpvPeriod;
    tpvDeviation = Math.sqrt(
      window.reduce((sum, item) => sum + (item - tpvMean!) ** 2, 0) / config.tpvPeriod,
    );
    tpvVote = Math.abs(tpv - tpvMean) <= tpvDeviation * config.tpvProximity
      ? 0 : tpv > tpvMean ? 1 : -1;
  }
  if (filters.useTpv) {
    if (tpvVote === null) requiredData = false;
    votes.push(tpvVote ?? 0);
  }
  // Pine v13: com o interruptor global de angulação desligado, o
  // alinhamento das médias usadas passa a ser UM critério votante.
  const alignmentEnabled = filters.requireAlignment && selected.length >= 2;
  if (!filters.useAngles && alignmentEnabled) {
    votes.push(aligned === "BUY" ? 1 : aligned === "SELL" ? -1 : 0);
    if (selected.some((id) => averages[id] === null)) requiredData = false;
  }

  // A VWAP sem ângulo não fornece voto; nunca usar ausência de dado como alta/baixa.
  const hasVotes = votes.length > 0;
  const allBuy = requiredData && hasVotes && votes.every((value) => value === 1);
  const allSell = requiredData && hasVotes && votes.every((value) => value === -1);
  const alignmentOk = !alignmentEnabled || aligned !== null;
  const zone: IndicatorZone =
    alignmentOk && allBuy && (!alignmentEnabled || aligned === "BUY") ? "GREEN" :
    alignmentOk && allSell && (!alignmentEnabled || aligned === "SELL") ? "RED" : "NONE";

  return {
    averages, angles, atr, vwap, vwapAngle, tpv, tpvMean,
    tpvDeviation, tpvVote, aligned, zone,
    showBackground: requiredData && alignmentOk && hasVotes,
  };
}

/** Avaliação causal somente sobre candles M2 já fechados; não emite ordens. */
export function calculateMtfConfluence(
  candles: Candle[],
  periods: readonly [number, number, number, number] = MTF_CONFLUENCE_DEFAULTS.periods,
  filters: MtfVoteFilters = DEFAULT_MTF_VOTE_FILTERS,
): MtfConfluenceEvaluation {
  if (periods.length !== 4 || periods.some((n) => !Number.isInteger(n) || n < 2 || n > 300)) {
    throw new Error("Períodos MTF inválidos: informe quatro inteiros entre 2 e 300.");
  }
  if (
    typeof filters.useAngles !== "boolean" ||
    typeof filters.requireAlignment !== "boolean" ||
    typeof filters.useVwap !== "boolean" ||
    typeof filters.useTpv !== "boolean" ||
    !Array.isArray(filters.voteOn) || filters.voteOn.length !== 4 ||
    !filters.voteOn.every((vote) => typeof vote === "boolean")
  ) throw new Error("Filtros de confluência MTF inválidos.");
  if (candles.length === 0) return { points: [], zone: "NONE" };
  const source = calculateCausalMtfAverages(candles, DEFAULT_CAUSAL_MTF_CONFIG);
  const completed: Bar[] = [];
  const points: MtfConfluencePoint[] = [];
  let previous: CausalMtfSnapshot | null = null;
  for (const snapshot of source) {
    if (previous && previous.indicatorBarStart !== snapshot.indicatorBarStart) {
      completed.push({ ...previous.aggregatedBar, start: previous.indicatorBarStart });
    }
    const bars: Bar[] = [
      ...completed,
      { ...snapshot.aggregatedBar, start: snapshot.indicatorBarStart },
    ];
    const evaluated = evaluateBars(bars, periods, filters);
    points.push({
      candleIndex: snapshot.candleIndex,
      timestamp: snapshot.timestamp,
      availableAt: snapshot.availableAt,
      barStart: snapshot.indicatorBarStart,
      ...evaluated,
    });
    previous = snapshot;
  }
  return { points, zone: points.at(-1)?.zone ?? "NONE" };
}
