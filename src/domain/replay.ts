import type { Candle, ReplayTrade } from "../types";
import {
  bucketMarketTimestamp,
  marketTimestampOrdinalMs,
} from "./marketTime";

export const REPLAY_INTERVAL_SECONDS = 120;

/**
 * Atualiza a série de candles negócio a negócio no intervalo selecionado.
 *
 * Os timestamps tratados do Profit representam o relógio do mercado. Eles não
 * são convertidos para UTC, evitando deslocamentos de horário nas métricas e
 * no agrupamento da VWAP quando o app roda em outro fuso.
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

  const bucketTimestamp = bucketMarketTimestamp(
    trade.timestamp,
    intervalSeconds,
  );
  const bucketOrdinal = marketTimestampOrdinalMs(bucketTimestamp);
  const last = candles.at(-1);

  if (!last) {
    return [
      {
        index: 0,
        timestamp: bucketTimestamp,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity,
      },
    ];
  }

  const lastBucketOrdinal = marketTimestampOrdinalMs(last.timestamp);
  if (bucketOrdinal < lastBucketOrdinal) {
    throw new Error(
      "ReplayTrade fora de ordem cronológica. O leitor precisa normalizar a sequência antes da formação dos candles.",
    );
  }

  if (last.timestamp === bucketTimestamp) {
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
      timestamp: bucketTimestamp,
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
    (candles, trade) =>
      applyReplayTrade(candles, trade, intervalSeconds),
    [],
  );
}
