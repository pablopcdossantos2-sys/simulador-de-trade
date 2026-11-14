import { useEffect, useState } from "react";
import {
  listReplayCatalog,
  type ReplayCatalogEntry,
} from "../services/replayCatalog";

interface Props {
  refreshKey: number;
  onUseReplay: (path: string) => void;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function AvailableReplaysPanel({ refreshKey, onUseReplay }: Props) {
  const [entries, setEntries] = useState<ReplayCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { void refresh(); }, [refreshKey]);

  const available = entries.filter((entry) => entry.exists);
  const unavailable = entries.length - available.length;

  return (
    <section className="available-replays-panel card">
      <div className="section-heading">
        <div>
          <h2>Pregões e replays disponíveis</h2>
          <p className="data-description">Consulte os pregões já preparados e selecione um replay para carregá-lo no simulador.</p>
        </div>
        <button type="button" className="catalog-refresh" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Atualizando..." : "Atualizar lista"}
        </button>
      </div>

      <div className="available-replays-summary">
        <div><span>Replays disponíveis</span><strong>{available.length}</strong></div>
        <div><span>Arquivos indisponíveis</span><strong>{unavailable}</strong></div>
      </div>

      {error && <div className="data-status error">{error}</div>}
      {!error && !loading && available.length === 0 && (
        <p className="empty-state">Nenhum replay foi catalogado ainda. Prepare um arquivo do Profit na seção Simulador para adicioná-lo a esta lista.</p>
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
              <small>{entry.symbol} · {formatBytes(entry.fileBytes)}</small>
              <small className="available-replay-filename">{entry.outputPath.split(/[\\/]/).pop()}</small>
            </div>
            <button type="button" onClick={() => onUseReplay(entry.outputPath)}>Usar no simulador</button>
          </article>
        ))}
      </div>
      {unavailable > 0 && (
        <p className="catalog-footnote">{unavailable} referência(s) apontam para arquivos que não estão mais no local original. Use “Atualizar catálogo” na seção Simulador para removê-las.</p>
      )}
    </section>
  );
}
