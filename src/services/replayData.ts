import { invoke } from "@tauri-apps/api/core";
import type { Asset, Candle, ReplayTrade } from "../types";

export interface ReplaySessionInfo {
  sourcePath: string;
  symbol: string;
  asset: Asset;
  finished: boolean;
  sessionStart: string | null;
  sessionEnd: string | null;
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
