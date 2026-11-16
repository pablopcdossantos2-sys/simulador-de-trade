import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplaySelectionPanel } from "../components/ReplaySelectionPanel";
import { replayChoiceForDate, replayChoicesFromCatalog } from "./replayChoices";
import { defaultsForMovingAverages } from "../services/strategyMovingAverages";
import type { ReplayCatalogEntry } from "../services/replayCatalog";

function entry(date: string, path: string, exists = true): ReplayCatalogEntry {
  return {
    outputPath: path, metadataPath: path + ".meta.json", symbol: "WINFUT",
    asset: "WINFUT", tradeDate: date, sessionStart: "09:00", sessionEnd: "18:25",
    firstTimestamp: `${date}T09:00:00`, lastTimestamp: `${date}T18:24:00`,
    fileBytes: 1048576, exists, dataMode: "CANDLES_M2_SYNTHETIC",
  };
}

describe("seleção de replays catalogados, sem importar CSV no Simulador", () => {
  const settings = defaultsForMovingAverages();
  it("deduplica M1/M2 e só habilita o dia com o histórico anterior", () => {
    const catalog = [entry("2026-11-12", "warmup-m2.csv"), entry("2026-11-13", "target-m2.csv")];
    expect(replayChoiceForDate(catalog, "WINFUT", "2026-11-13", "MULTI_MEDIAS", settings).ready).toBe(true);
    expect(replayChoicesFromCatalog([...catalog, {...catalog[1], outputPath: "target-m1.csv"}],
      "MULTI_MEDIAS", settings)).toHaveLength(2);
    expect(replayChoiceForDate([catalog[1]], "WINFUT", "2026-11-13",
      "MULTI_MEDIAS", settings).ready).toBe(false);
  });
  it("avisa sobre dia sem replay-alvo e sobre contrato de aquecimento incompatível", () => {
    const catalog = [entry("2026-11-12", "warmup.csv")];
    const missing = replayChoiceForDate(catalog, "WINFUT", "2026-11-13", "MULTI_MEDIAS", settings);
    expect(missing.targetReady).toBe(false);
    expect(missing.missing.some(m => m.requirement.role === "TARGET")).toBe(true);
    const wrongContract = [{...catalog[0], symbol:"WINV26"}, {...entry("2026-11-13","target.csv"), symbol:"WINZ26"}];
    expect(replayChoiceForDate(wrongContract, "WINFUT", "2026-11-13", "MULTI_MEDIAS", settings).ready).toBe(false);
  });
  it("não considera arquivo removido um replay válido", () => {
    const catalog = [entry("2026-11-12", "warmup.csv"), entry("2026-11-13", "target.csv", false)];
    const choice = replayChoiceForDate(catalog, "WINFUT", "2026-11-13", "MULTI_MEDIAS", settings);
    expect(choice.targetReady).toBe(false);
    expect(replayChoicesFromCatalog(catalog, "MULTI_MEDIAS", settings)).toHaveLength(1);
  });
  it("exibe orientação para preparar arquivos quando catálogo está vazio", () => {
    const html = renderToStaticMarkup(<ReplaySelectionPanel entries={[]} loading={false} error={null}
      strategyId="MULTI_MEDIAS" settings={settings} currentPlan={null}
      disabled={false} onSelect={() => undefined} onPrepare={() => undefined} onRefresh={() => undefined} />);
    expect(html).toContain("Nenhum pregão pronto para seleção");
    expect(html).toContain("Ir para Pregões e replays");
    expect(html).not.toContain("Selecionar CSV");
  });
});
