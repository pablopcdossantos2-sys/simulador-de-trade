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
    expect(adapter.version).toBe("multi-medias-nuvem-v1.2.0");
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
    expect(buySignals[0].candleIndex).toBe(19);
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
    expect(sellSignals[0].candleIndex).toBe(19);
    expect(result.zone).toBe("RED");
    expect(result.authorization?.side).toBe("SELL");
  });

  it("inicializa MMEs no primeiro fechamento conforme ta.ema do Pine v5", () => {
    const candles = trendCandles(5, 60);
    const result = new MultiMediasNuvemAdapter().calculate("WINFUT", candles);
    const firstClose = candles[0].close;
    const secondClose = candles[1].close;

    expect(result.series[0].ema8).toBe(firstClose);
    expect(result.series[0].ema52).toBe(firstClose);
    expect(result.series[1].ema8).toBeCloseTo(firstClose + (secondClose - firstClose) * 2 / 9, 10);
    expect(result.series[1].ema52).toBeCloseTo(firstClose + (secondClose - firstClose) * 2 / 53, 10);

    // A referência do Pine não retarda a EMA para esperar 8 ou 52 barras.
    expect(result.series[6].ema8).not.toBeNull();
    expect(result.series[50].ema52).not.toBeNull();
    expect(result.series[51].ema52).not.toBeCloseTo(
      candles.slice(0, 52).reduce((sum, candle) => sum + candle.close, 0) / 52,
      3,
    );
  });

  it("só considera sinais após a primeira MMP20 disponível", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const beforeWma = adapter.calculate("WINFUT", trendCandles(5, 19));
    expect(beforeWma.signals).toHaveLength(0);
    expect(beforeWma.authorization).toBeNull();

    const afterWma = adapter.calculate("WINFUT", trendCandles(5, 20));
    expect(afterWma.signals.map((signal) => signal.candleIndex)).toEqual([19]);
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

  it("ignora candles sem volume no cálculo ponderado da VWAP", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const candles: Candle[] = [
      {
        index: 0, timestamp: "2026-01-02T09:00:00", open: 100,
        high: 110, low: 90, close: 105, volume: 0,
      },
      {
        index: 1, timestamp: "2026-01-02T09:02:00", open: 200,
        high: 204, low: 198, close: 202, volume: 10,
      },
    ];

    const result = adapter.calculate("WINFUT", candles);
    expect(result.series[0].vwap).toBeNull();
    expect(result.series[1].vwap).toBeCloseTo((204 + 198 + 202) / 3, 8);
  });

  it("rejeita candles fora de ordem ou timestamps duplicados", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const candles = trendCandles(1, 3);
    const duplicate = [candles[0], { ...candles[1], timestamp: candles[0].timestamp }];
    const reversed = [candles[1], candles[0]];

    expect(() => adapter.calculate("WINFUT", duplicate)).toThrow("ordem cronológica");
    expect(() => adapter.calculate("WINFUT", reversed)).toThrow("ordem cronológica");
  });

  it("rejeita OHLCV inválido, mas preserva quantidade zero", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const valid = trendCandles(1, 2);
    const invalid = [
      { ...valid[0], close: Number.NaN },
      { ...valid[0], high: valid[0].low - 1 },
      { ...valid[0], volume: -1 },
      { ...valid[0], volume: Number.POSITIVE_INFINITY },
    ];

    for (const candle of invalid) {
      expect(() => adapter.calculate("WINFUT", [candle])).toThrow("OHLC ou volume inválido");
    }

    expect(() => adapter.calculate("WINFUT", [{ ...valid[0], volume: 0 }])).not.toThrow();
  });

  it("rejeita períodos de média inválidos", () => {
    expect(() => new MultiMediasNuvemAdapter({
      ...DEFAULT_MULTI_MEDIAS_CONFIG,
      emaFastLength: 0,
    }).calculate("WINFUT", [])).toThrow("Configuração de períodos");
  });

});