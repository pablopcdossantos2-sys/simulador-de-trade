import { useState } from "react";
import { readErrorMessage } from "../services/readErrorMessage";
import { refreshUsageSessions } from "../services/usageTracking";
import {
  backupAvailable,
  exportBackup,
  importBackup,
  type BackupSummary,
} from "../services/backup";

interface Props {
  disabled: boolean;
  onImported: (summary: BackupSummary, mode: "merge" | "replace_all") => void | Promise<void>;
}

function summaryText(action: string, summary: BackupSummary): string {
  return `${action}. Arquivo contém ${summary.trades} trades, ${summary.sessions} sessões de treino, ${summary.events} eventos, ${summary.usageSessions} sessões de uso e ${summary.replays ?? 0} replay(s) com seus metadados · ${summary.strategySettings ? "configurações das estratégias incluídas" : "sem configurações de estratégia (backup antigo)"} · schema v${summary.schemaVersion}.`;
}

export function BackupPanel({ disabled, onImported }: Props) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace_all">("merge");
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
        readErrorMessage(error, "Não foi possível exportar o backup."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (
      importMode === "replace_all" &&
      !window.confirm("Substituir todos os trades, sessões, eventos e configurações locais pelos dados do backup? Os replays incluídos também serão restaurados. Esta ação não pode ser desfeita.")
    ) return;

    setBusy("import");
    setFeedback(null);

    try {
      const result = await importBackup(importMode);
      if (result) {
        await onImported(result, importMode);
        await refreshUsageSessions();
        setFeedback(summaryText(
          importMode === "merge"
            ? "Backup mesclado; preferências das estratégias locais preservadas"
            : "Backup restaurado; configurações presentes no arquivo aplicadas",
          result,
        ));
      }
    } catch (error) {
      setFeedback(
        readErrorMessage(error, "Não foi possível importar o backup."),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="backup-panel card">
      <div className="section-heading">
        <div>
          <h2>Backup e restauração</h2>
        </div>
        <span className="history-count">JSON v1</span>
      </div>

      <p className="data-description">
        Exporte sessões, trades, notas, avaliações individuais, snapshots de
        entrada, eventos, configurações e todos os arquivos de replay catalogados,
        incluindo seus metadados e as configurações das duas estratégias salvas em
        Sistemas de trading. Ao importar, os replays são restaurados e catalogados.
        Em “Mesclar”, as configurações atuais continuam ativas. Em “Substituir tudo”,
        os dados e as configurações das estratégias presentes no backup são restaurados.
        Backups antigos sem esses ajustes mantêm as preferências atuais.
      </p>

      <div className="backup-import-mode">
        <label htmlFor="backup-import-choice">Modo de importação</label>
        <select
          id="backup-import-choice"
          aria-describedby="backup-import-explanation"
          value={importMode}
          onChange={(event) => setImportMode(event.target.value as "merge" | "replace_all")}
          disabled={disabled || busy !== null || !available}
        >
          <option value="merge">Mesclar</option>
          <option value="replace_all">Substituir tudo</option>
        </select>
        <small id="backup-import-explanation">
          {importMode === "merge"
            ? "Preserva registros e configurações locais; acrescenta informações do backup."
            : "Substitui registros e restaura as configurações de estratégia se existirem no arquivo."}
        </small>
      </div>

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
