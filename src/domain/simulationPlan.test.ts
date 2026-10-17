import { describe, expect, it } from "vitest";
import {
  calculateSimulationPlan,
  previousB3Sessions2026,
} from "./simulationPlan";

describe("planejamento de simulação", () => {
  it("pula fim de semana e feriado da B3 antes de 14/10/2026", () => {
    expect(previousB3Sessions2026("2026-10-14", 4)).toEqual([
      "2026-10-13",
      "2026-10-09",
      "2026-10-08",
      "2026-10-07",
    ]);
  });

  it("não usa 24, 25 ou 31/12/2025 como aquecimento de janeiro de 2026", () => {
    expect(previousB3Sessions2026("2026-01-05", 4)).toEqual([
      "2026-01-02",
      "2025-12-30",
      "2025-12-29",
      "2025-12-26",
    ]);
  });

  it("rejeita timeframe fora de M2/M5", () => {
    expect(() =>
      calculateSimulationPlan({
        asset: "WINFUT",
        date: "2026-10-14",
        timeframeMinutes: 3,
        startTime: "09:00",
        endTime: "12:00",
        warmupPolicy: "STANDARD",
      }),
    ).toThrow(/M2 ou M5/i);
  });

  it("exige 260 candles de aquecimento no modo padrão", () => {
    const plan = calculateSimulationPlan({
      asset: "WINFUT",
      date: "2026-10-14",
      timeframeMinutes: 2,
      startTime: "09:00",
      endTime: "12:00",
      warmupPolicy: "STANDARD",
    });

    expect(plan.visibleBars).toBe(90);
    expect(plan.warmupBars).toBe(260);
    expect(plan.warmupMinutes).toBe(520);
    expect(plan.sameWindowSessionsNeeded).toBe(3);
    expect(plan.sameWindowPreviousDates).toEqual([
      "2026-10-13",
      "2026-10-09",
      "2026-10-08",
    ]);
    expect(plan.fullSessionsNeeded).toBe(1);
    expect(plan.fullSessionPreviousDates).toEqual(["2026-10-13"]);
    expect(plan.dataRequirements).toEqual([
      {
        role: "WARMUP",
        date: "2026-10-13",
        startTime: "09:00",
        endTime: "18:00",
      },
      {
        role: "TARGET",
        date: "2026-10-14",
        startTime: "09:00",
        endTime: "12:00",
      },
    ]);
    expect(plan.contractWarning).toMatch(/vencimento mensal do WIN/i);
  });

  it("planeja M5 de ponta a ponta", () => {
    const plan = calculateSimulationPlan({
      asset: "WINFUT",
      date: "2026-10-14",
      timeframeMinutes: 5,
      startTime: "09:00",
      endTime: "12:00",
      warmupPolicy: "STANDARD",
    });

    expect(plan.timeframeMinutes).toBe(5);
    expect(plan.visibleBars).toBe(36);
    expect(plan.warmupBars).toBe(260);
    expect(plan.warmupMinutes).toBe(1300);
    expect(plan.sameWindowSessionsNeeded).toBe(8);
    expect(plan.sameWindowPreviousDates).toEqual([
      "2026-10-13",
      "2026-10-09",
      "2026-10-08",
      "2026-10-07",
      "2026-10-06",
      "2026-10-05",
      "2026-10-02",
      "2026-10-01",
    ]);
    expect(plan.fullSessionsNeeded).toBe(3);
    expect(plan.fullSessionPreviousDates).toEqual([
      "2026-10-13",
      "2026-10-09",
      "2026-10-08",
    ]);
    expect(plan.fullSessionBars).toBe(324);
  });

  it("usa 520 candles no modo estrito", () => {
    const plan = calculateSimulationPlan({
      asset: "WINFUT",
      date: "2026-10-14",
      timeframeMinutes: 2,
      startTime: "09:00",
      endTime: "12:00",
      warmupPolicy: "STRICT",
    });

    expect(plan.warmupBars).toBe(520);
    expect(plan.fullSessionsNeeded).toBe(2);
    expect(plan.fullSessionPreviousDates).toEqual([
      "2026-10-13",
      "2026-10-09",
    ]);
  });
});
