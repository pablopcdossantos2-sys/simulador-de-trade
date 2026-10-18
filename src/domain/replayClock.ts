export interface ReplayClockAnchor {
  /** Tempo de mercado virtual, em milissegundos, no ponto de ancoragem. */
  marketTimeMs: number;
  /** Tempo monotônico do computador no ponto de ancoragem. */
  wallTimeMs: number;
  /** Multiplicador: 10 significa 10 ms de mercado por 1 ms real. */
  speed: number;
}

/**
 * Converte o tempo real decorrido em tempo virtual do mercado.
 * A função usa relógio monotônico recebido pelo chamador, não o relógio civil.
 */
export function replayMarketTimeAt(
  anchor: ReplayClockAnchor,
  wallTimeMs: number,
): number {
  const elapsedWallMs = Math.max(0, wallTimeMs - anchor.wallTimeMs);
  return anchor.marketTimeMs + elapsedWallMs * anchor.speed;
}

/** Avança a âncora até agora e, opcionalmente, troca a velocidade sem salto temporal. */
export function reanchorReplayClock(
  anchor: ReplayClockAnchor,
  wallTimeMs: number,
  speed = anchor.speed,
): ReplayClockAnchor {
  return {
    marketTimeMs: replayMarketTimeAt(anchor, wallTimeMs),
    wallTimeMs,
    speed,
  };
}
