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
