import type { ReplayTrade } from "../types";
import { marketTimestampOrdinalMs } from "./marketTime";

function bucketKey(timestamp: string, timeframeMinutes: number): number {
  return Math.floor(
    marketTimestampOrdinalMs(timestamp) / (timeframeMinutes * 60 * 1000),
  );
}

/**
 * Conta os negócios consecutivos do candle que deve ser concluído.
 * targetTimestamp fixa o candle entre blocos consecutivos da fila.
 */
export function countTradesToCandleBoundary(
  trades: readonly ReplayTrade[],
  currentTimestamp: string | null,
  timeframeMinutes: number,
  targetTimestamp: string | null = null,
): number {
  if (!Number.isFinite(timeframeMinutes) || timeframeMinutes <= 0) {
    throw new Error("O timeframe do replay precisa ser maior que zero.");
  }
  if (trades.length === 0) return 0;

  const firstBucket = bucketKey(trades[0].timestamp, timeframeMinutes);
  const currentBucket =
    currentTimestamp === null
      ? null
      : bucketKey(currentTimestamp, timeframeMinutes);
  const targetBucket = targetTimestamp !== null
    ? bucketKey(targetTimestamp, timeframeMinutes)
    : currentBucket === null || currentBucket !== firstBucket
      ? firstBucket
      : currentBucket;

  let count = 0;
  while (
    count < trades.length &&
    bucketKey(trades[count].timestamp, timeframeMinutes) === targetBucket
  ) {
    count += 1;
  }
  return count;
}
