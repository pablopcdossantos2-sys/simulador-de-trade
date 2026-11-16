import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvailableReplaysPanel } from "./AvailableReplaysPanel";

describe("catálogo acessível diretamente na área de pregões", () => {
  it("permite adicionar um replay já processado e atualizar a lista", () => {
    const html = renderToStaticMarkup(
      <AvailableReplaysPanel refreshKey={0} onCatalogUpdated={() => undefined} />,
    );
    expect(html).toContain("Pregões e replays disponíveis");
    expect(html).toContain("Adicionar replay pronto");
    expect(html).toContain("Atualizar lista");
    expect(html).not.toContain("Prepare um arquivo do Profit na seção Simulador");
  });
});
