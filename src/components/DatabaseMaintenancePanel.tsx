import { useState } from "react";

interface Props {
  disabled: boolean;
  onDeleteAll: () => Promise<void>;
}

export function DatabaseMaintenancePanel({ disabled, onDeleteAll }: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Apagar TODOS os dados do banco de dados? Serão removidos trades, sessões de treinamento e eventos, e as configurações de execução voltarão aos valores iniciais. Esta ação é permanente e não pode ser desfeita."
    );
    if (!confirmed) return;

    setBusy(true);
    setFeedback(null);
    try {
      await onDeleteAll();
      setFeedback("Todos os dados do banco foram apagados. As configurações de execução foram restauradas aos valores iniciais.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível apagar o banco de dados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="database-maintenance card">
      <div className="section-heading">
        <h2>Banco de dados</h2>
      </div>
      <p className="data-description">
        Apague definitivamente todas as operações, sessões de treinamento, eventos e configurações de execução armazenados pelo aplicativo. As configurações voltarão aos valores iniciais. Os arquivos CSV e replay existentes nas pastas do computador não serão removidos.
      </p>
      <button
        type="button"
        className="danger-button"
        onClick={() => void handleDelete()}
        disabled={disabled || busy}
      >
        {busy ? "Apagando banco de dados..." : "Apagar todos os dados do banco"}
      </button>
      {disabled && (
        <small className="training-hint">
          Encerre a posição e a sessão de treinamento antes de apagar os dados.
        </small>
      )}
      {feedback && <div className="data-status" role="status">{feedback}</div>}
    </section>
  );
}
