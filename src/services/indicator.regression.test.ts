import { describe, expect, it } from "vitest";
import {
  INDICATOR_V1_EXPECTED,
  INDICATOR_V1_REGRESSION_CANDLES,
} from "../fixtures/indicatorV1";
import { MultiMediasNuvemAdapter } from "./indicator";

describe("regressão do indicador v1.2 — EMA conforme Pine v5", () => {
  it("mantém sinais e valores golden da versão 1.1.0", () => {
    const adapter = new MultiMediasNuvemAdapter();
    const result = adapter.calculate(
      "WINFUT",
      INDICATOR_V1_REGRESSION_CANDLES,
    );

    expect(adapter.version).toBe(INDICATOR_V1_EXPECTED.version);
    expect(
      result.signals.map((signal) => ({
        side: signal.side,
        candleIndex: signal.candleIndex,
      })),
    ).toEqual(INDICATOR_V1_EXPECTED.signals);

    const last = result.series.at(-1);
    expect(last?.candleIndex).toBe(INDICATOR_V1_EXPECTED.last.candleIndex);
    expect(last?.wma20).toBeCloseTo(
      INDICATOR_V1_EXPECTED.last.wma20,
      10,
    );
    expect(last?.vwap).toBeCloseTo(
      INDICATOR_V1_EXPECTED.last.vwap,
      10,
    );
    expect(last?.ema8).toBeCloseTo(
      INDICATOR_V1_EXPECTED.last.ema8,
      10,
    );
    expect(last?.ema52).toBeCloseTo(
      INDICATOR_V1_EXPECTED.last.ema52,
      10,
    );
    expect(last?.zone).toBe(INDICATOR_V1_EXPECTED.last.zone);
  });
});

 
// Fechamentos M2 agregados independentemente dos CSVs M1 reais do Profit
// de 10/11/2026. Somente esses 52 fechamentos são incorporados à suíte;
// os arquivos completos continuam fora do repositório.
const REAL_M2_CLOSES_20261110 = {
  WINFUT: [
    174385, 174370, 174260, 174175, 174250, 174255, 174280, 174485,
    174445, 174425, 174425, 174390, 174345, 174525, 174470, 174455,
    174425, 174440, 174455, 174430, 174450, 174465, 174630, 174655,
    174695, 174605, 174580, 174520, 174525, 174570, 174555, 174800,
    174875, 174800, 174925, 174805, 174915, 175010, 175165, 175195,
    175090, 174935, 174885, 174910, 174975, 174740, 174735, 174770,
    174745, 174580, 174320, 174385,
  ],
  WDOFUT: [
    5538.5, 5544.5, 5549.5, 5554.5, 5554.5, 5555, 5552, 5551.5,
    5553, 5555.5, 5556, 5556.5, 5563.5, 5564, 5563, 5563,
    5565, 5565.5, 5566.5, 5568, 5564, 5568, 5567, 5571,
    5570, 5569.5, 5568, 5569, 5570.5, 5570, 5573, 5573,
    5572.5, 5571, 5570, 5566, 5567.5, 5569.5, 5569.5, 5569.5,
    5570, 5569, 5569.5, 5572, 5572.5, 5584.5, 5590, 5589.5,
    5591, 5589, 5590.5, 5587,
  ],
} as const;

it("confere MME8, MMP20 e MME52 com referência independente de WIN/WDO reais", () => {
  const expected = {
    WINFUT: { ema8: 174607.08629468267, wma20: 174761.42857142858, ema52: 174647.421178815 },
    WDOFUT: { ema8: 5585.729607770099, wma20: 5580.714285714285, ema52: 5568.309122752853 },
  } as const;

  for (const asset of ["WINFUT", "WDOFUT"] as const) {
    const closes = REAL_M2_CLOSES_20261110[asset];
    expect(closes).toHaveLength(52);
    // OHLCV sintético apenas como invólucro: EMA/WMA dependem dos fechamentos,
    // não do volume nem do caminho intrabar.
    const candles = closes.map((close, index) => ({
      index,
      timestamp: new Date(Date.UTC(2026, 10, 10, 9, index * 2)).toISOString(),
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    }));
    const series = new MultiMediasNuvemAdapter().calculate(asset, candles).series;
    const last = series[51];
    expect(last.ema8).toBeCloseTo(expected[asset].ema8, 6);
    expect(last.wma20).toBeCloseTo(expected[asset].wma20, 6);
    expect(last.ema52).toBeCloseTo(expected[asset].ema52, 6);
  }
});
