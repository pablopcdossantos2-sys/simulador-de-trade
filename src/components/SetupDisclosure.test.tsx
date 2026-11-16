import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupDisclosure } from "./SetupDisclosure";

describe("etapas compactas do planejamento", () => {
  it("mantém etapas completas contraídas e mostra o resumo sem esconder a edição", () => {
    const html = renderToStaticMarkup(
      <SetupDisclosure title="Planejar simulação" status="11/11/2026 · WINFUT" complete>
        <button>Modificar plano</button>
      </SetupDisclosure>,
    );
    expect(html).toContain("Planejar simulação");
    expect(html).toContain("11/11/2026 · WINFUT");
    expect(html).not.toMatch(/<details[^>]*\sopen=/);
    expect(html).toContain("Modificar plano");
  });
  it("abre etapas pendentes automaticamente e pode deixar as futuras fechadas", () => {
    const pending = renderToStaticMarkup(
      <SetupDisclosure title="Dados do pregão" status="2 arquivos faltantes" complete={false}>
        <input aria-label="Arquivo" />
      </SetupDisclosure>,
    );
    expect(pending).toMatch(/<details[^>]*\sopen=""/);
    const future = renderToStaticMarkup(
      <SetupDisclosure title="Carregar replay" status="Aguardando o plano"
        complete={false} expandWhenIncomplete={false}>
        <button>Carregar</button>
      </SetupDisclosure>,
    );
    expect(future).not.toMatch(/<details[^>]*\sopen=/);
  });
});
