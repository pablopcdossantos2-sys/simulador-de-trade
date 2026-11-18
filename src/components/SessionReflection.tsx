import { useState } from "react";
import { createTrainingEvent } from "../domain/training";
import { saveTrainingEvent } from "../services/persistence";
import type { TrainingEvent } from "../types";

export function SessionReflection({ sessionId, onSaved }: {
  sessionId: string;
  onSaved: (event: TrainingEvent) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const text = draft.trim();

  async function save() {
    if (busy || !text || text === saved) return;
    setBusy(true);
    setError("");
    try {
      const event = createTrainingEvent({ sessionId, type: "SESSION_REFLECTION", reason: text });
      event.id = sessionId + "-reflection";
      await saveTrainingEvent(event);
      setSaved(text);
      onSaved(event);
    } catch {
      setError("Falha ao salvar o relato. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="card session-reflection">
    <label htmlFor="session-reflection">Quais erros você identificou neste treino?</label>
    <textarea id="session-reflection" rows={3} maxLength={2000}
      value={draft} onChange={event => setDraft(event.target.value)} />
    <button type="button" disabled={busy || !text || text === saved} onClick={() => void save()}>Salvar relato</button>
    <span role="status">{error || (saved && saved === text ? "Relato salvo no histórico da sessão." : "")}</span>
  </section>;
}
