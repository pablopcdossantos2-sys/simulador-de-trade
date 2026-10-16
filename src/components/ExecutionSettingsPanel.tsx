import { useEffect, useState } from "react";
import {
  saveExecutionSettings,
} from "../services/executionSettings";
import type { ExecutionSettings } from "../types";

interface Props {
  settings: ExecutionSettings;
  onSaved: (settings: ExecutionSettings) => void;
}

export function ExecutionSettingsPanel({ settings, onSaved }: Props) {
  const [cost, setCost] = useState(
    String(settings.costPerContractRoundTripBRL),
  );
  const [slippage, setSlippage] = useState(
    String(settings.slippageTicksPerSide),
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCost(String(settings.costPerContractRoundTripBRL));
    setSlippage(String(settings.slippageTicksPerSide));
  }, [
    settings.costPerContractRoundTripBRL,
    settings.slippageTicksPerSide,
  ]);

  async function save() {
    const nextCost = Number(cost);
    const nextSlippage = Number(slippage);

    if (!Number.isFinite(nextCost) || nextCost < 0) {
      setFeedback("O custo precisa ser um valor maior ou igual a zero.");
      return;
    }

    if (!Number.isInteger(nextSlippage) || nextSlippage < 0) {
      setFeedback(
        "O slippage precisa ser uma quantidade inteira de ticks maior ou igual a zero.",
      );
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const next = await saveExecutionSettings({
        costPerContractRoundTripBRL: nextCost,
        slippageTicksPerSide: nextSlippage,
      });
      onSaved(next);
      setFeedback("Configurações de execução salvas.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as configurações.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="execution-settings card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Configurações</p>
          <h2>Execução simulada</h2>
        </div>
        <span className="history-count">
          snapshot por trade
        </span>
      </div>

      <p className="data-description">
        Defina custos e slippage usados nas próximas operações. Trades já
        encerrados preservam os valores que estavam ativos no momento da entrada.
      </p>

      <div className="execution-settings-grid">
        <label>
          Custo por contrato · round trip (R$)
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
          <small>
            Total de custos da operação completa por contrato. Padrão: R$ 0,00.
          </small>
        </label>

        <label>
          Slippage por lado (ticks)
          <input
            type="number"
            min="0"
            step="1"
            value={slippage}
            onChange={(event) => setSlippage(event.target.value)}
          />
          <small>
            Aplicado adversamente na entrada e na saída. Padrão: 0 tick.
          </small>
        </label>
      </div>

      <div className="execution-settings-actions">
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
        <span>
          Slippage altera o preço executado. O custo é descontado separadamente
          para formar o resultado líquido.
        </span>
      </div>

      {feedback && (
        <div className="data-status">{feedback}</div>
      )}
    </section>
  );
}
