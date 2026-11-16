import type { MovingAverageSettings, TradingStrategyId } from "../types";
import { DEFAULT_MULTI_MEDIAS_CONFIG } from "./indicator";
import { MTF_CONFLUENCE_DEFAULTS, DEFAULT_MTF_VOTE_FILTERS } from "./mtfConfluence";

const STORAGE_KEY = "simulador-de-trade:moving-average-config-v1";
export const MIN_MOVING_AVERAGE_PERIOD = 2;
export const MAX_MOVING_AVERAGE_PERIOD = 300;

export const DEFAULT_MOVING_AVERAGE_SETTINGS: MovingAverageSettings = {
  multiMedias: {
    emaFastLength: DEFAULT_MULTI_MEDIAS_CONFIG.emaFastLength,
    wmaLength: DEFAULT_MULTI_MEDIAS_CONFIG.wmaLength,
    emaSlowLength: DEFAULT_MULTI_MEDIAS_CONFIG.emaSlowLength,
  },
  mtf: {
    periods: [...MTF_CONFLUENCE_DEFAULTS.periods] as [number, number, number, number],
    filters: { ...DEFAULT_MTF_VOTE_FILTERS, voteOn: [...DEFAULT_MTF_VOTE_FILTERS.voteOn] },
  },
};

function validPeriod(value: unknown): value is number {
  return Number.isInteger(value) &&
    (value as number) >= MIN_MOVING_AVERAGE_PERIOD &&
    (value as number) <= MAX_MOVING_AVERAGE_PERIOD;
}

function validMulti(value: unknown): value is MovingAverageSettings["multiMedias"] {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return validPeriod(item.emaFastLength) && validPeriod(item.wmaLength) &&
    validPeriod(item.emaSlowLength) &&
    item.emaFastLength < item.wmaLength && item.wmaLength < item.emaSlowLength;
}

function validFilters(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const filters = raw as Record<string, unknown>;
  return typeof filters.useAngles === "boolean" &&
    typeof filters.requireAlignment === "boolean" &&
    typeof filters.useVwap === "boolean" &&
    typeof filters.useTpv === "boolean" &&
    Array.isArray(filters.voteOn) && filters.voteOn.length === 4 &&
    filters.voteOn.every((flag: unknown) => typeof flag === "boolean");
}

function validMtf(value: unknown): value is MovingAverageSettings["mtf"] {
  if (!value || typeof value !== "object") return false;
  const periods = (value as Record<string, unknown>).periods;
  return Array.isArray(periods) && periods.length === 4 &&
    periods.every(validPeriod) &&
    periods.every((item, index) => index === 0 || periods[index - 1] < item) &&
    (Object.prototype.hasOwnProperty.call(value, "filters") === false ||
     validFilters((value as Record<string, unknown>).filters));
}

export function defaultsForMovingAverages(): MovingAverageSettings {
  return {
    multiMedias: { ...DEFAULT_MOVING_AVERAGE_SETTINGS.multiMedias },
    mtf: {
      periods: [...DEFAULT_MOVING_AVERAGE_SETTINGS.mtf.periods] as [number, number, number, number],
      filters: { ...DEFAULT_MTF_VOTE_FILTERS, voteOn: [...DEFAULT_MTF_VOTE_FILTERS.voteOn] },
    },
  };
}

/** Não aceitar fragmentos inconsistentes: cada estratégia retorna ao padrão sem afetar a outra. */
export function normalizeMovingAverageSettings(raw: unknown): MovingAverageSettings {
  const defaults = defaultsForMovingAverages();
  if (!raw || typeof raw !== "object") return defaults;
  const value = raw as Record<string, unknown>;
  return {
    multiMedias: validMulti(value.multiMedias) ? { ...value.multiMedias } : defaults.multiMedias,
    mtf: validMtf(value.mtf) ? {
      periods: [...value.mtf.periods] as [number,number,number,number],
      filters: value.mtf.filters ? {
        ...value.mtf.filters, voteOn: [...value.mtf.filters.voteOn] as [boolean, boolean, boolean, boolean],
      } : defaults.mtf.filters,
    } : defaults.mtf,
  };
}

export function validateMovingAverageSettings(value: MovingAverageSettings, strategyId: TradingStrategyId): void {
  if (strategyId === "MULTI_MEDIAS" && !validMulti(value.multiMedias)) {
    throw new Error(
      "Use períodos inteiros de 2 a 300, na ordem MME rápida < MMP intermediária < MME lenta.",
    );
  }
  if (strategyId === "MTF_ANGULACAO" && !validMtf(value.mtf)) {
    throw new Error("Use quatro períodos inteiros de 2 a 300 em ordem crescente (M15).");
  }
}

export function loadMovingAverageSettings(): MovingAverageSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeMovingAverageSettings(JSON.parse(raw)) : defaultsForMovingAverages();
  } catch {
    return defaultsForMovingAverages();
  }
}

export function saveMovingAverageSettings(settings: MovingAverageSettings): MovingAverageSettings {
  validateMovingAverageSettings(settings, "MULTI_MEDIAS");
  validateMovingAverageSettings(settings, "MTF_ANGULACAO");
  const normalized = normalizeMovingAverageSettings(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function selectedMovingAveragesLabel(settings: MovingAverageSettings, strategyId: TradingStrategyId): string {
  if (strategyId === "MTF_ANGULACAO") {
    return `M15 MME ${settings.mtf.periods.join("/")}`;
  }
  const { emaFastLength, wmaLength, emaSlowLength } = settings.multiMedias;
  return `MME ${emaFastLength} · MMP ${wmaLength} · MME ${emaSlowLength}`;
}

/** Resumo legível dos critérios efetivamente habilitados no fundo M15. */
export function describeMtfVotes(settings: MovingAverageSettings): string {
  const filters = settings.mtf.filters ?? DEFAULT_MTF_VOTE_FILTERS;
  const selected = settings.mtf.periods.filter((_, index) => filters.voteOn[index]);
  const parts: string[] = [];
  if (filters.useAngles) {
    if (selected.length) parts.push(`Ângulos MME ${selected.join("/")}`);
    if (filters.useVwap) parts.push("VWAP");
  } else if (filters.requireAlignment && selected.length >= 2) {
    parts.push("Alinhamento das médias");
  }
  if (filters.requireAlignment && selected.length >= 2 && filters.useAngles) {
    parts.push("Alinhamento obrigatório");
  }
  if (filters.useTpv) parts.push("TPV");
  return parts.length ? parts.join(" · ") : "Nenhum critério votante — entradas bloqueadas";
}
