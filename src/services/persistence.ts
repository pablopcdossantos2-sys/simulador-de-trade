import { invoke } from "@tauri-apps/api/core";
import { grossResultBRL } from "../domain/marketSpecs";
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

function normalizeTrade(raw: Trade): Trade {
  const contracts =
    Number.isInteger(raw.contracts) && raw.contracts > 0
      ? raw.contracts
      : 1;
  const storedGross = raw.grossResultBRL;
  const gross = Number.isFinite(storedGross)
    ? storedGross
    : grossResultBRL(raw.asset, raw.resultPoints, contracts);
  const operationalCostsBRL = Number.isFinite(raw.operationalCostsBRL)
    ? raw.operationalCostsBRL
    : 0;
  const requestedEntry = Number.isFinite(raw.requestedEntry)
    ? raw.requestedEntry
    : raw.entry;
  const slippageTicksPerSide =
    Number.isInteger(raw.slippageTicksPerSide) &&
    raw.slippageTicksPerSide >= 0
      ? raw.slippageTicksPerSide
      : 0;
  const costPerContractRoundTripBRL =
    Number.isFinite(raw.costPerContractRoundTripBRL) &&
    raw.costPerContractRoundTripBRL >= 0
      ? raw.costPerContractRoundTripBRL
      : 0;

  return {
    ...raw,
    requestedEntry,
    contracts,
    slippageTicksPerSide,
    costPerContractRoundTripBRL,
    intrabarPolicy:
      raw.intrabarPolicy === "TARGET_FIRST"
        ? "TARGET_FIRST"
        : "STOP_FIRST",
    grossResultBRL: gross,
    operationalCostsBRL,
    netResultBRL: Number.isFinite(raw.netResultBRL)
      ? raw.netResultBRL
      : gross - operationalCostsBRL,
    postTradeNote:
      typeof raw.postTradeNote === "string" ? raw.postTradeNote : "",
    entryContext:
      raw.entryContext && typeof raw.entryContext === "object"
        ? raw.entryContext
        : null,
  };
}

export async function loadTrades(): Promise<Trade[]> {
  if (isTauriRuntime()) {
    const trades = await invoke<Trade[]>("list_trades");
    return trades.map(normalizeTrade);
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  const trades = raw ? (JSON.parse(raw) as Trade[]) : [];
  return trades.map(normalizeTrade);
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


function normalizeTrainingSession(
  session: TrainingSession,
): TrainingSession {
  return {
    ...session,
    mode: session.mode === "EXAM" ? "EXAM" : "FREE",
  };
}

export async function loadTrainingSessions(): Promise<TrainingSession[]> {
  if (isTauriRuntime()) {
    const sessions = await invoke<TrainingSession[]>("list_training_sessions");
    return sessions
      .map(normalizeTrainingSession)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  const sessions = raw ? (JSON.parse(raw) as TrainingSession[]) : [];
  return sessions
    .map(normalizeTrainingSession)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function loadSessionTrades(
  sessionId: string,
): Promise<Trade[]> {
  if (isTauriRuntime()) {
    return invoke<Trade[]>("list_session_trades", { sessionId });
  }

  const events = await loadTrainingEvents(sessionId);
  const tradeIds = new Set(
    events
      .filter((event) => event.type === "TRADE_CLOSED" && event.tradeId)
      .map((event) => event.tradeId as string),
  );
  const trades = await loadTrades();
  return trades
    .filter((trade) => tradeIds.has(trade.id))
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt));
}


export async function loadAllTrainingEvents(): Promise<TrainingEvent[]> {
  if (isTauriRuntime()) {
    return invoke<TrainingEvent[]>("list_all_training_events");
  }

  const raw = localStorage.getItem(EVENT_STORAGE_KEY);
  const events = raw ? (JSON.parse(raw) as TrainingEvent[]) : [];
  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}


export async function loadAllTrades(): Promise<Trade[]> {
  if (isTauriRuntime()) {
    const trades = await invoke<Trade[]>("list_all_trades");
    return trades.map(normalizeTrade);
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  const trades = raw ? (JSON.parse(raw) as Trade[]) : [];
  return trades
    .map(normalizeTrade)
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt));
}
