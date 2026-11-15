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
        sessionEnd: "18:00",
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
        sessionEnd: "18:00",
        symbol: "WINV26",
      }),
    ]);

    expect(matches[0].status).toBe("CONTRACT_MISMATCH");
    expect(planIsReady(matches)).toBe(false);
  });

  it("ignora arquivos que não cobrem todo o pregão", () => {
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


it("exige o pregão completo para o arquivo-alvo", () => {
  const matches = matchSimulationPlan(plan, "WINFUT", [
    entry({
      outputPath: "C:\\data\\warmup.replay.csv",
    }),
    entry({
      outputPath: "C:\\data\\target-too-wide.replay.csv",
      tradeDate: "2026-10-14",
      sessionStart: "09:00",
      sessionEnd: "12:00",
    }),
  ]);

  const target = matches.find((match) => match.requirement.role === "TARGET");
  expect(target?.status).toBe("MISSING");
  expect(planIsReady(matches)).toBe(false);
});

it("prioriza M1 original ao escolher fontes do plano, sem excluir M2 legado", () => {
  const matches = matchSimulationPlan(plan, "WINFUT", [
    entry({ outputPath: "warmup-m2.csv", dataMode: "CANDLES_M2_SYNTHETIC" }),
    entry({ outputPath: "target-m2.csv", tradeDate: "2026-10-14", dataMode: "CANDLES_M2_SYNTHETIC" }),
    entry({ outputPath: "warmup-m1.csv", dataMode: "CANDLES_M1_SYNTHETIC" }),
    entry({ outputPath: "target-m1.csv", tradeDate: "2026-10-14", dataMode: "CANDLES_M1_SYNTHETIC" }),
  ]);
  expect(planIsReady(matches)).toBe(true);
  expect(warmupFilesFromMatches(matches)).toEqual(["warmup-m1.csv"]);
  expect(targetFileFromMatches(matches)).toBe("target-m1.csv");
});
