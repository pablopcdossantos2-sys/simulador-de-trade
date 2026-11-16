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

    expect(plan.visibleMinutes).toBe(565);
    expect(plan.visibleBars).toBe(283);
    expect(plan.targetStartTime).toBe("09:00");
    expect(plan.targetEndTime).toBe("18:25");
    expect(plan.warmupBars).toBe(260);
    expect(plan.warmupMinutes).toBe(520);
    expect(plan.fullSessionsNeeded).toBe(1);
    expect(plan.fullSessionPreviousDates).toEqual(["2026-10-13"]);
    expect(plan.dataRequirements).toEqual([
      {
        role: "WARMUP",
        date: "2026-10-13",
        startTime: "09:00",
        endTime: "18:25",
      },
      {
        role: "TARGET",
        date: "2026-10-14",
        startTime: "09:00",
        endTime: "18:25",
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

it("usa 18:25 para o WIN em novembro, preservando o fechamento 18:00 pré-09/03", () => {
  const november = calculateSimulationPlan({
    asset: "WINFUT", date: "2026-11-04", timeframeMinutes: 2,
  });
  expect(november.targetEndTime).toBe("18:25");
  expect(november.visibleMinutes).toBe(565);
  expect(november.visibleBars).toBe(283); // última posição M2 pode ser parcial
  expect(november.dataRequirements[0].date).toBe("2026-11-03");
  expect(november.dataRequirements[0].endTime).toBe("18:25");
});

it("reservará dois pregões prévios para M15/TPV50 na estratégia 02", () => {
  const plan = calculateSimulationPlan({
    asset: "WDOFUT", date: "2026-11-05",
    timeframeMinutes: 2, strategyId: "MTF_ANGULACAO",
  });
  expect(plan.warmupBars).toBe(450);
  expect(plan.fullSessionsNeeded).toBe(2);
  expect(plan.fullSessionPreviousDates).toEqual(["2026-11-04", "2026-11-03"]);
  expect(plan.dataRequirements.map(x => x.date)).toEqual([
    "2026-11-03", "2026-11-04", "2026-11-05",
  ]);
  expect(plan.targetEndTime).toBe("18:30");
});

it("adapta o aquecimento às médias personalizadas, sem mudar os defaults", () => {
  const adjusted = calculateSimulationPlan({
    asset: "WDOFUT", date: "2026-11-05",
    timeframeMinutes: 2, strategyId: "MULTI_MEDIAS",
    movingAverages: {
      multiMedias: { emaFastLength: 10, wmaLength: 30, emaSlowLength: 80 },
      mtf: { periods: [8, 20, 50, 200] },
    },
  });
  expect(adjusted.warmupBars).toBe(400);

  const mtf = calculateSimulationPlan({
    asset: "WDOFUT", date: "2026-11-05",
    timeframeMinutes: 2, strategyId: "MTF_ANGULACAO",
    movingAverages: {
      multiMedias: { emaFastLength: 8, wmaLength: 20, emaSlowLength: 52 },
      mtf: { periods: [15, 30, 100, 220] },
    },
  });
  expect(mtf.warmupBars).toBe(825);
});
