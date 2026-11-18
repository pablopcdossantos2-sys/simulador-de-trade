import { useEffect, useState, type FormEvent } from "react";
import { STRATEGY_NAMES } from "../domain/tradingStrategies";
import type { TradingStrategyId } from "../types";

const storageKey = "simulador-de-trade:training-alerts-v1";
const strategies = Object.keys(STRATEGY_NAMES) as TradingStrategyId[];
const defaultWarning = "Entrada bloqueada. Aguarde uma região autorizada pela estratégia.";

export function loadTrainingAlerts() {
  const settings = {
    warning: defaultWarning,
    minutes: 5,
    messages: Object.fromEntries(strategies.map(id => [id, ["", "", "", ""]])) as Record<TradingStrategyId, string[]>,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    if (typeof raw.warning === "string" && raw.warning.trim()) settings.warning = raw.warning;
    if (Number.isInteger(raw.minutes) && raw.minutes >= 1 && raw.minutes <= 1440) settings.minutes = raw.minutes;
    for (const id of strategies) {
      settings.messages[id] = settings.messages[id].map((_, index) => {
        const value = raw.messages?.[id]?.[index];
        return typeof value === "string" ? value : "";
      });
    }
  } catch { /* Usa os padrões quando a preferência não está disponível. */ }
  return settings;
}

type Settings = ReturnType<typeof loadTrainingAlerts>;

interface SettingsProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function TrainingAlertSettings({ settings, onSave }: SettingsProps) {
  const [draft, setDraft] = useState(settings);
  const [status, setStatus] = useState("");

  function updateReminder(strategy: TradingStrategyId, index: number, text: string) {
    const messages = [...draft.messages[strategy]];
    messages[index] = text;
    setDraft({ ...draft, messages: { ...draft.messages, [strategy]: messages } });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const next = { ...draft, warning: draft.warning.trim() || defaultWarning };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      onSave(next);
      setDraft(next);
      setStatus("Preferências salvas.");
    } catch {
      setStatus("Não foi possível salvar as preferências.");
    }
  }

  return <form className="card training-alert-settings" onChange={() => setStatus("")} onSubmit={save}>
    <h3>Operação fora da região autorizada</h3>
    <label>Mensagem exibida e lida em voz alta
      <input maxLength={300} value={draft.warning} onChange={e => setDraft({ ...draft, warning: e.target.value })} />
    </label>
    <h3>Lembretes</h3>
    <label>Intervalo em minutos reais
      <input type="number" min="1" max="1440" required value={draft.minutes || ""} onChange={e => setDraft({ ...draft, minutes: Number(e.target.value) })} />
    </label>
    <p>Os textos preenchidos se alternam durante a sessão, inclusive com o replay pausado.</p>
    {strategies.map((id, number) => (
      <fieldset key={id}>
        <legend>Sistema 0{number + 1} · {STRATEGY_NAMES[id]}</legend>
        {draft.messages[id].map((value, index) => (
          <label key={index}>Lembrete {index + 1}
            <input value={value} maxLength={300} onChange={e => updateReminder(id, index, e.target.value)} />
          </label>
        ))}
      </fieldset>
    ))}
    <button type="submit">Salvar alertas e lembretes</button>
    <small role="status">{status}</small>
  </form>;
}

export function TrainingReminder({ settings, strategy }: { settings: Settings; strategy: TradingStrategyId }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMessage("");
    const texts = settings.messages[strategy].map(text => text.trim()).filter(Boolean);
    if (!texts.length) return;
    let index = 0;
    let hideTimer: number;
    const timer = window.setInterval(() => {
      setMessage(texts[index]);
      index = (index + 1) % texts.length;
      hideTimer = window.setTimeout(() => setMessage(""), 12000);
    }, settings.minutes * 60000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(hideTimer);
    };
  }, [settings, strategy]);
  return message ? <aside className="training-reminder" role="status"><strong>Lembrete</strong>
    <span>{message}</span><button onClick={() => setMessage("")} aria-label="Fechar lembrete">×</button>
  </aside> : null;
}
