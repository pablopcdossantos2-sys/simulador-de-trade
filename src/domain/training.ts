import type {
  TrainingEvent,
  TrainingSession,
  TrainingSummary,
} from "../types";

export function summarizeTraining(
  session: TrainingSession,
  events: TrainingEvent[],
): TrainingSummary {
  const scoped = events.filter((event) => event.sessionId === session.id);
  const tradesExecuted = scoped.filter(
    (event) => event.type === "TRADE_OPENED",
  ).length;
  const blockedAttempts = scoped.filter(
    (event) => event.type === "BLOCKED_ATTEMPT",
  ).length;
  const ignoredSignals = scoped.filter(
    (event) => event.type === "SIGNAL_IGNORED",
  ).length;
  const closedTrades = scoped.filter(
    (event) => event.type === "TRADE_CLOSED",
  ).length;

  const attempts = tradesExecuted + blockedAttempts;
  const executionAdherencePct =
    attempts === 0 ? 100 : (tradesExecuted / attempts) * 100;

  return {
    tradesExecuted,
    blockedAttempts,
    ignoredSignals,
    closedTrades,
    executionAdherencePct,
  };
}

export function createTrainingSession(input: {
  asset: TrainingSession["asset"];
  tradeDate: string;
  startTime: string;
  endTime: string;
  timeframeMinutes: number;
  warmupBars: number;
  now?: Date;
}): TrainingSession {
  const now = input.now ?? new Date();

  return {
    id: crypto.randomUUID(),
    asset: input.asset,
    tradeDate: input.tradeDate,
    startTime: input.startTime,
    endTime: input.endTime,
    timeframeMinutes: input.timeframeMinutes,
    warmupBars: input.warmupBars,
    startedAt: now.toISOString(),
    endedAt: null,
    status: "ACTIVE",
  };
}

export function endTrainingSession(
  session: TrainingSession,
  now = new Date(),
): TrainingSession {
  return {
    ...session,
    status: "ENDED",
    endedAt: now.toISOString(),
  };
}

export function createTrainingEvent(input: {
  sessionId: string;
  type: TrainingEvent["type"];
  marketTimestamp?: string | null;
  signalId?: string | null;
  side?: TrainingEvent["side"];
  reason?: string | null;
  tradeId?: string | null;
  now?: Date;
}): TrainingEvent {
  const now = input.now ?? new Date();

  return {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    type: input.type,
    timestamp: now.toISOString(),
    marketTimestamp: input.marketTimestamp ?? null,
    signalId: input.signalId ?? null,
    side: input.side ?? null,
    reason: input.reason ?? null,
    tradeId: input.tradeId ?? null,
  };
}
