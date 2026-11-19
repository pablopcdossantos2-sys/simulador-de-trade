import type { Candle } from "../types";

// Mesmo em sessões especiais, um dia civil não contém mais buckets do que isso.
export function replayHistoryCapacity(timeframeMinutes: number, warmupBars: number) {
  return Math.max(warmupBars, Math.ceil(24 * 60 / timeframeMinutes));
}

export function prepareReplayHistory(history: Candle[], warmupBars: number, previousDate: string) {
  const offset = Math.max(0, history.length - warmupBars);
  return {
    warmup: history.slice(offset),
    // Índices negativos são anteriores à janela dos indicadores. A sessão-alvo
    // continua começando em warmup.length, como nos replays já preparados.
    previous: history.flatMap((candle, index) => candle.timestamp.slice(0, 10) === previousDate
      ? [{ ...candle, index: index - offset }] : []),
  };
}
