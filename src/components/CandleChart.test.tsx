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

it("mostra no gráfico exatamente os períodos personalizados para cada estratégia", () => {
  const candles = INDICATOR_V1_REGRESSION_CANDLES;
  const settings = {
    multiMedias: { emaFastLength: 5, wmaLength: 12, emaSlowLength: 30 },
    mtf: { periods: [10, 24, 60, 250] as [number,number,number,number] },
  };
  const first = renderToStaticMarkup(
    <CandleChart candles={candles} evaluation={new MultiMediasNuvemAdapter({
      ...new MultiMediasNuvemAdapter().config, ...settings.multiMedias,
    }).calculate("WINFUT", candles)} asset="WINFUT" position={null}
      movingAverages={settings} />,
  );
  expect(first).toContain("MME 5");
  expect(first).toContain("MMP 12");
  expect(first).toContain("MME 30");
  expect(first).not.toContain("M15 MME");

  const second = renderToStaticMarkup(
    <CandleChart candles={candles} evaluation={{ authorization: null, signals: [], series: [], zone: "NONE" }}
      strategyId="MTF_ANGULACAO" mtfPoints={calculateMtfConfluence(candles, settings.mtf.periods).points}
      movingAverages={settings} asset="WINFUT" position={null} />,
  );
  expect(second).toContain("M15 MME 10");
  expect(second).toContain("M15 MME 250");
  expect(second).not.toContain("MMP 12");
});
