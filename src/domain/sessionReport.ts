import type {
  SessionPerformance,
  Trade,
  TrainingEvent,
  TrainingEventClass,
  TrainingSession,
} from "../types";
import { summarizeTraining } from "./training";

export function classifyTrainingEvent(
  event: TrainingEvent,
): TrainingEventClass {
  switch (event.type) {
    case "BLOCKED_ATTEMPT":
      return "DISCIPLINE";
    case "TRADE_OPENED":
    case "TRADE_CLOSED":
      return "EXECUTION";
    case "SIGNAL_IGNORED":
      return "OBSERVATION";
    case "TECHNICAL_ISSUE":
      return "TECHNICAL";
    case "SESSION_STARTED":
    case "SESSION_ENDED":
      return "SESSION";
  }
}

function safeAverage(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateSessionPerformance(
  session: TrainingSession,
  events: TrainingEvent[],
  trades: Trade[],
): SessionPerformance {
  const scopedEvents = events.filter(
    (event) => event.sessionId === session.id,
  );
  const tradeIds = new Set(
    scopedEvents
      .filter((event) => event.type === "TRADE_CLOSED" && event.tradeId)
      .map((event) => event.tradeId as string),
  );

  const scopedTrades = trades.filter((trade) => tradeIds.has(trade.id));
  const wins = scopedTrades.filter((trade) => trade.resultPoints > 0);
  const losses = scopedTrades.filter((trade) => trade.resultPoints < 0);
  const grossProfit = wins.reduce(
    (sum, trade) => sum + trade.resultPoints,
    0,
  );
  const grossLossAbs = Math.abs(
    losses.reduce((sum, trade) => sum + trade.resultPoints, 0),
  );
  const netPoints = scopedTrades.reduce(
    (sum, trade) => sum + trade.resultPoints,
    0,
  );
  const summary = summarizeTraining(session, scopedEvents);
  const technicalIssues = scopedEvents.filter(
    (event) => event.type === "TECHNICAL_ISSUE",
  ).length;

  return {
    totalTrades: scopedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct:
      scopedTrades.length === 0
        ? 0
        : (wins.length / scopedTrades.length) * 100,
    netPoints,
    averagePoints: safeAverage(
      scopedTrades.map((trade) => trade.resultPoints),
    ),
    averageWinPoints: safeAverage(
      wins.map((trade) => trade.resultPoints),
    ),
    averageLossPoints: safeAverage(
      losses.map((trade) => Math.abs(trade.resultPoints)),
    ),
    payoff:
      losses.length === 0
        ? wins.length > 0
          ? null
          : 0
        : safeAverage(wins.map((trade) => trade.resultPoints)) /
          safeAverage(losses.map((trade) => Math.abs(trade.resultPoints))),
    profitFactor:
      grossLossAbs === 0
        ? grossProfit > 0
          ? null
          : 0
        : grossProfit / grossLossAbs,
    bestTradePoints:
      scopedTrades.length === 0
        ? 0
        : Math.max(...scopedTrades.map((trade) => trade.resultPoints)),
    worstTradePoints:
      scopedTrades.length === 0
        ? 0
        : Math.min(...scopedTrades.map((trade) => trade.resultPoints)),
    buyTrades: scopedTrades.filter((trade) => trade.side === "BUY").length,
    sellTrades: scopedTrades.filter((trade) => trade.side === "SELL").length,
    blockedAttempts: summary.blockedAttempts,
    technicalIssues,
    ignoredSignals: summary.ignoredSignals,
    executionAdherencePct: summary.executionAdherencePct,
  };
}

export interface HourBucket {
  hour: string;
  trades: number;
  netPoints: number;
}

export function performanceByHour(trades: Trade[]): HourBucket[] {
  const buckets = new Map<string, HourBucket>();

  for (const trade of trades) {
    const match = trade.openedAt.match(/T(\d{2}):/);
    const hour = match?.[1] ?? "--";
    const label = hour === "--" ? "Sem horário" : `${hour}:00`;
    const bucket = buckets.get(label) ?? {
      hour: label,
      trades: 0,
      netPoints: 0,
    };
    bucket.trades += 1;
    bucket.netPoints += trade.resultPoints;
    buckets.set(label, bucket);
  }

  return [...buckets.values()].sort((a, b) =>
    a.hour.localeCompare(b.hour),
  );
}
