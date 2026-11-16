import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TradingSystemsPanel } from "./TradingSystemsPanel";
import { defaultsForMovingAverages } from "../services/strategyMovingAverages";

describe("edição das estratégias em Sistemas de trading", () => {
  it("oferece editores individuais para os dois sistemas, sem exigir seleção prévia", () => {
    const markup = renderToStaticMarkup(
      <TradingSystemsPanel selectedStrategyId="MULTI_MEDIAS"
        movingAverages={defaultsForMovingAverages()} disabled={false}
        onSelect={() => undefined} onSaveStrategy={async () => undefined} />,
    );
    expect(markup).toContain("Editar parâmetros da estratégia");
    expect(markup.match(/Editar parâmetros da estratégia/g)).toHaveLength(2);
    expect(markup).toContain("MME rápida");
    expect(markup).toContain("MME 4 · M15");
    expect(markup).toContain("Angulação mínima (°)");
    expect(markup).toContain("Selecionar e treinar com este sistema (beta)");
    expect(markup).toContain("Ir ao Simulador com este sistema");
    expect(markup).not.toContain("Simulador → Configurar médias");
  });

  it("impede edição e seleção durante uma sessão ativa", () => {
    const markup = renderToStaticMarkup(
      <TradingSystemsPanel selectedStrategyId="MTF_ANGULACAO"
        movingAverages={defaultsForMovingAverages()} disabled
        onSelect={() => undefined} onSaveStrategy={async () => undefined} />,
    );
    expect(markup).toContain("Finalize o treino");
    expect(markup).toContain('disabled=""');
  });
});
