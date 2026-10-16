import { invoke } from "@tauri-apps/api/core";
import type { Trade } from "../types";

const STORAGE_KEY = "simulador-de-trade:trades";

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadTrades(): Promise<Trade[]> {
  if (isTauriRuntime()) {
    return invoke<Trade[]>("list_trades");
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Trade[]) : [];
}

export async function saveTrade(trade: Trade): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_trade", { trade });
    return;
  }

  const trades = await loadTrades();
  const next = [trade, ...trades.filter((item) => item.id !== trade.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
