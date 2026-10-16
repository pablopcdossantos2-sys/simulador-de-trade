import { invoke } from "@tauri-apps/api/core";
import type {
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";

const STORAGE_KEY = "simulador-de-trade:trades";
const SESSION_STORAGE_KEY = "simulador-de-trade:training-sessions";
const EVENT_STORAGE_KEY = "simulador-de-trade:training-events";

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


export async function saveTrainingSession(
  session: TrainingSession,
): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_training_session", { session });
    return;
  }

  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  const sessions = raw ? (JSON.parse(raw) as TrainingSession[]) : [];
  const next = [
    session,
    ...sessions.filter((item) => item.id !== session.id),
  ];
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
}

export async function saveTrainingEvent(
  event: TrainingEvent,
): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_training_event", { event });
    return;
  }

  const raw = localStorage.getItem(EVENT_STORAGE_KEY);
  const events = raw ? (JSON.parse(raw) as TrainingEvent[]) : [];
  const next = [
    event,
    ...events.filter((item) => item.id !== event.id),
  ];
  localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(next));
}

export async function loadTrainingEvents(
  sessionId: string,
): Promise<TrainingEvent[]> {
  if (isTauriRuntime()) {
    return invoke<TrainingEvent[]>("list_training_events", { sessionId });
  }

  const raw = localStorage.getItem(EVENT_STORAGE_KEY);
  const events = raw ? (JSON.parse(raw) as TrainingEvent[]) : [];
  return events
    .filter((event) => event.sessionId === sessionId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
