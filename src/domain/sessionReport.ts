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



export interface BlockedAttemptReason {
  reason: string;
  count: number;
  buyAttempts: number;
  sellAttempts: number;
}

export function blockedAttemptBreakdown(
  events: TrainingEvent[],
): BlockedAttemptReason[] {
  const grouped = new Map<string, BlockedAttemptReason>();

  for (const event of events) {
    if (event.type !== "BLOCKED_ATTEMPT") continue;

    const reason = event.reason?.trim() || "Regra não identificada";
    const current = grouped.get(reason) ?? {
      reason,
      count: 0,
      buyAttempts: 0,
      sellAttempts: 0,
    };

    current.count += 1;
    if (event.side === "BUY") current.buyAttempts += 1;
    if (event.side === "SELL") current.sellAttempts += 1;
    grouped.set(reason, current);
  }

  return Array.from(grouped.values()).sort(
    (a, b) => b.count - a.count || a.reason.localeCompare(b.reason),
  );
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
  const grossResultBRL = scopedTrades.reduce(
    (sum, trade) => sum + trade.grossResultBRL,
    0,
  );
  const operationalCostsBRL = scopedTrades.reduce(
    (sum, trade) => sum + trade.operationalCostsBRL,
    0,
  );
  const netResultBRL = scopedTrades.reduce(
    (sum, trade) => sum + trade.netResultBRL,
    0,
  );
  const summary = summarizeTraining(session, scopedEvents);
  const technicalIssues = scopedEvents.filter(
    (event) => event.type === "TECHNICAL_ISSUE",
  ).length;
  const usedSignalIds = new Set(
    scopedEvents
      .filter(
        (event) =>
          event.type === "TRADE_OPENED" && Boolean(event.signalId),
      )
      .map((event) => event.signalId as string),
  );
  const ignoredSignalIds = new Set(
    scopedEvents
      .filter(
        (event) =>
          event.type === "SIGNAL_IGNORED" && Boolean(event.signalId),
      )
      .map((event) => event.signalId as string),
  );
  const signalOpportunities = new Set([
    ...usedSignalIds,
    ...ignoredSignalIds,
  ]).size;
  const signalAdherencePct =
    signalOpportunities === 0
      ? 100
      : (usedSignalIds.size / signalOpportunities) * 100;

  const rMultiples = scopedTrades.map((trade) => {
    const initialRisk = Math.abs(trade.entry - trade.stopLoss);
    return initialRisk > 0 ? trade.resultPoints / initialRisk : 0;
  });
  const totalR = rMultiples.reduce((sum, value) => sum + value, 0);
  const expectancyR = safeAverage(rMultiples);

  let running = 0;
  let peak = 0;
  let maxDrawdownPoints = 0;
  for (const trade of scopedTrades) {
    running += trade.resultPoints;
    peak = Math.max(peak, running);
    maxDrawdownPoints = Math.max(maxDrawdownPoints, peak - running);
  }

  const buyTradesList = scopedTrades.filter((trade) => trade.side === "BUY");
  const sellTradesList = scopedTrades.filter((trade) => trade.side === "SELL");
  const buyNetPoints = buyTradesList.reduce(
    (sum, trade) => sum + trade.resultPoints,
    0,
  );
  const sellNetPoints = sellTradesList.reduce(
    (sum, trade) => sum + trade.resultPoints,
    0,
  );

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
    buyTrades: buyTradesList.length,
    sellTrades: sellTradesList.length,
    buyNetPoints,
    sellNetPoints,
    totalR,
    expectancyR,
    maxDrawdownPoints,
    grossResultBRL,
    operationalCostsBRL,
    netResultBRL,
    blockedAttempts: summary.blockedAttempts,
    technicalIssues,
    ignoredSignals: summary.ignoredSignals,
    signalAdherencePct,
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
