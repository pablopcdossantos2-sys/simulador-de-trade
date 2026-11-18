import { invoke } from "@tauri-apps/api/core";
import type { Asset } from "../types";

export interface ReplayCatalogEntry {
  outputPath: string;
  metadataPath: string;
  symbol: string;
  asset: Asset;
  tradeDate: string;
  sessionStart: string;
  sessionEnd: string;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  fileBytes: number;
  dataMode?: "CANDLES_M1_SYNTHETIC" | "CANDLES_M2_SYNTHETIC" | "TICK_LEGACY" | null;
  exists: boolean;
}

function ensureDesktop(): void {
  if (!("__TAURI_INTERNALS__" in window)) {
    throw new Error("O catálogo local está disponível no aplicativo desktop Tauri.");
  }
}

export async function registerReplayFile(
  outputPath: string,
): Promise<ReplayCatalogEntry> {
  ensureDesktop();
  return invoke<ReplayCatalogEntry>("register_replay_file", { outputPath });
}

export async function listReplayCatalog(): Promise<ReplayCatalogEntry[]> {
  ensureDesktop();
  return invoke<ReplayCatalogEntry[]>("list_replay_catalog");
}

export async function pruneMissingReplayCatalog(): Promise<ReplayCatalogEntry[]> {
  ensureDesktop();
  return invoke<ReplayCatalogEntry[]>("prune_missing_replay_catalog");
}

export async function removeReplayEntry(outputPath: string): Promise<void> {
  ensureDesktop();
  await invoke("remove_replay_entry", { outputPath });
}
