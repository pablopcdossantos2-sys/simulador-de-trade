import { marketTimestampOrdinalMs } from "./marketTime";

/** Cronômetro do candle baseado no relógio do replay (não no relógio do PC).
 * Atualiza somente quando novos negócios sintéticos/históricos são revelados.
 * Durante pausa, mantém o valor; nunca usa dados futuros. */
export function remainingCandleSeconds(
  candleOpen: string | null,
  revealedTimestamp: string | null,
  timeframeMinutes: number,
): number | null {
  if (!candleOpen || !revealedTimestamp || !Number.isInteger(timeframeMinutes) || timeframeMinutes < 1) {
    return null;
  }
  try {
    const open = marketTimestampOrdinalMs(candleOpen);
    const current = marketTimestampOrdinalMs(revealedTimestamp);
    if (!Number.isFinite(open) || !Number.isFinite(current) || current < open) return null;
    return Math.max(0, Math.min(timeframeMinutes * 60,
      Math.ceil((open + timeframeMinutes * 60_000 - current) / 1_000),
    ));
  } catch {
    return null;
  }
}

export function formatCandleCountdown(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
