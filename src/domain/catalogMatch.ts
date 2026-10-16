import type {
  SimulationDataRequirement,
  SimulationPlan,
} from "./simulationPlan";
import type { ReplayCatalogEntry } from "../services/replayCatalog";
import type { Asset } from "../types";

export interface RequirementMatch {
  requirement: SimulationDataRequirement;
  entry: ReplayCatalogEntry | null;
  status: "AVAILABLE" | "MISSING";
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

  return (
    minutes(entry.sessionStart) <= minutes(requirement.startTime) &&
    minutes(entry.sessionEnd) >= minutes(requirement.endTime)
  );
}

export function matchSimulationPlan(
  plan: SimulationPlan,
  asset: Asset,
  entries: ReplayCatalogEntry[],
): RequirementMatch[] {
  return plan.dataRequirements.map((requirement) => {
    const candidates = entries
      .filter((entry) => entryCoversRequirement(entry, requirement, asset))
      .sort((a, b) => {
        const aSpan = minutes(a.sessionEnd) - minutes(a.sessionStart);
        const bSpan = minutes(b.sessionEnd) - minutes(b.sessionStart);
        return aSpan - bSpan;
      });

    return {
      requirement,
      entry: candidates[0] ?? null,
      status: candidates.length ? "AVAILABLE" : "MISSING",
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
  return matches.length > 0 && matches.every((match) => match.status === "AVAILABLE");
}
