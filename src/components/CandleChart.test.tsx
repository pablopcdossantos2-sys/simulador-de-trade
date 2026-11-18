import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandleChart } from "./CandleChart";
import { MultiMediasNuvemAdapter } from "../services/indicator";
import { calculateMtfConfluence } from "../services/mtfConfluence";
import { INDICATOR_V1_REGRESSION_CANDLES } from "../fixtures/indicatorV1";
import { defaultsForMovingAverages } from "../services/strategyMovingAverages";

it.each(["BUY", "SELL"] as const)("mostra os pontos por contrato da posição %s mesmo ao consultar um candle anterior", side => {
  const direction = side === "BUY" ? 1 : -1;
  const candles = INDICATOR_V1_REGRESSION_CANDLES.slice(-2).map((candle, index) => ({
    ...candle, index, open: 5000, close: index ? 5000 + direction * 1.5 : 5000,
    low: 4998, high: 5002,
  }));
  const markup = renderToStaticMarkup(
    <CandleChart candles={candles} initialPanOffset={1} asset="WDOFUT"
      evaluation={{ authorization: null, signals: [], series: [], zone: "NONE" }}
      position={{ id: "pos", asset: "WDOFUT", side, signalId: "s", openedCandleIndex: 0,
        requestedEntry: 5000, entry: 5000, stopLoss: 5000 - direction * 2, target: 5000 + direction * 5,
        contracts: 3, slippageTicksPerSide: 0, costPerContractRoundTripBRL: 0,
        intrabarPolicy: "STOP_FIRST", entryContext: null, openedAt: candles[0].timestamp, status: "OPEN" }} />,
  );
  expect(markup).toContain("Entrada 5.000,0 · +1,5 pts");
  expect(markup).toMatch(/Stop [\d.,]+ · -2 pts/);
  expect(markup).toMatch(/Alvo [\d.,]+ · \+5 pts/);
});

it("enquadra todos os candles do último pregão anterior e exclui dias de aquecimento mais antigos", () => {
  const context = Array.from({ length: 41 }, (_, index) => ({
    index: index - 10,
    timestamp: index === 0 ? "2026-10-01T18:00:00"
      : new Date(Date.UTC(2026, 9, 2, 9, 2 * (index - 1))).toISOString().slice(0, 19),
    open: 100, high: 105, low: 95, close: 100, volume: 1,
  }));
  const markup = renderToStaticMarkup(
    <CandleChart candles={[]} contextCandles={context} fitAllCandles
      evaluation={{ authorization: null, signals: [], series: [], zone: "NONE" }}
      position={null} asset="WINFUT" />,
  );
  expect(markup).toContain("40 candles · visão completa");
  expect(markup).toContain("09:00");
  expect(markup).not.toContain("18:00");
});

it("aplica uma única aparência a todos os segmentos neutros do Sistema 02", () => {
  const candles = INDICATOR_V1_REGRESSION_CANDLES.slice(-4);
  const points = calculateMtfConfluence(candles).points.slice(0, 3);
  points[0].zone = "GREEN";
  points[1].zone = "RED";
  points[2].zone = "NONE";
  for (const shadeNeutral of [true, false]) {
    const settings = defaultsForMovingAverages();
    settings.mtf.shadeNeutral = shadeNeutral;
    const html = renderToStaticMarkup(
      <CandleChart candles={candles} evaluation={{ authorization: null, signals: [], series: [], zone: "NONE" }}
        strategyId="MTF_ANGULACAO" mtfPoints={points} movingAverages={settings} asset="WINFUT" position={null} />,
    );
    expect(html.match(/class="chart-mtf-regime-neutral"/g) ?? []).toHaveLength(shadeNeutral ? 2 : 0);
    expect(html).toContain('class="chart-mtf-regime-buy"');
    expect(html).toContain('class="chart-mtf-regime-sell"');
  }
});

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

it("reserva a leitura do M15 em faixa própria e exibe contagem regressiva de tempo de replay", () => {
  const candles = INDICATOR_V1_REGRESSION_CANDLES;
  const evaluation = { authorization: null, signals: [], series: [], zone: "NONE" as const };
  const last = candles.at(-1)!;
  const markup = renderToStaticMarkup(
    <CandleChart candles={candles} evaluation={evaluation} asset="WINFUT" position={null}
      strategyId="MTF_ANGULACAO" mtfPoints={calculateMtfConfluence(candles).points}
      replayTimestamp={last.timestamp} replayTimeframeMinutes={2} showCountdown />,
  );
  expect(markup).toContain('class="chart-readouts"');
  expect(markup).toContain('class="chart-mtf-readout"');
  expect(markup).toContain('class="chart-controls"');
  expect(markup.indexOf('class="chart-ohlc"')).toBeLessThan(markup.indexOf('class="chart-mtf-readout"'));
  expect(markup.indexOf('class="chart-mtf-readout"')).toBeLessThan(markup.indexOf('class="chart-controls"'));
  expect(markup).toContain("Fechamento M2");
  expect(markup).toContain("02:00");
  expect(markup).toContain('class="chart-status-cards"');
  expect(markup).toContain('class="chart-status-card chart-countdown-card"');
  expect(markup).toContain('class="chart-status-card chart-cursor-card"');
  expect(markup).toContain("Passe o mouse sobre o gráfico");
  expect(markup).not.toContain('class="candle-close-countdown"');
  expect(markup).not.toContain('class="crosshair-readout"');
  const endOfSvg = markup.indexOf("</svg>");
  expect(markup.indexOf('class="chart-status-cards"')).toBeGreaterThan(endOfSvg);
  expect(markup.indexOf('class="chart-countdown-value"')).toBeGreaterThan(endOfSvg);
  expect(markup.indexOf('class="chart-cursor-values"')).toBeGreaterThan(endOfSvg);
});

it("mantém a leitura do cursor abaixo do gráfico mesmo quando o cronômetro está desativado", () => {
  const candles = INDICATOR_V1_REGRESSION_CANDLES;
  const markup = renderToStaticMarkup(
    <CandleChart candles={candles}
      evaluation={new MultiMediasNuvemAdapter().calculate("WINFUT", candles)}
      asset="WINFUT" position={null} />,
  );
  expect(markup).toContain('class="chart-status-cards chart-status-cards-single"');
  expect(markup).toContain('class="chart-status-card chart-cursor-card"');
  expect(markup).not.toContain("chart-countdown-card");
  expect(markup.indexOf('class="chart-cursor-values"')).toBeGreaterThan(markup.indexOf("</svg>"));
});

it("separa a exibição das MMEs M15 dos votos que geram o fundo", () => {
  const candles = INDICATOR_V1_REGRESSION_CANDLES;
  const evaluation = { authorization: null, signals: [], series: [], zone: "NONE" as const };
  const mtfPoints = calculateMtfConfluence(candles).points;
  const settings = defaultsForMovingAverages();
  settings.mtf.filters!.voteOn = [false, false, false, false];
  const visualOnly = renderToStaticMarkup(
    <CandleChart candles={candles} evaluation={evaluation} asset="WINFUT" position={null}
      strategyId="MTF_ANGULACAO" mtfPoints={mtfPoints} movingAverages={settings} />,
  );
  expect(visualOnly).toContain("indicator-mtf-m1-line");
  expect(visualOnly).toContain("indicator-mtf-m4-line");
  settings.mtf.filters!.voteOn = [true, true, true, false];
  settings.mtf.plotOn = [false, true, true, false];
  const hidden = renderToStaticMarkup(
    <CandleChart candles={candles} evaluation={evaluation} asset="WINFUT" position={null}
      strategyId="MTF_ANGULACAO" mtfPoints={mtfPoints} movingAverages={settings} />,
  );
  expect(hidden).not.toContain("indicator-mtf-m1-line");
  expect(hidden).not.toContain("indicator-mtf-m4-line");
  expect(hidden).toContain("indicator-mtf-m2-line");
  expect(hidden).toContain("indicator-mtf-m3-line");
  expect(hidden).not.toContain("M15 MME 8");
  expect(hidden).not.toContain("M15 MME 200");
});

it("recorta preços e médias na área de preço, mantendo barras de volume fora dela", () => {
  const candles = INDICATOR_V1_REGRESSION_CANDLES;
  const markup = renderToStaticMarkup(
    <CandleChart candles={candles}
      evaluation={new MultiMediasNuvemAdapter().calculate("WINFUT", candles)}
      contextCandles={candles.slice(0, 5)}
      fitAllCandles
      asset="WINFUT" position={null} />,
  );
  expect(markup).toContain('class="chart-price-layer"');
  expect(markup).toContain('class="chart-volume-layer"');
  expect(markup).toContain("<clipPath");
  expect(markup).toMatch(/class="chart-price-layer"[^>]*clip-path="url\(#/);
  expect(markup).toMatch(/class="chart-volume-layer"[^>]*clip-path="url\(#/);
  const priceStart = markup.indexOf('class="chart-price-layer"');
  const volumeStart = markup.indexOf('class="chart-volume-layer"');
  const priceBody = markup.slice(priceStart, volumeStart);
  expect(priceBody).toContain("indicator-ema8-line");
  expect(priceBody).not.toContain("volume-up");
  expect(markup.slice(volumeStart)).toContain("volume-up");
  expect(markup.indexOf("JANELA DE TREINO")).toBeGreaterThan(volumeStart);
});
