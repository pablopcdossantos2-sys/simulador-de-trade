import type { Asset } from "../types";
import { DEFAULT_MULTI_MEDIAS_CONFIG } from "../services/indicator";

export const DEFAULT_TIMEFRAME_MINUTES = 2;
export const STANDARD_WARMUP_MULTIPLIER = 5;
export const STRICT_WARMUP_MULTIPLIER = 10;

const B3_CLOSED_DATES_2026 = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-04-03",
  "2026-04-21",
  "2026-05-01",
  "2026-06-04",
  "2026-09-07",
  "2026-10-12",
  "2026-11-02",
  "2026-11-20",
  "2026-12-24",
  "2026-12-25",
  "2026-12-31",
]);

const FULL_SESSION_END_2026: Record<Asset, string> = {
  WINFUT: "18:00",
  WDOFUT: "18:30",
};

export type WarmupPolicy = "STANDARD" | "STRICT";

export interface SimulationPlanInput {
  asset: Asset;
  date: string;
  timeframeMinutes: number;
  startTime: string;
  endTime: string;
  warmupPolicy: WarmupPolicy;
}

export interface SimulationPlan {
  visibleMinutes: number;
  visibleBars: number;
  warmupBars: number;
  warmupMinutes: number;
  sameWindowSessionsNeeded: number;
  sameWindowPreviousDates: string[];
  fullSessionEnd: string;
  fullSessionBars: number;
  fullSessionsNeeded: number;
  fullSessionPreviousDates: string[];
  targetDate: string;
  targetStartTime: string;
  targetEndTime: string;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Horário inválido: ${value}`);
  }
  return hour * 60 + minute;
}

function dateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isB3TradingDate2026(value: string): boolean {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;

  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !B3_CLOSED_DATES_2026.has(value);
}

export function previousB3Sessions2026(
  targetDate: string,
  count: number,
): string[] {
  const cursor = new Date(`${targetDate}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime())) {
    throw new Error("Data de simulação inválida.");
  }

  const result: string[] = [];
  while (result.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const key = dateKey(cursor);
    if (isB3TradingDate2026(key)) result.push(key);
  }
  return result;
}

function barsForWindow(
  startTime: string,
  endTime: string,
  timeframeMinutes: number,
): { minutes: number; bars: number } {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (end <= start) {
    throw new Error("O horário final precisa ser posterior ao horário inicial.");
  }
  if (!Number.isFinite(timeframeMinutes) || timeframeMinutes <= 0) {
    throw new Error("Timeframe inválido.");
  }

  const minutes = end - start;
  return {
    minutes,
    bars: Math.floor(minutes / timeframeMinutes),
  };
}

export function calculateSimulationPlan(
  input: SimulationPlanInput,
): SimulationPlan {
  if (!isB3TradingDate2026(input.date)) {
    throw new Error(
      "A data selecionada não corresponde a um pregão normal da B3 no calendário 2026 incorporado.",
    );
  }

  const visible = barsForWindow(
    input.startTime,
    input.endTime,
    input.timeframeMinutes,
  );
  if (visible.bars < 1) {
    throw new Error("A janela selecionada não contém um candle completo.");
  }

  const multiplier =
    input.warmupPolicy === "STRICT"
      ? STRICT_WARMUP_MULTIPLIER
      : STANDARD_WARMUP_MULTIPLIER;
  const warmupBars = DEFAULT_MULTI_MEDIAS_CONFIG.emaSlowLength * multiplier;
  const warmupMinutes = warmupBars * input.timeframeMinutes;

  const sameWindowSessionsNeeded = Math.ceil(warmupBars / visible.bars);
  const fullSessionEnd = FULL_SESSION_END_2026[input.asset];
  const fullSession = barsForWindow(
    "09:00",
    fullSessionEnd,
    input.timeframeMinutes,
  );
  const fullSessionsNeeded = Math.ceil(warmupBars / fullSession.bars);

  return {
    visibleMinutes: visible.minutes,
    visibleBars: visible.bars,
    warmupBars,
    warmupMinutes,
    sameWindowSessionsNeeded,
    sameWindowPreviousDates: previousB3Sessions2026(
      input.date,
      sameWindowSessionsNeeded,
    ),
    fullSessionEnd,
    fullSessionBars: fullSession.bars,
    fullSessionsNeeded,
    fullSessionPreviousDates: previousB3Sessions2026(
      input.date,
      fullSessionsNeeded,
    ),
    targetDate: input.date,
    targetStartTime: input.startTime,
    targetEndTime: input.endTime,
  };
}
