export interface UsageSessionRecord {
  id: string;
  startedAt: string;
  endedAt: string | null;
  lastActiveAt: string;
  activeSeconds: number;
}

const STORAGE_KEY = "simulador-de-trade:usage-sessions";
const CURRENT_SESSION_KEY = "simulador-de-trade:current-usage-session";
const HEARTBEAT_MS = 15_000;
const MAX_COUNTED_DELTA_MS = 30_000;

let heartbeat: number | null = null;
let currentSessionId: string | null = null;
let lastTickAt = 0;
let wasActive = false;
const listeners = new Set<() => void>();

function readSessions(): UsageSessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UsageSessionRecord[];
    return Array.isArray(parsed) ? parsed.filter((item) =>
      item && typeof item.id === "string" &&
      typeof item.startedAt === "string" &&
      Number.isFinite(item.activeSeconds),
    ) : [];
  } catch {
    return [];
  }
}

function writeSessions(sessions: UsageSessionRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // A falta de espaço ou a indisponibilidade do armazenamento não deve impedir o uso do simulador.
  }
  listeners.forEach((listener) => listener());
}

function isWindowActive(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `usage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadUsageSessions(): UsageSessionRecord[] {
  return readSessions().sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function subscribeUsageSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function startUsageTracking(): void {
  if (typeof window === "undefined" || heartbeat !== null) return;

  const now = new Date();
  const sessions = readSessions();
  let storedId: string | null = null;

  try {
    storedId = sessionStorage.getItem(CURRENT_SESSION_KEY);
  } catch {
    // O rastreamento continua funcionando sem sessionStorage.
  }

  let current = storedId
    ? sessions.find((item) => item.id === storedId && item.endedAt === null)
    : undefined;

  if (!current) {
    // Se o aplicativo foi encerrado inesperadamente, fecha o registro anterior
    // no último heartbeat confirmado, sem inventar tempo de uso.
    for (const item of sessions) {
      if (item.endedAt === null) item.endedAt = item.lastActiveAt || item.startedAt;
    }

    current = {
      id: makeId(),
      startedAt: now.toISOString(),
      endedAt: null,
      lastActiveAt: now.toISOString(),
      activeSeconds: 0,
    };
    sessions.push(current);

    try {
      sessionStorage.setItem(CURRENT_SESSION_KEY, current.id);
    } catch {
      // O ID em memória evita duplicidade durante a vida desta instância.
    }
    writeSessions(sessions);
  }

  currentSessionId = current.id;
  lastTickAt = Date.now();
  wasActive = isWindowActive();

  const flush = (finish = false): void => {
    if (!currentSessionId) return;
    const timestamp = Date.now();
    const elapsed = Math.max(0, Math.min(timestamp - lastTickAt, MAX_COUNTED_DELTA_MS));
    const records = readSessions();
    const record = records.find((item) => item.id === currentSessionId);
    if (!record) return;

    if (wasActive) record.activeSeconds += elapsed / 1000;
    record.lastActiveAt = new Date(timestamp).toISOString();
    if (finish) record.endedAt = record.lastActiveAt;

    writeSessions(records);
    lastTickAt = timestamp;
    wasActive = finish ? false : isWindowActive();

    if (finish) {
      currentSessionId = null;
      try {
        sessionStorage.removeItem(CURRENT_SESSION_KEY);
      } catch {
        // Sem ação adicional necessária.
      }
    }
  };

  const onFocus = (): void => {
    lastTickAt = Date.now();
    wasActive = isWindowActive();
  };
  const onBlur = (): void => {
    flush();
    wasActive = false;
  };
  const onVisibilityChange = (): void => {
    flush();
    wasActive = isWindowActive();
    lastTickAt = Date.now();
  };
  const onPageHide = (): void => flush(true);

  window.addEventListener("focus", onFocus);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  heartbeat = window.setInterval(() => flush(), HEARTBEAT_MS);
}
