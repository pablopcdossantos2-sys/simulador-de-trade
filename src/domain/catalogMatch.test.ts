import { describe, expect, it } from "vitest";
import { calculateSimulationPlan } from "./simulationPlan";
import {
  matchSimulationPlan,
  planIsReady,
  targetFileFromMatches,
  warmupFilesFromMatches,
} from "./catalogMatch";
import type { ReplayCatalogEntry } from "../services/replayCatalog";

function entry(
  overrides: Partial<ReplayCatalogEntry>,
): ReplayCatalogEntry {
  return {
    outputPath: "C:\\data\\default.replay.csv",
    metadataPath: "C:\\data\\default.replay.meta.json",
    symbol: "WINV26",
    asset: "WINFUT",
    tradeDate: "2026-10-13",
    sessionStart: "09:00",
    sessionEnd: "18:00",
    firstTimestamp: "2026-10-13T09:00:00",
    lastTimestamp: "2026-10-13T17:59:59",
    fileBytes: 1000,
    exists: true,
    ...overrides,
  };
}

const plan = calculateSimulationPlan({
  asset: "WINFUT",
  date: "2026-10-14",
  timeframeMinutes: 2,
  startTime: "09:00",
  endTime: "12:00",
  warmupPolicy: "STANDARD",
});

describe("catálogo de dados do plano", () => {
  it("marca o plano pronto quando aquecimento e alvo existem no mesmo contrato", () => {
    const matches = matchSimulationPlan(plan, "WINFUT", [
      entry({
        outputPath: "C:\\data\\warmup.replay.csv",
      }),
      entry({
        outputPath: "C:\\data\\target.replay.csv",
        tradeDate: "2026-10-14",
        sessionEnd: "12:00",
      }),
    ]);

    expect(planIsReady(matches)).toBe(true);
    expect(warmupFilesFromMatches(matches)).toEqual([
      "C:\\data\\warmup.replay.csv",
    ]);
    expect(targetFileFromMatches(matches)).toBe(
      "C:\\data\\target.replay.csv",
    );
  });

  it("marca contrato incompatível no aquecimento", () => {
    const matches = matchSimulationPlan(plan, "WINFUT", [
      entry({
        outputPath: "C:\\data\\warmup.replay.csv",
        symbol: "WINQ26",
      }),
      entry({
        outputPath: "C:\\data\\target.replay.csv",
        tradeDate: "2026-10-14",
        sessionEnd: "12:00",
        symbol: "WINV26",
      }),
    ]);

    expect(matches[0].status).toBe("CONTRACT_MISMATCH");
    expect(planIsReady(matches)).toBe(false);
  });

  it("ignora arquivos que não cobrem toda a janela exigida", () => {
    const matches = matchSimulationPlan(plan, "WINFUT", [
      entry({
        sessionEnd: "12:00",
      }),
      entry({
        tradeDate: "2026-10-14",
        sessionEnd: "12:00",
      }),
    ]);

    expect(matches[0].status).toBe("MISSING");
    expect(planIsReady(matches)).toBe(false);
  });
});
