import type { Trade, TradeReview, TradeEntryContext } from "../types";
import { tickSizeFor } from "./marketSpecs";

export type ReviewContextDimension =
  | "ASSET"
  | "DIRECTION"
  | "INDICATOR_ZONE"
  | "VWAP_POSITION"
  | "ENTRY_CANDLE_BODY"
  | "ENTRY_CANDLE_RANGE";

export type ReviewContextAssociationStrength = "RECURRENT" | "EARLY_SIGNAL";

export interface TradeReviewContextAssociation {
  id: string;
  dimension: ReviewContextDimension;
  dimensionLabel: string;
  contextLabel: string;
  patternKey: string;
  patternTitle: string;
  count: number;
  sampleSize: number;
  percentage: number;
  baselineCount: number;
  baselineSampleSize: number;
  baselinePercentage: number;
  differencePercentagePoints: number;
  strength: ReviewContextAssociationStrength;
}

export interface TradeReviewContextInsights {
  reviewedTrades: number;
  reviewedWithContext: number;
  reviewedWithoutContext: number;
  contextCoveragePercentage: number;
  associations: TradeReviewContextAssociation[];
}

interface PatternDefinition {
  key: string;
  title: string;
  matches: (trade: Trade, review: TradeReview) => boolean;
  applies?: (trade: Trade, review: TradeReview) => boolean;
}

interface ContextDimensionDefinition {
  key: ReviewContextDimension;
  label: string;
  value: (trade: Trade) => string | null;
}

const patterns: PatternDefinition[] = [
  {
    key: "ENTRY_OUTSIDE_PLAN",
    title: "Entradas fora do plano",
    matches: (_trade, review) => review.entryExecution === "OUTSIDE_PLAN",
  },
  {
    key: "STOP_MOVED_AGAINST_PLAN",
    title: "Afastamento do stop",
    matches: (_trade, review) => review.stopDiscipline === "MOVED_AGAINST_PLAN",
  },
  {
    key: "PROFIT_CLOSED_EARLY",
    title: "Saída antecipada de operação lucrativa",
    applies: (trade) => trade.netResultBRL > 0,
    matches: (_trade, review) => review.targetDiscipline === "CLOSED_EARLY",
  },
  {
    key: "TARGET_EXTENDED_WITHOUT_PLAN",
    title: "Extensão do alvo sem previsão",
    matches: (_trade, review) => review.targetDiscipline === "EXTENDED_WITHOUT_PLAN",
  },
  {
    key: "RULES_BROKEN",
    title: "Quebra de regras do operacional",
    matches: (_trade, review) => review.ruleAdherence === "BROKE",
  },
  ...(["FEAR", "GREED", "REVENGE", "FOMO", "HESITATION", "OTHER"] as const).map((emotion) => ({
    key: "EMOTION_" + emotion,
    title: "Interferência emocional: " + emotion,
    matches: (_trade: Trade, review: TradeReview) => review.emotionalInterference === emotion,
  })),
];

function entryCandle(context: TradeEntryContext): TradeEntryContext["candles"][number] | null {
  return context.candles.find((candle) => candle.index === context.candleIndex)
    ?? context.candles.at(-1)
    ?? null;
}

function indicatorAtEntry(context: TradeEntryContext) {
  return context.indicatorSeries.find((point) => point.candleIndex === context.candleIndex)
    ?? context.indicatorSeries.at(-1)
    ?? null;
}

function vwapPosition(trade: Trade): string | null {
  const context = trade.entryContext;
  if (!context) return null;
  const vwap = indicatorAtEntry(context)?.vwap;
  if (vwap === null || vwap === undefined || !Number.isFinite(vwap)) return null;

  const difference = context.currentPrice - vwap;
  const tolerance = tickSizeFor(trade.asset) * 2;
  if (Math.abs(difference) <= tolerance) return "Próximo da VWAP (até 2 ticks)";
  return difference > 0 ? "Acima da VWAP" : "Abaixo da VWAP";
}

function candleBodyCondition(context: TradeEntryContext): string | null {
  const candle = entryCandle(context);
  if (!candle) return null;
  const range = candle.high - candle.low;
  if (!Number.isFinite(range) || range <= 0) return null;
  const bodyRatio = Math.abs(candle.close - candle.open) / range;
  if (bodyRatio < 0.25) return "Corpo pequeno (menos de 25% do range)";
  if (bodyRatio < 0.6) return "Corpo intermediário (25% a 60% do range)";
  return "Corpo dominante (60% ou mais do range)";
}

function candleRangeCondition(context: TradeEntryContext): string | null {
  const candle = entryCandle(context);
  if (!candle) return null;
  const previousRanges = context.candles
    .filter((item) => item.index < candle.index)
    .slice(-10)
    .map((item) => item.high - item.low)
    .filter((range) => Number.isFinite(range) && range > 0);
  if (previousRanges.length < 5) return null;

  const averageRange = previousRanges.reduce((sum, range) => sum + range, 0) / previousRanges.length;
  if (averageRange <= 0) return null;
  const relativeRange = (candle.high - candle.low) / averageRange;
  if (relativeRange >= 1.5) return "Range expandido (1,5× ou mais da média recente)";
  if (relativeRange <= 0.7) return "Range comprimido (até 0,7× da média recente)";
  return "Range próximo da média recente";
}

const dimensions: ContextDimensionDefinition[] = [
  {
    key: "ASSET",
    label: "Ativo",
    value: (trade) => trade.asset === "WINFUT" ? "WINFUT · Mini índice" : "WDOFUT · Mini dólar",
  },
  {
    key: "DIRECTION",
    label: "Direção",
    value: (trade) => trade.side === "BUY" ? "Compra" : "Venda",
  },
  {
    key: "INDICATOR_ZONE",
    label: "Zona do indicador na entrada",
    value: (trade) => {
      const zone = trade.entryContext?.zone;
      if (zone === "GREEN") return "Zona verde";
      if (zone === "RED") return "Zona vermelha";
      if (zone === "NONE") return "Sem zona ativa";
      return null;
    },
  },
  {
    key: "VWAP_POSITION",
    label: "Preço em relação à VWAP",
    value: vwapPosition,
  },
  {
    key: "ENTRY_CANDLE_BODY",
    label: "Corpo do candle de entrada",
    value: (trade) => trade.entryContext ? candleBodyCondition(trade.entryContext) : null,
  },
  {
    key: "ENTRY_CANDLE_RANGE",
    label: "Amplitude do candle de entrada",
    value: (trade) => trade.entryContext ? candleRangeCondition(trade.entryContext) : null,
  },
];

function reviewedTrades(trades: Trade[]): Array<Trade & { review: TradeReview }> {
  return trades.filter(
    (trade): trade is Trade & { review: TradeReview } => Boolean(trade.review),
  );
}

function isApplicable(
  definition: PatternDefinition,
  trade: Trade & { review: TradeReview },
): boolean {
  return definition.applies?.(trade, trade.review) ?? true;
}

export function buildTradeReviewContextInsights(trades: Trade[]): TradeReviewContextInsights {
  const reviewed = reviewedTrades(trades);
  const reviewedWithContext = reviewed.filter((trade) => Boolean(trade.entryContext));
  const associations: TradeReviewContextAssociation[] = [];

  for (const dimension of dimensions) {
    const dimensionTrades = reviewed
      .map((trade) => ({ trade, value: dimension.value(trade) }))
      .filter((item): item is { trade: Trade & { review: TradeReview }; value: string } => item.value !== null);

    for (const pattern of patterns) {
      const applicable = dimensionTrades.filter((item) => isApplicable(pattern, item.trade));
      if (applicable.length === 0) continue;
      const baselineCount = applicable.filter((item) => pattern.matches(item.trade, item.trade.review)).length;
      const baselinePercentage = (baselineCount / applicable.length) * 100;

      const groups = new Map<string, Array<Trade & { review: TradeReview }>>();
      for (const item of applicable) {
        const group = groups.get(item.value) ?? [];
        group.push(item.trade);
        groups.set(item.value, group);
      }

      for (const [contextLabel, group] of groups) {
        const count = group.filter((trade) => pattern.matches(trade, trade.review)).length;
        const sampleSize = group.length;
        if (sampleSize < 3 || count === 0) continue;

        const percentage = (count / sampleSize) * 100;
        const differencePercentagePoints = percentage - baselinePercentage;
        if (differencePercentagePoints < 10) continue;

        associations.push({
          id: `${dimension.key}:${pattern.key}:${contextLabel}`,
          dimension: dimension.key,
          dimensionLabel: dimension.label,
          contextLabel,
          patternKey: pattern.key,
          patternTitle: pattern.title,
          count,
          sampleSize,
          percentage,
          baselineCount,
          baselineSampleSize: applicable.length,
          baselinePercentage,
          differencePercentagePoints,
          strength: sampleSize >= 5 && count >= 2
            ? "RECURRENT"
            : "EARLY_SIGNAL",
        });
      }
    }
  }

  associations.sort((a, b) =>
    b.differencePercentagePoints - a.differencePercentagePoints
    || b.count - a.count
    || b.sampleSize - a.sampleSize,
  );

  return {
    reviewedTrades: reviewed.length,
    reviewedWithContext: reviewedWithContext.length,
    reviewedWithoutContext: reviewed.length - reviewedWithContext.length,
    contextCoveragePercentage: reviewed.length > 0
      ? (reviewedWithContext.length / reviewed.length) * 100
      : 0,
    associations: associations.slice(0, 12),
  };
}
