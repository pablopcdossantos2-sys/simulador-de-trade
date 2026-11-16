import { describe, expect, it } from "vitest";
import { normalizeStrategyId, strategySelectionAllowed, strategyLabel } from "./tradingStrategies";
import { createTrainingSession } from "./training";

describe("seleção de estratégias e compatibilidade com sessões legadas", () => {
  it("interpreta sessões antigas como Multi Médias", () => {
    expect(normalizeStrategyId(undefined)).toBe("MULTI_MEDIAS");
    expect(normalizeStrategyId("invalid")).toBe("MULTI_MEDIAS");
    expect(strategyLabel("MULTI_MEDIAS")).toContain("Nuvem");
  });

  it("associa o sistema selecionado ao registro da sessão", () => {
    const session = createTrainingSession({
      asset: "WDOFUT", tradeDate: "2026-11-04", startTime: "09:00", endTime: "18:30",
      timeframeMinutes: 2, warmupBars: 260, mode: "FREE",
      strategyId: "MTF_ANGULACAO", startingBalanceBRL: null,
    });
    expect(session.strategyId).toBe("MTF_ANGULACAO");
    expect(strategyLabel("MTF_ANGULACAO")).toContain("MTF");
  });

  it("impede mudança durante sessão ou posição aberta", () => {
    expect(strategySelectionAllowed(false, false, false)).toBe(true);
    expect(strategySelectionAllowed(true, false, false)).toBe(false);
    expect(strategySelectionAllowed(false, true, false)).toBe(false);
    expect(strategySelectionAllowed(false, false, true)).toBe(false);
  });
});
