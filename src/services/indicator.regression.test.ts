import { describe, expect, it } from "vitest";
import {
  INDICATOR_V1_EXPECTED,
  INDICATOR_V1_REGRESSION_CANDLES,
} from "../fixtures/indicatorV1";
import { MultiMediasNuvemAdapter } from "./indicator";

describe("regressão do indicador v1", () => {
  it("mantém sinais e valores golden da versão 1.0.0", () => {
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
