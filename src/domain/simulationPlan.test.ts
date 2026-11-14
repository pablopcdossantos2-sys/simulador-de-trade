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

  it("não usa 24, 25 ou 31/12/2025 como histórico prévio de janeiro de 2026", () => {
    expect(previousB3Sessions2026("2026-01-05", 4)).toEqual([
      "2026-01-02",
      "2025-12-30",
      "2025-12-29",
      "2025-12-26",
    ]);
  });

  it("rejeita ano-alvo sem calendário B3 incorporado", () => {
    expect(() =>
      calculateSimulationPlan({
        asset: "WINFUT",
        date: "2027-01-04",
        timeframeMinutes: 2,
      }),
    ).toThrow(/calendário de pregões ainda não disponível/i);
  });

  it("rejeita timeframe diferente de M2", () => {
    expect(() =>
      calculateSimulationPlan({
        asset: "WINFUT",
        date: "2026-10-14",
        timeframeMinutes: 3,
      }),
    ).toThrow(/fonte do replay é o histórico de candles M2/i);
  });

  it("planeja o pregão completo e calcula 260 candles de histórico anterior", () => {
    const plan = calculateSimulationPlan({
      asset: "WINFUT",
      date: "2026-10-14",
      timeframeMinutes: 2,
    });

    expect(plan.visibleMinutes).toBe(540);
    expect(plan.visibleBars).toBe(270);
    expect(plan.targetStartTime).toBe("09:00");
    expect(plan.targetEndTime).toBe("18:00");
    expect(plan.warmupBars).toBe(260);
    expect(plan.warmupMinutes).toBe(520);
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
        endTime: "18:00",
      },
    ]);
    expect(plan.contractWarning).toMatch(/vencimento mensal do WIN/i);
  });

  it("usa o horário completo do WDO", () => {
    const plan = calculateSimulationPlan({
      asset: "WDOFUT",
      date: "2026-10-14",
      timeframeMinutes: 2,
    });

    expect(plan.targetStartTime).toBe("09:00");
    expect(plan.targetEndTime).toBe("18:30");
    expect(plan.dataRequirements.at(-1)).toEqual({
      role: "TARGET",
      date: "2026-10-14",
      startTime: "09:00",
      endTime: "18:30",
    });
    expect(plan.warmupBars).toBe(260);
    expect(plan.fullSessionsNeeded).toBe(1);
  });

  it("respeita pregão especial com início às 13h", () => {
    const plan = calculateSimulationPlan({
      asset: "WINFUT",
      date: "2026-02-18",
      timeframeMinutes: 2,
    });
    expect(plan.targetStartTime).toBe("13:00");
    expect(plan.targetEndTime).toBe("18:00");
  });
});
