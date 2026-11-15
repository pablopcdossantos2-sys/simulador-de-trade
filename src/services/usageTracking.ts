import { invoke } from "@tauri-apps/api/core";

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
let sessionsCache: UsageSessionRecord[] = [];
const listeners = new Set<() => void>();

function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function readLegacySessions(): UsageSessionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UsageSessionRecord[];
    return Array.isArray(parsed) ? parsed.filter((item) =>
      item && typeof item.id === "string" &&
      typeof item.startedAt === "string" &&
      typeof item.lastActiveAt === "string" &&
      Number.isFinite(item.activeSeconds) && item.activeSeconds >= 0,
    ) : [];
  } catch {
    return [];
  }
}

function saveLegacySessions(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsCache));
  } catch {
    // O histórico não deve impedir o uso do simulador se o armazenamento estiver indisponível.
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function replaceCache(sessions: UsageSessionRecord[]): void {
  sessionsCache = sessions;
  notify();
}

function persistSession(record: UsageSessionRecord): void {
  const index = sessionsCache.findIndex((item) => item.id === record.id);
  if (index >= 0) sessionsCache[index] = record;
  else sessionsCache.push(record);

  if (!isDesktop()) {
    saveLegacySessions();
    notify();
    return;
  }

  // O cache da interface é atualizado imediatamente; o SQLite recebe apenas a sessão alterada.
  notify();
  void invoke("save_usage_session", { session: record }).catch(() => {
    // Mantém uma cópia local de contingência se o banco estiver temporariamente indisponível.
    saveLegacySessions();
  });
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
  return [...sessionsCache].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function subscribeUsageSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function refreshUsageSessions(): Promise<void> {
  if (isDesktop()) {
    try {
      replaceCache(await invoke<UsageSessionRecord[]>("list_usage_sessions"));
      return;
    } catch {
      // Mantém o último cache disponível em caso de falha temporária do banco.
    }
  }
  replaceCache(readLegacySessions());
}

export function startUsageTracking(): void {
  if (typeof window === "undefined" || heartbeat !== null) return;

  // Sentinel impede duas inicializações concorrentes antes de o primeiro await terminar.
  heartbeat = -1;

  const initialize = async (): Promise<void> => {
    let sessions: UsageSessionRecord[] = [];
    if (isDesktop()) {
      try {
        sessions = await invoke<UsageSessionRecord[]>("list_usage_sessions");
        const legacy = readLegacySessions();
        if (legacy.length > 0) {
          // Mescla o legado mesmo se uma migração anterior tiver sido interrompida.
          // Só grava sobre um registro existente quando o legado for mais recente.
          for (const session of legacy) {
            const existing = sessions.find((item) => item.id === session.id);
            if (!existing || session.lastActiveAt > existing.lastActiveAt) {
              await invoke("save_usage_session", { session });
            }
          }
          sessions = await invoke<UsageSessionRecord[]>("list_usage_sessions");
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* Migração concluída no SQLite. */ }
        }
      } catch {
        sessions = readLegacySessions();
      }
    } else {
      sessions = readLegacySessions();
    }
    replaceCache(sessions);

    const now = new Date();
    let storedId: string | null = null;
    try {
      storedId = sessionStorage.getItem(CURRENT_SESSION_KEY);
    } catch {
      // O rastreamento continua funcionando sem sessionStorage.
    }

    let current = storedId
      ? sessionsCache.find((item) => item.id === storedId && item.endedAt === null)
      : undefined;

    if (!current) {
      // Fecha sessões abandonadas no último heartbeat confirmado, sem inventar tempo.
      for (const item of sessionsCache) {
        if (item.endedAt === null) {
          persistSession({ ...item, endedAt: item.lastActiveAt || item.startedAt });
        }
      }

      current = {
        id: makeId(),
        startedAt: now.toISOString(),
        endedAt: null,
        lastActiveAt: now.toISOString(),
        activeSeconds: 0,
      };
      try { sessionStorage.setItem(CURRENT_SESSION_KEY, current.id); } catch { /* ID mantido em memória. */ }
      persistSession(current);
    }

    currentSessionId = current.id;
    lastTickAt = Date.now();
    wasActive = isWindowActive();

    const flush = (finish = false): void => {
      if (!currentSessionId) return;
      const timestamp = Date.now();
      const elapsed = Math.max(0, Math.min(timestamp - lastTickAt, MAX_COUNTED_DELTA_MS));
      const record = sessionsCache.find((item) => item.id === currentSessionId);
      if (!record) return;

      persistSession({
        ...record,
        activeSeconds: record.activeSeconds + (wasActive ? elapsed / 1000 : 0),
        lastActiveAt: new Date(timestamp).toISOString(),
        endedAt: finish ? new Date(timestamp).toISOString() : null,
      });
      lastTickAt = timestamp;
      wasActive = finish ? false : isWindowActive();

      if (finish) {
        currentSessionId = null;
        try { sessionStorage.removeItem(CURRENT_SESSION_KEY); } catch { /* Sem ação adicional. */ }
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
  };

  void initialize().catch(() => {
    heartbeat = null;
  });
}
