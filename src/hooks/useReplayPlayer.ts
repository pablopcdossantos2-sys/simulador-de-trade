import { useEffect, useRef, useState } from "react";
import type { ReplayTrade } from "../types";
import {
  closeReplaySession,
  nextReplayTrades,
  openReplayFile,
  resetReplaySession,
  type ReplaySessionInfo,
} from "../services/replayData";

const CHUNK_SIZE = 750;
const BASE_VISUAL_DELAY_MS = 90;
const CANDLE_MS = 2 * 60 * 1000;

function bucketKey(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Timestamp inválido no replay: ${timestamp}`);
  }
  return Math.floor(parsed / CANDLE_MS);
}

export function useReplayPlayer(onTrade: (trade: ReplayTrade) => void) {
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

    setBusy(true);
    setPlaying(false);
    setError(null);

    try {
      const info = await openReplayFile(
        normalized,
        expectedStart,
        expectedEnd,
      );
      queueRef.current = [];
      setSession(info);
      setProcessed(0);
      setCurrentTimestamp(null);
      setFinished(false);
      return info;
    } catch (reason) {
      setSession(null);
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function ensureQueue(): Promise<boolean> {
    if (queueRef.current.length > 0) return true;

    const chunk = await nextReplayTrades(CHUNK_SIZE);
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
    steppingRef.current = true;

    try {
      const available = await ensureQueue();
      if (!available) return null;

      const trade = queueRef.current.shift() ?? null;
      if (!trade) return null;

      applyTrade(trade);
      return trade;
    } catch (reason) {
      setPlaying(false);
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      steppingRef.current = false;
    }
  }

  async function pullOneCandle(): Promise<number> {
    if (!session || finished || steppingRef.current) return 0;
    steppingRef.current = true;
    setPlaying(false);

    try {
      let targetBucket =
        currentTimestamp === null ? null : bucketKey(currentTimestamp);
      let consumed = 0;

      while (true) {
        const available = await ensureQueue();
        if (!available) break;

        const next = queueRef.current[0];
        if (!next) break;

        const nextBucket = bucketKey(next.timestamp);
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
      setError(reason instanceof Error ? reason.message : String(reason));
      return 0;
    } finally {
      steppingRef.current = false;
    }
  }

  async function reset(): Promise<void> {
    if (!session) return;
    setBusy(true);
    setPlaying(false);
    setError(null);

    try {
      const info = await resetReplaySession();
      queueRef.current = [];
      setSession(info);
      setProcessed(0);
      setCurrentTimestamp(null);
      setFinished(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
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
      void closeReplaySession();
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
  };
}
