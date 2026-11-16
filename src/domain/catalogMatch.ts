import type { SimulationDataRequirement, SimulationPlan } from "./simulationPlan";
import type { ReplayCatalogEntry } from "../services/replayCatalog";
import type { Asset } from "../types";

export interface RequirementMatch {
  requirement: SimulationDataRequirement;
  entry: ReplayCatalogEntry | null;
  status: "AVAILABLE" | "AVAILABLE_WITH_NOTICE" | "MISSING" |
    "CONTRACT_MISMATCH" | "INCOMPLETE";
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

// A janela é o pedido de planejamento, não a prova de que houve um negócio
// em seu primeiro ou último minuto. Um pregão real pode iniciar depois ou
// encerrar antes do programado; nunca completar horários com preços fictícios.
function timestampCandleMinute(value: string | null, day: string): number | null {
  if (!value || !value.startsWith(`${day}T`)) return null;
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:$|[.Z+-])/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59 || Number(match[3]) !== 0) return null;
  return hour * 60 + minute;
}

function isCandleReplay(entry: ReplayCatalogEntry): boolean {
  return entry.dataMode === "CANDLES_M1_SYNTHETIC" ||
    entry.dataMode === "CANDLES_M2_SYNTHETIC";
}

export function entryCoversRequirement(
  entry: ReplayCatalogEntry,
  requirement: SimulationDataRequirement,
  asset: Asset,
): boolean {
  if (!entry.exists || entry.asset !== asset ||
      entry.tradeDate !== requirement.date) return false;
  if (requirement.role === "TARGET") {
    return entry.sessionStart === requirement.startTime &&
      entry.sessionEnd === requirement.endTime;
  }
  return minutes(entry.sessionStart) <= minutes(requirement.startTime) &&
    minutes(entry.sessionEnd) >= minutes(requirement.endTime);
}

export function entryHasValidObservedInterval(
  entry: ReplayCatalogEntry,
  requirement: SimulationDataRequirement,
): boolean {
  // Negócios legados não seguem a grade de candles.
  if (!isCandleReplay(entry)) return true;
  const first = timestampCandleMinute(entry.firstTimestamp, requirement.date);
  const last = timestampCandleMinute(entry.lastTimestamp, requirement.date);
  // Rejeitar metadata ausente, invertida, de outra data ou integralmente
  // fora da janela, mas aceitar extremos anteriores ao fim programado.
  return first !== null && last !== null && last >= first &&
    first < minutes(requirement.endTime) &&
    last >= minutes(requirement.startTime);
}

export function entryHasRequiredCandleCoverage(
  entry: ReplayCatalogEntry,
  requirement: SimulationDataRequirement,
): boolean {
  if (!entryHasValidObservedInterval(entry, requirement)) return false;
  if (!isCandleReplay(entry)) return true;
  const first = timestampCandleMinute(entry.firstTimestamp, requirement.date)!;
  const last = timestampCandleMinute(entry.lastTimestamp, requirement.date)!;
  const width = entry.dataMode === "CANDLES_M1_SYNTHETIC" ? 1 : 2;
  return first <= minutes(requirement.startTime) &&
    last + width >= minutes(requirement.endTime);
}

function bestCoverage(
  entries: ReplayCatalogEntry[],
  requirement: SimulationDataRequirement,
  asset: Asset,
): ReplayCatalogEntry[] {
  const rank = (entry: ReplayCatalogEntry) =>
    !entryHasValidObservedInterval(entry, requirement) ? 2 :
    entryHasRequiredCandleCoverage(entry, requirement) ? 0 : 1;
  const fidelity = (entry: ReplayCatalogEntry) =>
    entry.dataMode === "TICK_LEGACY" ? 0 :
    entry.dataMode === "CANDLES_M1_SYNTHETIC" ? 1 : 2;
  return entries
    .filter((entry) => entryCoversRequirement(entry, requirement, asset))
    .sort((a, b) =>
      rank(a) - rank(b) ||
      (minutes(a.sessionEnd) - minutes(a.sessionStart)) -
        (minutes(b.sessionEnd) - minutes(b.sessionStart)) ||
      fidelity(a) - fidelity(b),
    );
}

function usableStatus(
  entry: ReplayCatalogEntry,
  requirement: SimulationDataRequirement,
): "AVAILABLE" | "AVAILABLE_WITH_NOTICE" {
  return entryHasRequiredCandleCoverage(entry, requirement)
    ? "AVAILABLE" : "AVAILABLE_WITH_NOTICE";
}

export function matchSimulationPlan(
  plan: SimulationPlan,
  asset: Asset,
  entries: ReplayCatalogEntry[],
): RequirementMatch[] {
  const target = plan.dataRequirements.find((item) => item.role === "TARGET");
  const targetEntry = target
    ? bestCoverage(entries, target, asset).find((entry) =>
        entryHasValidObservedInterval(entry, target))
    : null;
  const targetSymbol = targetEntry?.symbol ?? null;

  return plan.dataRequirements.map((requirement): RequirementMatch => {
    const candidates = bestCoverage(entries, requirement, asset);
    const valid = candidates.filter((entry) =>
      entryHasValidObservedInterval(entry, requirement));
    if (requirement.role === "TARGET") {
      return {
        requirement,
        entry: valid[0] ?? candidates[0] ?? null,
        status: valid.length ? usableStatus(valid[0], requirement)
          : candidates.length ? "INCOMPLETE" : "MISSING",
      };
    }
    if (!candidates.length) return { requirement, entry: null, status: "MISSING" };
    if (!valid.length) {
      return { requirement, entry: candidates[0], status: "INCOMPLETE" };
    }
    if (!targetSymbol) {
      return { requirement, entry: valid[0], status: usableStatus(valid[0], requirement) };
    }
    const sameContract = valid.find((entry) => entry.symbol === targetSymbol);
    if (sameContract) {
      return {
        requirement,
        entry: sameContract,
        status: usableStatus(sameContract, requirement),
      };
    }
    return {
      requirement,
      entry: valid[0],
      status: "CONTRACT_MISMATCH",
    };
  });
}

export function matchIsUsable(match: RequirementMatch): boolean {
  return match.status === "AVAILABLE" || match.status === "AVAILABLE_WITH_NOTICE";
}

export function warmupFilesFromMatches(matches: RequirementMatch[]): string[] {
  return matches
    .filter((match) => match.requirement.role === "WARMUP" &&
      matchIsUsable(match) && match.entry)
    .map((match) => match.entry!.outputPath);
}

export function targetFileFromMatches(matches: RequirementMatch[]): string | null {
  return matches.find((match) => match.requirement.role === "TARGET" &&
    matchIsUsable(match) && match.entry)?.entry?.outputPath ?? null;
}

export function planIsReady(matches: RequirementMatch[]): boolean {
  return matches.length > 0 && matches.every(matchIsUsable);
}
