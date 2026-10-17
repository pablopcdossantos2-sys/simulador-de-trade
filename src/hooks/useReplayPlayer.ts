import { useEffect, useRef, useState } from "react";
import type { ReplayTrade } from "../types";
import { marketTimestampOrdinalMs } from "../domain/marketTime";
import {
  closeReplaySession,
  nextReplayTrades,
  openReplayFile,
  resetReplaySession,
  type ReplaySessionInfo,
} from "../services/replayData";

const CHUNK_SIZE = 750;
const BASE_VISUAL_DELAY_MS = 90;

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
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [processed, setProcessed] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queueRef = useRef<ReplayTrade[]>([]);
  const steppingRef = useRef(false);
  const onTradeRef = useRef(onTrade);
  const generationRef = useRef(0);

  useEffect(() => {
    onTradeRef.current = onTrade;
  }, [onTrade]);

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

    const delay = Math.max(10, Math.round(BASE_VISUAL_DELAY_MS / speed));
    const timer = window.setInterval(() => {
      void pullOne();
    }, delay);

    return () => window.clearInterval(timer);
  }, [playing, speed, session, finished]);

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
