import type { Trade, TradeReview } from "../types";

export type ReviewPatternTrend = "IMPROVING" | "WORSENING" | "STABLE" | "INSUFFICIENT";
export type ReviewPatternStrength = "RECURRENT" | "EARLY_SIGNAL";

export interface TradeReviewPattern {
  key: string;
  title: string;
  description: string;
  count: number;
  sampleSize: number;
  percentage: number;
  strength: ReviewPatternStrength;
  trend: ReviewPatternTrend;
  recentPercentage: number | null;
  previousPercentage: number | null;
  recentSampleSize: number | null;
  previousSampleSize: number | null;
}

export interface TradeReviewInsights {
  reviewedTrades: number;
  recurrentPatterns: number;
  earlySignals: number;
  comparisonAvailable: boolean;
  recentWindowSize: number;
  previousWindowSize: number;
  patterns: TradeReviewPattern[];
}

interface PatternDefinition {
  key: string;
  title: string;
  description: string;
  matches: (trade: Trade, review: TradeReview) => boolean;
  applies?: (trade: Trade, review: TradeReview) => boolean;
}

const emotionLabels: Record<Exclude<TradeReview["emotionalInterference"], "NONE">, string> = {
  FEAR: "Medo",
  GREED: "Ganância",
  REVENGE: "Tentativa de recuperar prejuízo",
  FOMO: "FOMO (medo de ficar de fora)",
  HESITATION: "Hesitação",
  OTHER: "Outra interferência emocional",
};

const definitions: PatternDefinition[] = [
  {
    key: "ENTRY_OUTSIDE_PLAN",
    title: "Entradas fora do plano",
    description: "Operações em que a entrada foi registrada como fora do plano definido.",
    matches: (_trade, review) => review.entryExecution === "OUTSIDE_PLAN",
  },
  {
    key: "STOP_MOVED_AGAINST_PLAN",
    title: "Afastamento do stop",
    description: "O stop foi afastado para evitar a saída, contrariando o plano.",
    matches: (_trade, review) => review.stopDiscipline === "MOVED_AGAINST_PLAN",
  },
  {
    key: "PROFIT_CLOSED_EARLY",
    title: "Operações lucrativas encerradas antes do alvo",
    description: "Trades com resultado positivo em que o alvo foi abandonado por encerramento antecipado.",
    applies: (trade) => trade.netResultBRL > 0,
    matches: (_trade, review) => review.targetDiscipline === "CLOSED_EARLY",
  },
  {
    key: "TARGET_EXTENDED_WITHOUT_PLAN",
    title: "Extensão do alvo sem previsão",
    description: "O alvo foi estendido sem que essa possibilidade estivesse prevista no plano.",
    matches: (_trade, review) => review.targetDiscipline === "EXTENDED_WITHOUT_PLAN",
  },
  {
    key: "RULES_BROKEN",
    title: "Quebra de regras do operacional",
    description: "A avaliação registrou que uma ou mais regras foram quebradas.",
    matches: (_trade, review) => review.ruleAdherence === "BROKE",
  },
  ...(["FEAR", "GREED", "REVENGE", "FOMO", "HESITATION", "OTHER"] as const).map((emotion) => ({
    key: `EMOTION_${emotion}`,
    title: `Interferência emocional: ${emotionLabels[emotion]}`,
    description: `A avaliação registrou repetição de interferência associada a: ${emotionLabels[emotion].toLowerCase()}.`,
    matches: (_trade: Trade, review: TradeReview) => review.emotionalInterference === emotion,
  })),
];

function reviewedTrades(trades: Trade[]): Array<Trade & { review: TradeReview }> {
  return trades
    .filter((trade): trade is Trade & { review: TradeReview } => Boolean(trade.review))
    .sort((a, b) => {
      const aTime = Date.parse(a.review.reviewedAt) || Date.parse(a.closedAt) || 0;
      const bTime = Date.parse(b.review.reviewedAt) || Date.parse(b.closedAt) || 0;
      return aTime - bTime;
    });
}

function measure(
  definition: PatternDefinition,
  trades: Array<Trade & { review: TradeReview }>,
): { count: number; sampleSize: number; percentage: number | null } {
  const applicable = trades.filter((trade) => definition.applies?.(trade, trade.review) ?? true);
  const count = applicable.filter((trade) => definition.matches(trade, trade.review)).length;
  return {
    count,
    sampleSize: applicable.length,
    percentage: applicable.length > 0 ? (count / applicable.length) * 100 : null,
  };
}

function trendFor(
  definition: PatternDefinition,
  recent: Array<Trade & { review: TradeReview }>,
  previous: Array<Trade & { review: TradeReview }>,
): {
  trend: ReviewPatternTrend;
  recentPercentage: number | null;
  previousPercentage: number | null;
  recentSampleSize: number;
  previousSampleSize: number;
} {
  const recentMeasure = measure(definition, recent);
  const previousMeasure = measure(definition, previous);

  if (
    recentMeasure.sampleSize < 3 ||
    previousMeasure.sampleSize < 3 ||
    recentMeasure.percentage === null ||
    previousMeasure.percentage === null
  ) {
    return {
      trend: "INSUFFICIENT",
      recentPercentage: recentMeasure.percentage,
      previousPercentage: previousMeasure.percentage,
      recentSampleSize: recentMeasure.sampleSize,
      previousSampleSize: previousMeasure.sampleSize,
    };
  }

  const delta = recentMeasure.percentage - previousMeasure.percentage;
  if (delta <= -10) {
    return { trend: "IMPROVING", recentPercentage: recentMeasure.percentage, previousPercentage: previousMeasure.percentage, recentSampleSize: recentMeasure.sampleSize, previousSampleSize: previousMeasure.sampleSize };
  }
  if (delta >= 10) {
    return { trend: "WORSENING", recentPercentage: recentMeasure.percentage, previousPercentage: previousMeasure.percentage, recentSampleSize: recentMeasure.sampleSize, previousSampleSize: previousMeasure.sampleSize };
  }
  return { trend: "STABLE", recentPercentage: recentMeasure.percentage, previousPercentage: previousMeasure.percentage, recentSampleSize: recentMeasure.sampleSize, previousSampleSize: previousMeasure.sampleSize };
}

export function buildTradeReviewInsights(
  trades: Trade[],
  comparisonWindowSize = 10,
): TradeReviewInsights {
  const reviewed = reviewedTrades(trades);
  const recent = reviewed.slice(-comparisonWindowSize);
  const previous = reviewed.slice(-comparisonWindowSize * 2, -comparisonWindowSize);
  const comparisonAvailable = recent.length >= 5 && previous.length >= 5;

  const patterns = definitions
    .map((definition) => {
      const current = measure(definition, reviewed);
      if (current.count === 0 || current.percentage === null) return null;

      const strength: ReviewPatternStrength =
        reviewed.length >= 5 &&
        current.sampleSize >= 5 &&
        current.count >= 2 &&
        current.percentage >= 20
          ? "RECURRENT"
          : "EARLY_SIGNAL";

      const trend = comparisonAvailable
        ? trendFor(definition, recent, previous)
        : { trend: "INSUFFICIENT" as const, recentPercentage: null, previousPercentage: null, recentSampleSize: null, previousSampleSize: null };

      return {
        key: definition.key,
        title: definition.title,
        description: definition.description,
        count: current.count,
        sampleSize: current.sampleSize,
        percentage: current.percentage,
        strength,
        ...trend,
      };
    })
    .filter((pattern): pattern is TradeReviewPattern => pattern !== null)
    .sort((a, b) => {
      if (a.strength !== b.strength) return a.strength === "RECURRENT" ? -1 : 1;
      if (b.count !== a.count) return b.count - a.count;
      return b.percentage - a.percentage;
    });

  return {
    reviewedTrades: reviewed.length,
    recurrentPatterns: patterns.filter((pattern) => pattern.strength === "RECURRENT").length,
    earlySignals: patterns.filter((pattern) => pattern.strength === "EARLY_SIGNAL").length,
    comparisonAvailable,
    recentWindowSize: recent.length,
    previousWindowSize: previous.length,
    patterns,
  };
}
