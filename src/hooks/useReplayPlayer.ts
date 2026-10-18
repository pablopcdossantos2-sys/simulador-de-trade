import { useEffect, useRef, useState } from "react";
import type { ReplayTrade } from "../types";
import { marketTimestampOrdinalMs } from "../domain/marketTime";
import {
  replayMarketTimeAt,
  reanchorReplayClock,
  type ReplayClockAnchor,
} from "../domain/replayClock";
import {
  closeReplaySession,
  nextReplayTrades,
  openReplayFile,
  resetReplaySession,
  type ReplaySessionInfo,
} from "../services/replayData";

// O backend aceita até 5.000 negócios por chamada IPC.
const CHUNK_SIZE = 5000;
// Limita o trabalho de um único frame para a interface continuar responsiva.
// Se houver backlog, o relógio continua acumulando tempo e o próximo frame recupera.
const MAX_TRADES_PER_FRAME = 20_000;

function bucketKey(
  timestamp: string,
  timeframeMinutes: number,
): number {
  const candleMs = timeframeMinutes * 60 * 1000;
  return Math.floor(marketTimestampOrdinalMs(timestamp) / candleMs);
}

export function useReplayPlayer(
  onTrade: (trade: ReplayTrade) => void,
  timeframeMinutes = 2,
) {
  const [path, setPath] = useState("");
  const [session, setSession] = useState<ReplaySessionInfo | null>(null);
  const [playing, setPlayingState] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [processed, setProcessed] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queueRef = useRef<ReplayTrade[]>([]);
  const steppingRef = useRef(false);
  const onTradeRef = useRef(onTrade);
  const generationRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const clockRef = useRef<ReplayClockAnchor | null>(null);

  useEffect(() => {
    onTradeRef.current = onTrade;
  }, [onTrade]);

  function setPlaying(next: boolean) {
    if (next && !playingRef.current && clockRef.current) {
      // Pausas não consomem tempo de mercado.
      clockRef.current = {
        ...clockRef.current,
        wallTimeMs: performance.now(),
        speed: speedRef.current,
      };
    }
    playingRef.current = next;
    setPlayingState(next);
  }

  function setSpeed(next: number) {
    if (!Number.isFinite(next) || next <= 0) return;
    const now = performance.now();
    const clock = clockRef.current;
    if (clock) {
      clockRef.current = playingRef.current
        ? reanchorReplayClock(clock, now, next)
        : { ...clock, wallTimeMs: now, speed: next };
    }
    speedRef.current = next;
    setSpeedState(next);
  }

  async function loadReplay(
    expectedStart?: string,
    expectedEnd?: string,
    sourcePathOverride?: string,
  ): Promise<ReplaySessionInfo | null> {
    const normalized = (sourcePathOverride ?? path)
      .trim()
      .replace(/^"(.*)"$/, "$1");
    if (!normalized) {
      setError("Informe o caminho de um arquivo .replay.csv.");
      return null;
    }

    const generation = ++generationRef.current;
    clockRef.current = null;
    queueRef.current = [];
    setBusy(true);
    setPlaying(false);
    setError(null);

    try {
      const info = await openReplayFile(
        normalized,
        expectedStart,
        expectedEnd,
      );
      if (generation !== generationRef.current) return null;

      queueRef.current = [];
      setSession(info);
      setProcessed(0);
      setCurrentTimestamp(null);
      setFinished(false);
      return info;
    } catch (reason) {
      if (generation === generationRef.current) {
        setSession(null);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return null;
    } finally {
      if (generation === generationRef.current) setBusy(false);
    }
  }

  async function ensureQueue(generation: number): Promise<boolean> {
    if (generation !== generationRef.current) return false;
    if (queueRef.current.length > 0) return true;

    const chunk = await nextReplayTrades(CHUNK_SIZE);
    if (generation !== generationRef.current) return false;

    if (chunk.length === 0) {
      setFinished(true);
      setPlaying(false);
      return false;
    }

    queueRef.current = chunk;
    return true;
  }

  function applyTrade(trade: ReplayTrade) {
    onTradeRef.current(trade);
    setProcessed((value) => value + 1);
    setCurrentTimestamp(trade.timestamp);

    // Avanços manuais devem servir de ponto de partida para a próxima reprodução.
    if (!playingRef.current) {
      const now = performance.now();
      clockRef.current = {
        marketTimeMs: marketTimestampOrdinalMs(trade.timestamp),
        wallTimeMs: now,
        speed: speedRef.current,
      };
    }
  }

  async function pullOne(): Promise<ReplayTrade | null> {
    if (!session || finished || steppingRef.current) return null;
    const generation = generationRef.current;
    steppingRef.current = true;

    try {
      const available = await ensureQueue(generation);
      if (!available || generation !== generationRef.current) return null;

      const trade = queueRef.current.shift() ?? null;
      if (!trade) return null;

      applyTrade(trade);
      return trade;
    } catch (reason) {
      if (generation === generationRef.current) {
        setPlaying(false);
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return null;
    } finally {
      steppingRef.current = false;
    }
  }

  async function pullOneCandle(): Promise<number> {
    if (!session || finished || steppingRef.current) return 0;
    const generation = generationRef.current;
    steppingRef.current = true;
    setPlaying(false);

    try {
      let targetBucket =
        currentTimestamp === null
          ? null
          : bucketKey(currentTimestamp, timeframeMinutes);
      let consumed = 0;

      while (generation === generationRef.current) {
        const available = await ensureQueue(generation);
        if (!available || generation !== generationRef.current) break;

        const next = queueRef.current[0];
        if (!next) break;

        const nextBucket = bucketKey(next.timestamp, timeframeMinutes);
        if (targetBucket === null) {
          targetBucket = nextBucket;
        }

        if (nextBucket !== targetBucket && consumed > 0) {
          break;
        }

        if (nextBucket !== targetBucket && consumed === 0) {
          targetBucket = nextBucket;
        }

        const trade = queueRef.current.shift();
        if (!trade) break;

        applyTrade(trade);
        consumed += 1;
      }

      return consumed;
    } catch (reason) {
      if (generation === generationRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return 0;
    } finally {
      steppingRef.current = false;
    }
  }

  async function reset(): Promise<boolean> {
    if (!session) return false;
    const generation = ++generationRef.current;
    clockRef.current = null;
    queueRef.current = [];
    setBusy(true);
    setPlaying(false);
    setError(null);

    try {
      const info = await resetReplaySession();
      if (generation !== generationRef.current) return false;

      queueRef.current = [];
      setSession(info);
      setProcessed(0);
      setCurrentTimestamp(null);
      setFinished(false);
      return true;
    } catch (reason) {
      if (generation === generationRef.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      return false;
    } finally {
      if (generation === generationRef.current) setBusy(false);
    }
  }

  async function unload(): Promise<void> {
    ++generationRef.current;
    clockRef.current = null;
    setPlaying(false);
    setBusy(false);
    queueRef.current = [];
    steppingRef.current = false;

    try {
      await closeReplaySession();
    } finally {
      setSession(null);
      setProcessed(0);
      setCurrentTimestamp(null);
      setFinished(false);
      setError(null);
    }
  }

  useEffect(() => {
    if (!playing || !session || finished) return;

    const generation = generationRef.current;
    let cancelled = false;
    let frameId = 0;

    async function runFrame(): Promise<void> {
      if (cancelled || generation !== generationRef.current || !playingRef.current) {
        return;
      }

      let processedThisFrame = 0;
      let lastProcessed: ReplayTrade | null = null;
      let hitFrameLimit = false;

      try {
        if (!clockRef.current) {
          const available = await ensureQueue(generation);
          if (
            !available ||
            cancelled ||
            generation !== generationRef.current ||
            !playingRef.current
          ) {
            return;
          }

          const first = queueRef.current[0];
          if (!first) return;
          const anchorTimestamp = currentTimestamp ?? first.timestamp;
          const now = performance.now();
          clockRef.current = {
            marketTimeMs: marketTimestampOrdinalMs(anchorTimestamp),
            wallTimeMs: now,
            speed: speedRef.current,
          };
        }

        while (
          !cancelled &&
          generation === generationRef.current &&
          playingRef.current
        ) {
          if (queueRef.current.length === 0) {
            const available = await ensureQueue(generation);
            if (
              !available ||
              cancelled ||
              generation !== generationRef.current ||
              !playingRef.current
            ) {
              break;
            }
          }

          const next = queueRef.current[0];
          if (!next || !clockRef.current) break;

          const targetMarketTime = replayMarketTimeAt(
            clockRef.current,
            performance.now(),
          );
          if (marketTimestampOrdinalMs(next.timestamp) > targetMarketTime) {
            break;
          }

          const trade = queueRef.current.shift();
          if (!trade) break;

          // Processa cada negócio na ordem histórica, mas agrupa a atualização
          // visual por frame para que a velocidade não dependa de 1 timer por negócio.
          onTradeRef.current(trade);
          processedThisFrame += 1;
          lastProcessed = trade;

          if (processedThisFrame >= MAX_TRADES_PER_FRAME) {
            hitFrameLimit = true;
            break;
          }
        }

        if (generation === generationRef.current && processedThisFrame > 0 && lastProcessed) {
          setProcessed((value) => value + processedThisFrame);
          setCurrentTimestamp(lastProcessed.timestamp);
        }

        if (
          !cancelled &&
          generation === generationRef.current &&
          playingRef.current
        ) {
          if (!hitFrameLimit && clockRef.current) {
            const now = performance.now();
            clockRef.current = {
              marketTimeMs: replayMarketTimeAt(clockRef.current, now),
              wallTimeMs: now,
              speed: speedRef.current,
            };
          }

          frameId = window.requestAnimationFrame(() => {
            void runFrame();
          });
        }
      } catch (reason) {
        if (generation === generationRef.current) {
          setPlaying(false);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    }

    frameId = window.requestAnimationFrame(() => {
      void runFrame();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);

      // Congela o relógio no momento da pausa. O tempo parado não avança o replay.
      if (clockRef.current) {
        const now = performance.now();
        clockRef.current = reanchorReplayClock(
          clockRef.current,
          now,
          speedRef.current,
        );
      }
    };
  }, [playing, session, finished]);

  useEffect(
    () => () => {
      ++generationRef.current;
      void closeReplaySession().catch(() => undefined);
    },
    [],
  );

  return {
    path,
    setPath,
    session,
    playing,
    setPlaying,
    speed,
    setSpeed,
    processed,
    currentTimestamp,
    finished,
    busy,
    error,
    loadReplay,
    step: pullOne,
    stepCandle: pullOneCandle,
    reset,
    unload,
  };
}
