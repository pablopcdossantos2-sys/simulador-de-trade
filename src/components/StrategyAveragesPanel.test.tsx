import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StrategyAveragesPanel } from "./StrategyAveragesPanel";
import { defaultsForMovingAverages } from "../services/strategyMovingAverages";

const settings = defaultsForMovingAverages();

describe("configuração das médias no Simulador", () => {
  it("mostra as três médias da primeira estratégia e os períodos padrão", () => {
    const html = renderToStaticMarkup(
      <StrategyAveragesPanel strategyId="MULTI_MEDIAS" settings={settings}
        disabled={false} onSave={async () => undefined} />,
    );
    expect(html).toContain("Configurar médias da estratégia");
    expect(html).toContain("MME rápida");
    expect(html).toContain("MMP intermediária");
    expect(html).toContain("MME lenta");
    expect(html).toContain("MME 8 · MMP 20 · MME 52");
    expect(html).toContain("Salvar médias");
  });

  it("mostra quatro MMEs M15 e bloqueia a edição durante treino", () => {
    const html = renderToStaticMarkup(
      <StrategyAveragesPanel strategyId="MTF_ANGULACAO" settings={settings}
        disabled={true} onSave={async () => undefined} />,
    );
    expect(html).toContain("MME 4 · M15");
    expect(html).toContain("M15 MME 8/20/50/200");
    expect(html).toContain("Finalize o treino");
    expect(html).toContain('disabled=""');
  });
});

it("apresenta os interruptores globais e individuais da confluência M15", () => {
  const html = renderToStaticMarkup(
    <StrategyAveragesPanel strategyId="MTF_ANGULACAO" settings={settings}
      disabled={false} onSave={async () => undefined} />,
  );
  expect(html).toContain("Usar angulação no fundo");
  expect(html).toContain("Usar alinhamento das médias");
  expect(html).toContain("Usar MME 200 no fundo");
  expect(html).toContain("Usar VWAP diária no fundo");
  expect(html).toContain("Usar TPV no fundo");
  expect(html).toContain("ATR 14");
  expect(html).toContain("sem desvio-padrão");
  expect(html).toContain("Angulação mínima (°)");
  expect(html).toContain('aria-label="Angulação mínima da MME 1 em graus"');
  expect(html).toContain("Exibir no gráfico");
  expect(html).toContain("Usar no fundo");
  expect(html).toContain('value="1.5"');
  expect(html).not.toContain("0,45 desvio");
});
