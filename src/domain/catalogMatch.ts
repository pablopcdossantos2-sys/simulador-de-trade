import type {
  SimulationDataRequirement,
  SimulationPlan,
} from "./simulationPlan";
import type { ReplayCatalogEntry } from "../services/replayCatalog";
import type { Asset } from "../types";

export interface RequirementMatch {
  requirement: SimulationDataRequirement;
  entry: ReplayCatalogEntry | null;
  status: "AVAILABLE" | "MISSING" | "CONTRACT_MISMATCH";
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
      return aSpan - bSpan;
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
  const targetEntry = targetCandidates[0] ?? null;
  const targetSymbol = targetEntry?.symbol ?? null;

  return plan.dataRequirements.map((requirement) => {
    const candidates = bestCoverage(entries, requirement, asset);

    if (requirement.role === "TARGET") {
      return {
        requirement,
        entry: candidates[0] ?? null,
        status: candidates.length ? "AVAILABLE" : "MISSING",
      };
    }

    if (!candidates.length) {
      return {
        requirement,
        entry: null,
        status: "MISSING",
      };
    }

    if (!targetSymbol) {
      return {
        requirement,
        entry: candidates[0],
        status: "AVAILABLE",
      };
    }

    const sameContract = candidates.find(
      (entry) => entry.symbol === targetSymbol,
    );

    if (sameContract) {
      return {
        requirement,
        entry: sameContract,
        status: "AVAILABLE",
      };
    }

    return {
      requirement,
      entry: candidates[0],
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
