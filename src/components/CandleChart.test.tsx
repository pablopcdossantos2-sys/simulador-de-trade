import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandleChart } from "./CandleChart";
import { MultiMediasNuvemAdapter } from "../services/indicator";
import { INDICATOR_V1_REGRESSION_CANDLES } from "../fixtures/indicatorV1";

describe("gráfico da primeira estratégia: Multi Médias", () => {
  it("mantém somente MME8, MMP20, MME52, VWAP e volume, sem médias M15", () => {
    const candles = INDICATOR_V1_REGRESSION_CANDLES;
    const evaluation = new MultiMediasNuvemAdapter().calculate("WINFUT", candles);
    const markup = renderToStaticMarkup(
      <CandleChart candles={candles} evaluation={evaluation} asset="WINFUT" position={null} />,
    );
    for (const cssClass of [
      "indicator-wma-line", "indicator-vwap-line",
      "indicator-ema8-line", "indicator-ema52-line",
    ]) {
      expect(markup).toContain(`class="${cssClass}"`);
    }
    for (const name of ["MMP 20", "MME 8", "MME 52", "VWAP", "Volume"]) {
      expect(markup).toContain(name);
    }
    expect(markup).not.toContain("M15");
    expect(markup).not.toContain("indicator-mtf-");
    expect(markup).not.toContain("chart-mtf-readout");
    expect(markup).not.toContain("legend-mtf");
  });
});
