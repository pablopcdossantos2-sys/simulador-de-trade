import type { TradingStrategyId } from "../types";

export const DEFAULT_TRADING_STRATEGY: TradingStrategyId = "MULTI_MEDIAS";
export const STRATEGY_NAMES: Record<TradingStrategyId, string> = {
  MULTI_MEDIAS: "Multi Médias — Nuvem e Sinais",
  MTF_ANGULACAO: "MMs MTF + Angulação",
};

export function strategyLabel(value: TradingStrategyId): string {
  return STRATEGY_NAMES[value];
}

export function normalizeStrategyId(value: unknown): TradingStrategyId {
  return value === "MTF_ANGULACAO" ? "MTF_ANGULACAO" : DEFAULT_TRADING_STRATEGY;
}

export function strategySelectionAllowed(
  activeSession: boolean,
  hasPosition: boolean,
  isBusy: boolean,
): boolean {
  return !activeSession && !hasPosition && !isBusy;
}
