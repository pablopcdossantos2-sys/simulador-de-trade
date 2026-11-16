import { describe, expect, it, vi, afterEach } from "vitest";
import {
  defaultsForMovingAverages,
  normalizeMovingAverageSettings,
  validateMovingAverageSettings,
  loadMovingAverageSettings,
  saveMovingAverageSettings,
  selectedMovingAveragesLabel,
} from "./strategyMovingAverages";
import { DEFAULT_MULTI_MEDIAS_CONFIG, MultiMediasNuvemAdapter } from "./indicator";
import type { Candle } from "../types";

afterEach(() => vi.unstubAllGlobals());

describe("médias configuráveis por estratégia", () => {
  it("preserva padrões originais dos dois sistemas", () => {
    const settings = defaultsForMovingAverages();
    expect(settings.multiMedias).toEqual({
      emaFastLength: 8, wmaLength: 20, emaSlowLength: 52,
    });
    expect(settings.mtf.periods).toEqual([8, 20, 50, 200]);
    expect(DEFAULT_MULTI_MEDIAS_CONFIG.emaSlowLength).toBe(52);
  });

  it("rejeita períodos inválidos, fracionários e ordem incompatível", () => {
    const first = defaultsForMovingAverages();
    first.multiMedias.wmaLength = 8;
    expect(() => validateMovingAverageSettings(first, "MULTI_MEDIAS")).toThrow(/ordem/);
    first.multiMedias.wmaLength = 20;
    first.multiMedias.emaSlowLength = 301;
    expect(() => validateMovingAverageSettings(first, "MULTI_MEDIAS")).toThrow(/2 a 300/);
    const second = defaultsForMovingAverages();
    second.mtf.periods[2] = 20;
    expect(() => validateMovingAverageSettings(second, "MTF_ANGULACAO")).toThrow(/ordem crescente/);
    second.mtf.periods[2] = 50.5;
    expect(() => validateMovingAverageSettings(second, "MTF_ANGULACAO")).toThrow(/inteiros/);
  });

  it("isola as configurações e restaura apenas blocos inválidos", () => {
    const value = defaultsForMovingAverages();
    value.multiMedias = { emaFastLength: 5, wmaLength: 12, emaSlowLength: 30 };
    value.mtf.periods = [9, 30, 60, 250];
    const result = normalizeMovingAverageSettings(value);
    expect(selectedMovingAveragesLabel(result, "MULTI_MEDIAS")).toContain("MME 5");
    expect(selectedMovingAveragesLabel(result, "MTF_ANGULACAO")).toContain("9/30/60/250");
    const broken = normalizeMovingAverageSettings({
      multiMedias: { emaFastLength: -2, wmaLength: 12, emaSlowLength: 30 },
      mtf: value.mtf,
    });
    expect(broken.multiMedias).toEqual(defaultsForMovingAverages().multiMedias);
    expect(broken.mtf.periods).toEqual([9, 30, 60, 250]);
  });

  it("guarda e recupera preferências entre reaberturas no mesmo computador", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    const next = defaultsForMovingAverages();
    next.multiMedias = { emaFastLength: 5, wmaLength: 12, emaSlowLength: 30 };
    saveMovingAverageSettings(next);
    expect(loadMovingAverageSettings()).toEqual(next);
    store.set("simulador-de-trade:moving-average-config-v1", "corrompido");
    expect(loadMovingAverageSettings()).toEqual(defaultsForMovingAverages());
  });

  it("alterar períodos altera cálculos, não só legendas", () => {
    const candles: Candle[] = Array.from({ length: 90 }, (_, index) => {
      const price = 1000 + index * 2 + Math.sin(index / 4) * 15;
      return {
        index, timestamp: `2026-11-10T${String(9 + Math.floor(index / 30)).padStart(2, "0")}:${String(index * 2 % 60).padStart(2, "0")}:00`,
        open: price - 1, close: price, low: price - 3, high: price + 3, volume: 10,
      };
    });
    const defaultResult = new MultiMediasNuvemAdapter().calculate("WINFUT", candles);
    const personalized = new MultiMediasNuvemAdapter({
      ...DEFAULT_MULTI_MEDIAS_CONFIG, emaFastLength: 5, wmaLength: 12, emaSlowLength: 30,
    }).calculate("WINFUT", candles);
    expect(personalized.series.at(-1)?.ema8).not.toEqual(defaultResult.series.at(-1)?.ema8);
    expect(personalized.series.at(-1)?.wma20).not.toEqual(defaultResult.series.at(-1)?.wma20);
    expect(personalized.series.at(-1)?.ema52).not.toEqual(defaultResult.series.at(-1)?.ema52);
  });
});

describe("preferências dos votos do fundo M15", () => {
  it("restaura os interruptores originais para configurações anteriores", () => {
    const legacy = {
      multiMedias: { emaFastLength: 8, wmaLength: 20, emaSlowLength: 52 },
      mtf: { periods: [5, 10, 20, 50] },
    };
    const normalized = normalizeMovingAverageSettings(legacy);
    expect(normalized.mtf.periods).toEqual([5, 10, 20, 50]);
    expect(normalized.mtf.filters).toEqual({
      useAngles: true, requireAlignment: true, voteOn: [true, true, true, false],
      useVwap: true, useTpv: true,
    });
  });
  it("preserva individualmente as preferências ativadas/desativadas", () => {
    const settings = defaultsForMovingAverages();
    settings.mtf.filters!.voteOn = [false, true, false, true];
    settings.mtf.filters!.useAngles = false;
    settings.mtf.filters!.useTpv = false;
    const normalized = normalizeMovingAverageSettings(settings);
    expect(normalized.mtf.filters).toEqual(settings.mtf.filters);
  });
  it("recusa valores não booleanos nos interruptores", () => {
    const broken = defaultsForMovingAverages() as unknown as Record<string, unknown>;
    ((broken.mtf as Record<string, unknown>).filters as Record<string, unknown>).useVwap = "yes";
    expect(() => validateMovingAverageSettings(broken as unknown as ReturnType<typeof defaultsForMovingAverages>, "MTF_ANGULACAO")).toThrow();
  });
});
