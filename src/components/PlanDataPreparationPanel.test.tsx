import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanDataPreparationPanel } from "./PlanDataPreparationPanel";
import { calculateSimulationPlan } from "../domain/simulationPlan";

describe("formulário guiado de CSVs por pregão", () => {
  it("alinha campo de arquivo e seleção de timeframe com ações vinculadas à data", () => {
    const plan = calculateSimulationPlan({
      asset: "WDOFUT", date: "2026-11-05", timeframeMinutes: 2,
    });
    const matches = plan.dataRequirements.map((requirement) => ({
      requirement, entry: null, status: "MISSING" as const,
    }));
    const html = renderToStaticMarkup(
      <PlanDataPreparationPanel plan={plan} matches={matches} onCatalogUpdated={() => undefined} />,
    );
    expect(html).toContain("Dados do pregão");
    expect(html).toContain('class="section-title-with-help"');
    expect(html).toContain('class="plan-data-file-row"');
    expect(html).toContain('class="plan-data-timeframe-row"');
    expect(html).toContain('id="source-csv-WARMUP-2026-11-04"');
    expect(html).toContain('for="source-csv-WARMUP-2026-11-04"');
    expect(html).toContain('id="source-timeframe-WARMUP-2026-11-04"');
    expect(html).toContain('for="source-timeframe-WARMUP-2026-11-04"');
    expect(html).toContain("Selecionar CSV");
    expect(html).toContain("Preparar replay");
    expect(html).not.toContain('class="plan-data-help"');
  });
});
