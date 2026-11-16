import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataPreparationPanel } from "./DataPreparationPanel";

describe("importação direta do CSV bruto para o acervo", () => {
  it("permite selecionar o arquivo, dia e timeframe sem plano de treino", () => {
    const html = renderToStaticMarkup(<DataPreparationPanel onPrepared={async () => undefined} />);
    expect(html).toContain("Selecionar CSV");
    expect(html).toContain("Preparar e adicionar");
    expect(html).toContain("Data específica do pregão");
    expect(html).toContain("Timeframe do CSV");
    expect(html).toContain('type="date"');
    expect(html).toContain('type="time"');
    expect(html).toContain("M1 — candles de 1 minuto");
    expect(html).toContain("M2 — candles de 2 minutos");
  });

  it("bloqueia alterações enquanto houver um treino ativo", () => {
    const html = renderToStaticMarkup(<DataPreparationPanel disabled />);
    expect(html).toContain("Selecionar CSV");
    expect(html).toContain('disabled=""');
  });
});
