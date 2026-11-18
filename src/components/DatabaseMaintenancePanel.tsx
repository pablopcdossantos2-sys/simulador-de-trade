import { useState } from "react";
import { readErrorMessage } from "../services/readErrorMessage";

interface Props {
  disabled: boolean;
  onDeleteAll: () => Promise<void>;
}

export function DatabaseMaintenancePanel({ disabled, onDeleteAll }: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Apagar todos os dados do banco e limpar o catálogo de pregões e replays? Isso apaga operações, sessões e eventos e restaura as configurações de execução. Os arquivos CSV e replay nas suas pastas serão preservados."
    );
    if (!confirmed) return;

    setBusy(true);
    setFeedback(null);
    try {
      await onDeleteAll();
      setFeedback("Todos os dados do banco foram apagados. As configurações de execução foram restauradas aos valores iniciais.");
    } catch (error) {
      setFeedback(readErrorMessage(error, "Não foi possível apagar o banco de dados."));
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
        A exclusão limpa o catálogo de pregões e replays, apaga operações, sessões e eventos e restaura as configurações de execução. Os arquivos CSV e replay nas suas pastas são preservados.
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
