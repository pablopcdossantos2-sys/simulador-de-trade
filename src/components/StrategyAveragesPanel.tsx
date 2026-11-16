import { useEffect, useState } from "react";
import { InfoTip } from "./InfoTip";
import type { MovingAverageSettings, TradingStrategyId } from "../types";
import {
  defaultsForMovingAverages,
  MIN_MOVING_AVERAGE_PERIOD,
  MAX_MOVING_AVERAGE_PERIOD,
  selectedMovingAveragesLabel,
  validateMovingAverageSettings,
} from "../services/strategyMovingAverages";

interface Props {
  strategyId: TradingStrategyId;
  settings: MovingAverageSettings;
  disabled: boolean;
  onSave: (value: MovingAverageSettings) => Promise<void>;
}

function inputsFor(settings: MovingAverageSettings, id: TradingStrategyId): string[] {
  return id === "MTF_ANGULACAO"
    ? settings.mtf.periods.map(String)
    : [
        settings.multiMedias.emaFastLength,
        settings.multiMedias.wmaLength,
        settings.multiMedias.emaSlowLength,
      ].map(String);
}

export function StrategyAveragesPanel({ strategyId, settings, disabled, onSave }: Props) {
  const [fields, setFields] = useState(() => inputsFor(settings, strategyId));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFields(inputsFor(settings, strategyId));
    setFeedback(null);
  }, [strategyId, settings]);

  const isMtf = strategyId === "MTF_ANGULACAO";
  const labels = isMtf
    ? ["MME 1 · M15", "MME 2 · M15", "MME 3 · M15", "MME 4 · M15"]
    : ["MME rápida", "MMP intermediária", "MME lenta"];
  const updated = (index: number, value: string) => {
    setFields((current) => current.map((item, position) => position === index ? value : item));
    setFeedback(null);
  };

  async function save() {
    if (disabled || saving) return;
    const numbers = fields.map((value) => value.trim() === "" ? Number.NaN : Number(value));
    const next: MovingAverageSettings = {
      multiMedias: { ...settings.multiMedias },
      mtf: { periods: [...settings.mtf.periods] as [number, number, number, number] },
    };
    if (isMtf) {
      next.mtf.periods = numbers as [number, number, number, number];
    } else {
      [next.multiMedias.emaFastLength, next.multiMedias.wmaLength, next.multiMedias.emaSlowLength] = numbers;
    }
    try {
      validateMovingAverageSettings(next, strategyId);
      setSaving(true);
      await onSave(next);
      setFeedback("Médias salvas. Reaplique o plano para preparar o aquecimento com estes períodos.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar as médias.");
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaultFields() {
    if (disabled || saving) return;
    setFields(inputsFor(defaultsForMovingAverages(), strategyId));
    setFeedback("Valores padrão preenchidos. Clique em Salvar médias para aplicá-los.");
  }

  return (
    <details className="strategy-averages-panel card">
      <summary className="strategy-averages-toggle">
        <span className="strategy-averages-summary">
          <strong>Configurar médias da estratégia</strong>
          <small>{selectedMovingAveragesLabel(settings, strategyId)} · períodos em candles</small>
        </span>
        <span aria-hidden="true" className="strategy-averages-chevron">⌄</span>
      </summary>
      <div className="strategy-averages-body">
        <div className="section-title-with-help">
          <h3>{isMtf ? "Médias exponenciais de contexto M15" : "Médias do sistema Multi Médias"}</h3>
          <InfoTip label="Como configurar as médias">
            <p>Informe períodos inteiros entre {MIN_MOVING_AVERAGE_PERIOD} e {MAX_MOVING_AVERAGE_PERIOD}, em ordem crescente. As médias conservam seus métodos: MME exponencial, MMP ponderada. A VWAP não é uma média móvel e permanece inalterada.</p>
            <p>Alterar períodos muda os cálculos, sinais e autorizações do sistema ativo. A configuração é salva neste computador, e novos treinos registram os períodos utilizados. Para evitar inconsistências, a mudança não é permitida durante uma sessão ou com posição aberta.</p>
          </InfoTip>
        </div>
        <p className="strategy-averages-explanation">
          {isMtf
            ? "Quatro MMEs do contexto M15. As três primeiras participam da autorização direcional; a quarta aparece no gráfico como referência."
            : "MME rápida, MMP intermediária e MME lenta. O alinhamento entre as três médias determina os sinais e o toque na MME lenta permite reentradas."}
        </p>
        <div className="strategy-averages-fields">
          {labels.map((label, index) => (
            <label key={label} htmlFor={`avg-period-${index}`}>
              {label}
              <input
                id={`avg-period-${index}`}
                type="number"
                min={MIN_MOVING_AVERAGE_PERIOD}
                max={MAX_MOVING_AVERAGE_PERIOD}
                step="1"
                value={fields[index] ?? ""}
                onChange={(event) => updated(index, event.target.value)}
                disabled={disabled || saving}
              />
            </label>
          ))}
        </div>
        <div className="strategy-averages-actions">
          <button type="button" className="secondary" onClick={restoreDefaultFields}
            disabled={disabled || saving}>
            Preencher valores padrão
          </button>
          <button type="button" onClick={() => void save()} disabled={disabled || saving}>
            {saving ? "Salvando..." : "Salvar médias"}
          </button>
        </div>
        {disabled && <p className="strategy-averages-disabled">Finalize o treino e qualquer posição aberta antes de alterar as médias.</p>}
        {feedback && <p className="strategy-averages-feedback" role="status">{feedback}</p>}
      </div>
    </details>
  );
}
