import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandleChart } from "./CandleChart";
import { MultiMediasNuvemAdapter } from "../services/indicator";
import { calculateMtfConfluence } from "../services/mtfConfluence";
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
    for (const label of ["MMP 20", "MME 8", "MME 52", "VWAP", "Volume"]) {
      expect(markup).toContain(label);
    }
    expect(markup).not.toContain("M15");
    expect(markup).not.toContain("indicator-mtf-");
    expect(markup).not.toContain("chart-mtf-readout");
  });

  it("desenha as quatro MMEs M15 e a VWAP apenas na segunda estratégia", () => {
    const candles = INDICATOR_V1_REGRESSION_CANDLES;
    const points = calculateMtfConfluence(candles).points;
    const html = renderToStaticMarkup(
      <CandleChart candles={candles} evaluation={{
        authorization: null, signals: [], series: [], zone: "NONE",
      }} strategyId="MTF_ANGULACAO" mtfPoints={points}
      asset="WINFUT" position={null} />,
    );
    expect(html).toContain("M15 MME 8");
    expect(html).toContain("M15 MME 200");
    expect(html).toContain("VWAP M15");
    expect(html).toContain("indicator-mtf-m1-line");
    expect(html).toContain("indicator-mtf-vwap-line");
    expect(html).not.toContain("indicator-wma-line");
    expect(html).not.toContain("MMP 20");
  });
});
