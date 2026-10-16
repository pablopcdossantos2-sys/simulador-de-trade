import type { Candle, ReplayTrade } from "../types";

export const REPLAY_INTERVAL_SECONDS = 120;

function bucketStartMs(timestamp: string, intervalSeconds: number): number {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Timestamp de replay inválido: ${timestamp}`);
  }

  const intervalMs = intervalSeconds * 1000;
  return Math.floor(parsed / intervalMs) * intervalMs;
}

function sameBucket(candle: Candle, bucketMs: number): boolean {
  return Date.parse(candle.timestamp) === bucketMs;
}

/**
 * Atualiza a série M2 negócio a negócio.
 *
 * Pré-condição: os ReplayTrade precisam chegar em ordem cronológica.
 * Arquivos DESCENDING serão reordenados pelo leitor antes de alcançar este motor.
 */
export function applyReplayTrade(
  candles: Candle[],
  trade: ReplayTrade,
  intervalSeconds = REPLAY_INTERVAL_SECONDS,
): Candle[] {
  if (intervalSeconds <= 0) {
    throw new Error("O intervalo do replay precisa ser maior que zero.");
  }
  if (!Number.isFinite(trade.price) || trade.price <= 0) {
    throw new Error("Preço de replay inválido.");
  }
  if (!Number.isFinite(trade.quantity) || trade.quantity <= 0) {
    throw new Error("Quantidade de replay inválida.");
  }

  const bucketMs = bucketStartMs(trade.timestamp, intervalSeconds);
  const last = candles.at(-1);

  if (!last) {
    return [
      {
        index: 0,
        timestamp: new Date(bucketMs).toISOString(),
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity,
      },
    ];
  }

  const lastBucketMs = Date.parse(last.timestamp);
  if (bucketMs < lastBucketMs) {
    throw new Error(
      "ReplayTrade fora de ordem cronológica. O leitor precisa normalizar a sequência antes da formação M2.",
    );
  }

  if (sameBucket(last, bucketMs)) {
    const updated: Candle = {
      ...last,
      high: Math.max(last.high, trade.price),
      low: Math.min(last.low, trade.price),
      close: trade.price,
      volume: last.volume + trade.quantity,
    };

    return [...candles.slice(0, -1), updated];
  }

  return [
    ...candles,
    {
      index: last.index + 1,
      timestamp: new Date(bucketMs).toISOString(),
      open: trade.price,
      high: trade.price,
      low: trade.price,
      close: trade.price,
      volume: trade.quantity,
    },
  ];
}

export function buildReplayCandles(
  trades: ReplayTrade[],
  intervalSeconds = REPLAY_INTERVAL_SECONDS,
): Candle[] {
  return trades.reduce<Candle[]>(
    (candles, trade) => applyReplayTrade(candles, trade, intervalSeconds),
    [],
  );
}
