import { invoke } from "@tauri-apps/api/core";
import type { Asset, Candle, ReplayTrade } from "../types";
import { consumeReplayBatches } from "../domain/replayAnalysis";

export interface ReplaySessionInfo {
  sourcePath: string;
  symbol: string;
  asset: Asset;
  finished: boolean;
  sessionStart: string | null;
  sessionEnd: string | null;
  mode: "CANDLES_M1_SYNTHETIC" | "CANDLES_M2_SYNTHETIC" | "TICK_LEGACY";
  synthetic: boolean;
  sourceTimeframeMinutes: number | null;
}

function ensureDesktop(): void {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error("O replay de arquivos locais está disponível no aplicativo desktop Tauri.");
  }
}

export async function openReplayFile(
  sourcePath: string,
  expectedStart?: string,
  expectedEnd?: string,
): Promise<ReplaySessionInfo> {
  ensureDesktop();
  return invoke<ReplaySessionInfo>("open_replay_file", {
    sourcePath,
    expectedStart,
    expectedEnd,
  });
}

export async function nextReplayTrades(
  maxEvents = 500,
): Promise<ReplayTrade[]> {
  ensureDesktop();
  return invoke<ReplayTrade[]>("next_replay_trades", { maxEvents });
}

export async function resetReplaySession(): Promise<ReplaySessionInfo> {
  ensureDesktop();
  return invoke<ReplaySessionInfo>("reset_replay_session");
}

export async function closeReplaySession(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  await invoke("close_replay_session");
}

export async function loadWarmupCandles(
  sourcePaths: string[],
  timeframeMinutes: number,
  maxBars: number,
): Promise<Candle[]> {
  ensureDesktop();
  return invoke<Candle[]>("load_warmup_candles", {
    sourcePaths,
    timeframeMinutes,
    maxBars,
  });
}

const ANALYSIS_BATCH_SIZE = 5000;
const MAX_COLLECTED_ANALYSIS_TRADES = 100_000;

function normalizeAnalysisPath(sourcePath: string): string {
  const normalized = sourcePath.trim().replace(/^"(.*)"$/, "$1");
  if (!normalized) throw new Error("Arquivo completo do replay não informado.");
  return normalized;
}

/**
 * Percorre o arquivo por um cursor independente, sem alterar o replay ativo.
 * Cada lote é entregue ao consumidor e pode ser descartado imediatamente.
 */
export async function streamFullReplayTrades(
  sourcePath: string,
  onBatch: (batch: ReplayTrade[]) => void | Promise<void>,
): Promise<number> {
  ensureDesktop();
  const normalized = normalizeAnalysisPath(sourcePath);
  await invoke("open_replay_analysis_file", { sourcePath: normalized });

  try {
    return await consumeReplayBatches(
      () => invoke<ReplayTrade[]>("next_replay_analysis_trades", {
        maxEvents: ANALYSIS_BATCH_SIZE,
      }),
      onBatch,
      ANALYSIS_BATCH_SIZE,
    );
  } finally {
    await invoke("close_replay_analysis_file");
  }
}

/**
 * Compatibilidade com consumidores que ainda precisam de um array.
 * A coleta é limitada; para arquivos maiores, use streamFullReplayTrades.
 */
export async function loadFullReplayTrades(sourcePath: string): Promise<ReplayTrade[]> {
  const trades: ReplayTrade[] = [];
  await streamFullReplayTrades(sourcePath, (batch) => {
    if (trades.length + batch.length > MAX_COLLECTED_ANALYSIS_TRADES) {
      throw new Error(
        `A análise excede o limite de ${MAX_COLLECTED_ANALYSIS_TRADES.toLocaleString("pt-BR")} negócios em memória. Use o processamento em lotes para analisar arquivos tick a tick grandes.`,
      );
    }
    trades.push(...batch);
  });
  return trades;
}
