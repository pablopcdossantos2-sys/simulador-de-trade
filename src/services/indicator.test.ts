import { describe, expect, it } from "vitest";
import type { Candle } from "../types";
import {
  DEFAULT_MULTI_MEDIAS_CONFIG,
  MultiMediasNuvemAdapter,
} from "./indicator";

function trendCandles(step: number, count = 80): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 1000 + index * step;
    const bullish = step > 0;
    const open = bullish ? close - 1 : close + 1;

    return {
      index,
      timestamp: new Date(Date.UTC(2026, 0, 2, 12, index)).toISOString(),
      open,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close,
      volume: 100 + index,
    };
  });
}

describe("Multi Médias - Nuvem e Sinais", () => {
  it("mantém os parâmetros padrão e a versão do algoritmo", () => {
    const adapter = new MultiMediasNuvemAdapter();
    expect(adapter.version).toBe("multi-medias-nuvem-v1.1.0");
    expect(DEFAULT_MULTI_MEDIAS_CONFIG).toEqual({
      wmaLength: 20,
      emaFastLength: 8,
      emaSlowLength: 52,
      vwapAnchor: "Session",
    });
  });

  it("inicia zona verde e emite somente um gatilho de compra em tendência monotônica", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const result = adapter.calculate("WINFUT", trendCandles(5));

    const buySignals = result.signals.filter((signal) => signal.side === "BUY");

    expect(buySignals).toHaveLength(1);
    expect(buySignals[0].candleIndex).toBe(51);
    expect(result.zone).toBe("GREEN");
    expect(result.authorization?.side).toBe("BUY");
  });

  it("gera IDs diferentes para o mesmo sinal em sessões distintas", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const candles = trendCandles(5);
    const firstSession = adapter.calculate("WINFUT", candles, "session-1");
    const secondSession = adapter.calculate("WINFUT", candles, "session-2");

    expect(firstSession.signals).toHaveLength(1);
    expect(secondSession.signals).toHaveLength(1);
    expect(firstSession.signals[0].id).not.toBe(secondSession.signals[0].id);
    expect(firstSession.signals[0].id).toContain("session-1");
    expect(secondSession.signals[0].id).toContain("session-2");
  });

  it("mantém IDs estáveis ao recalcular o mesmo sinal na mesma sessão", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const candles = trendCandles(5);
    const first = adapter.calculate("WINFUT", candles, "session-stable");
    const repeated = adapter.calculate("WINFUT", candles, "session-stable");

    expect(repeated.signals.map((signal) => signal.id)).toEqual(
      first.signals.map((signal) => signal.id),
    );
  });

  it("inicia zona vermelha e emite somente um gatilho de venda em tendência monotônica", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const result = adapter.calculate("WDOFUT", trendCandles(-5));

    const sellSignals = result.signals.filter((signal) => signal.side === "SELL");

    expect(sellSignals).toHaveLength(1);
    expect(sellSignals[0].candleIndex).toBe(51);
    expect(result.zone).toBe("RED");
    expect(result.authorization?.side).toBe("SELL");
  });

  it("não autoriza sinais antes da inicialização da MME 52", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const result = adapter.calculate("WINFUT", trendCandles(5, 40));
    expect(result.signals).toHaveLength(0);
    expect(result.authorization).toBeNull();
  });

  it("calcula a MMP 20 ponderando mais os candles recentes", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const candles = trendCandles(1, 20);
    const result = adapter.calculate("WINFUT", candles);
    const last = result.series.at(-1);

    const expectedWma =
      candles.reduce((sum, candle, index) => sum + candle.close * (index + 1), 0) /
      210;

    expect(last?.wma20).toBeCloseTo(expectedWma, 8);
  });

  it("reinicia a VWAP quando muda a sessão", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const candles: Candle[] = [
      {
        index: 0,
        timestamp: "2026-01-02T12:00:00.000Z",
        open: 100,
        high: 104,
        low: 98,
        close: 102,
        volume: 10,
      },
      {
        index: 1,
        timestamp: "2026-01-03T12:00:00.000Z",
        open: 200,
        high: 204,
        low: 198,
        close: 202,
        volume: 20,
      },
    ];

    const result = adapter.calculate("WINFUT", candles);
    const second = result.series[1];

    expect(second.vwap).toBeCloseTo((204 + 198 + 202) / 3, 8);
  });
});
