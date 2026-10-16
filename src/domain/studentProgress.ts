import type {
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";
import { calculateSessionPerformance } from "./sessionReport";

export interface StudentProgressPoint {
  sessionId: string;
  tradeDate: string;
  startedAt: string;
  asset: TrainingSession["asset"];
  mode: TrainingSession["mode"];
  trades: number;
  winRatePct: number;
  adherencePct: number;
  signalAdherencePct: number;
  totalR: number;
  netResultBRL: number;
  blockedAttempts: number;
  technicalIssues: number;
}

export interface StudentProgressSummary {
  sessions: number;
  trades: number;
  totalR: number;
  netResultBRL: number;
  averageAdherencePct: number;
  averageSignalAdherencePct: number;
  averageWinRatePct: number;
  blockedAttempts: number;
  technicalIssues: number;
}

export function buildStudentProgress(
  sessions: TrainingSession[],
  events: TrainingEvent[],
  trades: Trade[],
): StudentProgressPoint[] {
  return sessions
    .filter((session) => session.status === "ENDED")
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((session) => {
      const performance = calculateSessionPerformance(
        session,
        events,
        trades,
      );

      return {
        sessionId: session.id,
        tradeDate: session.tradeDate,
        startedAt: session.startedAt,
        asset: session.asset,
        mode: session.mode,
        trades: performance.totalTrades,
        winRatePct: performance.winRatePct,
        adherencePct: performance.executionAdherencePct,
        signalAdherencePct: performance.signalAdherencePct,
        totalR: performance.totalR,
        netResultBRL: performance.netResultBRL,
        blockedAttempts: performance.blockedAttempts,
        technicalIssues: performance.technicalIssues,
      };
    });
}

export function summarizeStudentProgress(
  points: StudentProgressPoint[],
): StudentProgressSummary {
  const average = (values: number[]) =>
    values.length === 0
      ? 0
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    sessions: points.length,
    trades: points.reduce((sum, point) => sum + point.trades, 0),
    totalR: points.reduce((sum, point) => sum + point.totalR, 0),
    netResultBRL: points.reduce(
      (sum, point) => sum + point.netResultBRL,
      0,
    ),
    averageAdherencePct: average(
      points.map((point) => point.adherencePct),
    ),
    averageSignalAdherencePct: average(
      points.map((point) => point.signalAdherencePct),
    ),
    averageWinRatePct: average(
      points.map((point) => point.winRatePct),
    ),
    blockedAttempts: points.reduce(
      (sum, point) => sum + point.blockedAttempts,
      0,
    ),
    technicalIssues: points.reduce(
      (sum, point) => sum + point.technicalIssues,
      0,
    ),
  };
}
