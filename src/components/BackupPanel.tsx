import { useState } from "react";
import {
  backupAvailable,
  exportBackup,
  importBackup,
  type BackupSummary,
} from "../services/backup";

interface Props {
  disabled: boolean;
  onImported: () => void | Promise<void>;
}

function summaryText(action: string, summary: BackupSummary): string {
  return `${action}: ${summary.trades} trades, ${summary.sessions} sessões e ${summary.events} eventos · schema v${summary.schemaVersion}.`;
}

export function BackupPanel({ disabled, onImported }: Props) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const available = backupAvailable();

  async function handleExport() {
    setBusy("export");
    setFeedback(null);

    try {
      const result = await exportBackup();
      if (result) {
        setFeedback(summaryText("Backup exportado", result));
      }
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível exportar o backup.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    setBusy("import");
    setFeedback(null);

    try {
      const result = await importBackup();
      if (result) {
        await onImported();
        setFeedback(summaryText("Backup importado e mesclado", result));
      }
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível importar o backup.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="backup-panel card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Segurança dos dados</p>
          <h2>Backup e restauração</h2>
        </div>
        <span className="history-count">JSON v1</span>
      </div>

      <p className="data-description">
        Exporte sessões, trades, notas, snapshots de entrada, eventos e
        configurações. A importação mescla o arquivo ao banco atual por ID:
        registros correspondentes são atualizados e os demais são adicionados.
      </p>

      <div className="backup-actions">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={disabled || busy !== null || !available}
        >
          {busy === "export" ? "Exportando..." : "Exportar backup"}
        </button>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={disabled || busy !== null || !available}
        >
          {busy === "import" ? "Importando..." : "Importar backup"}
        </button>
      </div>

      {!available && (
        <small className="training-hint">
          Use o aplicativo desktop Tauri para acessar os diálogos nativos de
          arquivos.
        </small>
      )}

      {disabled && (
        <small className="training-hint">
          Finalize a sessão/posição atual antes de exportar ou importar dados.
        </small>
      )}

      {feedback && <div className="data-status">{feedback}</div>}
    </section>
  );
}
