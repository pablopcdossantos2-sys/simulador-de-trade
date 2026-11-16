import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  listReplayCatalog,
  registerReplayFile,
  pruneMissingReplayCatalog,
  type ReplayCatalogEntry,
} from "../services/replayCatalog";

interface Props {
  refreshKey: number;
  onCatalogUpdated?: () => void;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function AvailableReplaysPanel({ refreshKey, onCatalogUpdated }: Props) {
  const [entries, setEntries] = useState<ReplayCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modifying, setModifying] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const next = await listReplayCatalog();
      setEntries(next.slice().sort((a, b) =>
        b.tradeDate.localeCompare(a.tradeDate) ||
        b.sessionStart.localeCompare(a.sessionStart) ||
        a.symbol.localeCompare(b.symbol),
      ));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function addExistingReplay() {
    if (modifying) return;
    setModifying(true);
    try {
      const selected = await open({
        directory: false, multiple: false,
        filters: [{ name: "Replays preparados", extensions: ["csv"] }],
      });
      if (typeof selected !== "string") return;
      if (!selected.toLowerCase().endsWith(".replay.csv")) {
        throw new Error("Selecione um arquivo *.replay.csv gerado pelo Simulador de Trade, com seus metadados ao lado.");
      }
      const added = await registerReplayFile(selected);
      setNotice(`Replay ${added.asset} de ${formatDate(added.tradeDate)} adicionado ao catálogo.`);
      onCatalogUpdated?.();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setModifying(false);
    }
  }

  async function clearMissing() {
    if (modifying) return;
    setModifying(true);
    try {
      await pruneMissingReplayCatalog();
      setNotice("Referências a arquivos removidos foram limpas. Os replays existentes foram preservados.");
      onCatalogUpdated?.();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setModifying(false);
    }
  }

  useEffect(() => { void refresh(); }, [refreshKey]);

  const available = entries.filter((entry) => entry.exists);
  const unavailable = entries.length - available.length;

  return (
    <section className="available-replays-panel card">
      <div className="section-heading">
        <div>
          <h2>Pregões e replays disponíveis</h2>
          <p className="data-description">Consulte os replays preparados. Para importar CSVs brutos, use o formulário acima; para registrar arquivos de replay já gerados, use o botão ao lado.</p>
        </div>
        <div className="catalog-library-actions">
          <button type="button" className="secondary" onClick={() => void addExistingReplay()} disabled={loading || modifying}>
            {modifying ? "Aguarde..." : "Adicionar replay pronto"}
          </button>
          <button type="button" className="catalog-refresh" onClick={() => void refresh()} disabled={loading || modifying}>
            {loading ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>
      </div>

      <div className="available-replays-summary">
        <div><span>Replays disponíveis</span><strong>{available.length}</strong></div>
        <div><span>Arquivos indisponíveis</span><strong>{unavailable}</strong></div>
      </div>

      {error && <div className="data-status error">{error}</div>}
      {notice && <div className="data-status success" role="status">{notice}</div>}
      {!error && !loading && available.length === 0 && (
        <p className="empty-state">Nenhum replay foi catalogado ainda. Selecione um CSV do Profit no formulário acima ou adicione um replay já preparado.</p>
      )}

      <div className="available-replays-list">
        {available.map((entry) => (
          <article className="available-replay-item" key={entry.outputPath}>
            <div className="available-replay-main">
              <div className="available-replay-title">
                <strong>{entry.asset}</strong>
                <span>{formatDate(entry.tradeDate)}</span>
                <span className="available-replay-window">{entry.sessionStart}–{entry.sessionEnd}</span>
              </div>
              <small>{entry.symbol} · {entry.dataMode === "CANDLES_M1_SYNTHETIC" ? "M1 sintético" : entry.dataMode === "CANDLES_M2_SYNTHETIC" ? "M2 sintético" : "Formato legado"} · {formatBytes(entry.fileBytes)}</small>
              <small>Primeiro/último registro: {entry.firstTimestamp?.slice(11, 16) ?? "?"}–{entry.lastTimestamp?.slice(11, 16) ?? "?"} (janela configurada: {entry.sessionStart}–{entry.sessionEnd})</small>
              <small className="available-replay-filename">{entry.outputPath.split(/[\\/]/).pop()}</small>
            </div>
          </article>
        ))}
      </div>
      {unavailable > 0 && (
        <div className="catalog-footnote">
          {unavailable} referência(s) apontam para arquivos ausentes.
          <button type="button" className="secondary" onClick={() => void clearMissing()} disabled={modifying || loading}>Remover referências ausentes</button>
        </div>
      )}
    </section>
  );
}
