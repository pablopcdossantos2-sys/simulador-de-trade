import type { Asset, MovingAverageSettings, TradingStrategyId } from "../types";
import type { ReplayCatalogEntry } from "../services/replayCatalog";
import type { SimulationPlan } from "./simulationPlan";
import { calculateSimulationPlan, DEFAULT_TIMEFRAME_MINUTES } from "./simulationPlan";
import { matchSimulationPlan, matchIsUsable, planIsReady, type RequirementMatch } from "./catalogMatch";

/** Uma data pode conter múltiplos formatos de replay; o matcher escolhe o mais adequado. */
export interface ReplayChoice {
  asset: Asset;
  date: string;
  plan: SimulationPlan | null;
  matches: RequirementMatch[];
  targetReady: boolean;
  ready: boolean;
  missing: RequirementMatch[];
  error: string | null;
}

export function replayChoiceForDate(
  entries: ReplayCatalogEntry[], asset: Asset, date: string,
  strategyId: TradingStrategyId, settings: MovingAverageSettings,
): ReplayChoice {
  try {
    const plan = calculateSimulationPlan({
      asset, date, timeframeMinutes: DEFAULT_TIMEFRAME_MINUTES,
      strategyId, movingAverages: settings,
    });
    const matches = matchSimulationPlan(plan, asset, entries);
    return {
      asset, date, plan, matches,
      targetReady: matches.some((match) => match.requirement.role === "TARGET" && matchIsUsable(match)),
      ready: planIsReady(matches),
      missing: matches.filter((match) => !matchIsUsable(match)),
      error: null,
    };
  } catch (error) {
    return {
      asset, date, plan: null, matches: [], targetReady: false,
      ready: false, missing: [], error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function replayChoicesFromCatalog(
  entries: ReplayCatalogEntry[],
  strategyId: TradingStrategyId,
  settings: MovingAverageSettings,
): ReplayChoice[] {
  const seen = new Set<string>();
  const choices: ReplayChoice[] = [];
  for (const entry of entries) {
    if (!entry.exists) continue;
    const key = `${entry.asset}|${entry.tradeDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const choice = replayChoiceForDate(entries, entry.asset, entry.tradeDate, strategyId, settings);
    // Datas fora do calendário suportado podem aquecer outros replays, mas não ser alvo.
    if (!choice.error) choices.push(choice);
  }
  return choices.sort((a, b) => b.date.localeCompare(a.date) || a.asset.localeCompare(b.asset));
}
