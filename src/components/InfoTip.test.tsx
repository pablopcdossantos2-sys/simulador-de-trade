import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InfoTip } from "./InfoTip";

describe("ícone de ajuda contextual", () => {
  it("preserva a descrição acessível e usa um i vetorial sem deslocamento de fonte", () => {
    const html = renderToStaticMarkup(
      <InfoTip label="Sobre os dados" className="chart-info-tip">
        Exibe uma explicação contextual.
      </InfoTip>,
    );
    expect(html).toContain('class="info-tip chart-info-tip"');
    expect(html).toContain('aria-label="Sobre os dados"');
    expect(html).toContain('class="info-tip-symbol"');
    expect(html).toContain('viewBox="0 0 20 20"');
    expect(html).toContain("<circle");
    expect(html).toContain("<path");
    expect(html).toContain("Exibe uma explicação contextual.");
    expect(html).not.toContain('aria-hidden="true">i</span>');
  });
});
