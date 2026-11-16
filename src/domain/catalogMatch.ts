import type {
  SimulationDataRequirement,
  SimulationPlan,
} from "./simulationPlan";
import type { ReplayCatalogEntry } from "../services/replayCatalog";
import type { Asset } from "../types";

export interface RequirementMatch {
  requirement: SimulationDataRequirement;
  entry: ReplayCatalogEntry | null;
  status: "AVAILABLE" | "MISSING" | "CONTRACT_MISMATCH" | "INCOMPLETE";
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function entryCoversRequirement(
  entry: ReplayCatalogEntry,
  requirement: SimulationDataRequirement,
  asset: Asset,
): boolean {
  if (!entry.exists) return false;
  if (entry.asset !== asset) return false;
  if (entry.tradeDate !== requirement.date) return false;

  if (requirement.role === "TARGET") {
    return (
      entry.sessionStart === requirement.startTime &&
      entry.sessionEnd === requirement.endTime
    );
  }

  return (
    minutes(entry.sessionStart) <= minutes(requirement.startTime) &&
    minutes(entry.sessionEnd) >= minutes(requirement.endTime)
  );
}

// A janela declarada nos metadados é o pedido do usuário, não prova que
// existam candles em todos os seus extremos. Não aprovar um arquivo truncado.
function timestampCandleStartMinute(value: string | null, tradeDate: string): number | null {
  if (!value || !value.startsWith(`${tradeDate}T`)) return null;
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:$|[.Z+-])/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second !== 0) return null;
  return hour * 60 + minute;
}

export function entryHasRequiredCandleCoverage(
  entry: ReplayCatalogEntry,
  requirement: SimulationDataRequirement,
): boolean {
  // Negócios legados não possuem grade fixa de candles. As regras de
  // cobertura intradiária só são aplicadas aos formatos M1/M2 conhecidos.
  if (entry.dataMode !== "CANDLES_M1_SYNTHETIC" &&
      entry.dataMode !== "CANDLES_M2_SYNTHETIC") return true;

  const first = timestampCandleStartMinute(entry.firstTimestamp, requirement.date);
  const last = timestampCandleStartMinute(entry.lastTimestamp, requirement.date);
  if (first === null || last === null || last < first) return false;
  const sourceMinutes = entry.dataMode === "CANDLES_M1_SYNTHETIC" ? 1 : 2;

  return first <= minutes(requirement.startTime) &&
    last + sourceMinutes >= minutes(requirement.endTime);
}

function bestCoverage(
  entries: ReplayCatalogEntry[],
  requirement: SimulationDataRequirement,
  asset: Asset,
): ReplayCatalogEntry[] {
  return entries
    .filter((entry) => entryCoversRequirement(entry, requirement, asset))
    .sort((a, b) => {
      const aSpan = minutes(a.sessionEnd) - minutes(a.sessionStart);
      const bSpan = minutes(b.sessionEnd) - minutes(b.sessionStart);
      const fidelityRank = (entry: ReplayCatalogEntry) =>
        entry.dataMode === "TICK_LEGACY" ? 0 :
        entry.dataMode === "CANDLES_M1_SYNTHETIC" ? 1 : 2;
      return aSpan - bSpan || fidelityRank(a) - fidelityRank(b);
    });
}

export function matchSimulationPlan(
  plan: SimulationPlan,
  asset: Asset,
  entries: ReplayCatalogEntry[],
): RequirementMatch[] {
  const targetRequirement = plan.dataRequirements.find(
    (requirement) => requirement.role === "TARGET",
  );
  const targetCandidates = targetRequirement
    ? bestCoverage(entries, targetRequirement, asset)
    : [];
  const targetEntry = targetRequirement
    ? targetCandidates.find((entry) => entryHasRequiredCandleCoverage(entry, targetRequirement)) ?? null
    : null;
  const targetSymbol = targetEntry?.symbol ?? null;

  return plan.dataRequirements.map((requirement) => {
    const candidates = bestCoverage(entries, requirement, asset);
    const completeCandidates = candidates.filter((entry) =>
      entryHasRequiredCandleCoverage(entry, requirement),
    );

    if (requirement.role === "TARGET") {
      return {
        requirement,
        entry: completeCandidates[0] ?? candidates[0] ?? null,
        status: completeCandidates.length
          ? "AVAILABLE" : candidates.length ? "INCOMPLETE" : "MISSING",
      };
    }

    if (!candidates.length) {
      return { requirement, entry: null, status: "MISSING" };
    }
    if (!completeCandidates.length) {
      return { requirement, entry: candidates[0], status: "INCOMPLETE" };
    }

    if (!targetSymbol) {
      return { requirement, entry: completeCandidates[0], status: "AVAILABLE" };
    }

    const sameContract = completeCandidates.find(
      (entry) => entry.symbol === targetSymbol,
    );
    if (sameContract) {
      return { requirement, entry: sameContract, status: "AVAILABLE" };
    }
    return {
      requirement,
      entry: completeCandidates[0],
      status: "CONTRACT_MISMATCH",
    };
  });
}

export function warmupFilesFromMatches(matches: RequirementMatch[]): string[] {
  return matches
    .filter(
      (match) =>
        match.requirement.role === "WARMUP" &&
        match.status === "AVAILABLE" &&
        match.entry,
    )
    .map((match) => match.entry!.outputPath);
}

export function targetFileFromMatches(
  matches: RequirementMatch[],
): string | null {
  return (
    matches.find(
      (match) =>
        match.requirement.role === "TARGET" &&
        match.status === "AVAILABLE" &&
        match.entry,
    )?.entry?.outputPath ?? null
  );
}

export function planIsReady(matches: RequirementMatch[]): boolean {
  return (
    matches.length > 0 &&
    matches.every((match) => match.status === "AVAILABLE")
  );
}
