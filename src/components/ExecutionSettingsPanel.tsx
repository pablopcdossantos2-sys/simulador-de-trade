import { useEffect, useState } from "react";
import { InfoTip } from "./InfoTip";
import { saveExecutionSettings } from "../services/executionSettings";
import type { ExecutionSettings, IntrabarPolicy } from "../types";

interface Props {
  settings: ExecutionSettings;
  onSaved: (settings: ExecutionSettings) => void;
}

const COST_REFERENCE_URL = "https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/day-trade/conheca-as-caracteristicas-dos-principais-produtos-de-day-trade/";
const WIN_TARIFF_URL = "https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-ibovespa-e-indice-brasil-50/futuros-e-estruturadas/";
const WDO_TARIFF_URL = "https://b3.com.br/main.jsp?doui_processActionId=setLocaleProcessAction&locale=pt_BR&lumA=1&lumII=8A80CB816340383D4F50DA&lumPageId=8A68812D556EB21301556F5951D27D3C";

function formatOptionalBalance(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseOptionalBalance(raw: string, label: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}: informe um valor maior que zero ou deixe em branco.`);
  }
  return value;
}

export function ExecutionSettingsPanel({ settings, onSaved }: Props) {
  const [winCost, setWinCost] = useState(String(settings.costWinRoundTripBRL ?? settings.costPerContractRoundTripBRL));
  const [wdoCost, setWdoCost] = useState(String(settings.costWdoRoundTripBRL ?? settings.costPerContractRoundTripBRL));
  const [slippage, setSlippage] = useState(String(settings.slippageTicksPerSide));
  const [intrabarPolicy, setIntrabarPolicy] = useState<IntrabarPolicy>(settings.intrabarPolicy);
  const [disciplineBalance, setDisciplineBalance] = useState(formatOptionalBalance(settings.disciplinedTrainingStartingBalanceBRL));
  const [stopBalance, setStopBalance] = useState(formatOptionalBalance(settings.stopTrainingStartingBalanceBRL));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWinCost(String(settings.costWinRoundTripBRL ?? settings.costPerContractRoundTripBRL));
    setWdoCost(String(settings.costWdoRoundTripBRL ?? settings.costPerContractRoundTripBRL));
    setSlippage(String(settings.slippageTicksPerSide));
    setIntrabarPolicy(settings.intrabarPolicy);
    setDisciplineBalance(formatOptionalBalance(settings.disciplinedTrainingStartingBalanceBRL));
    setStopBalance(formatOptionalBalance(settings.stopTrainingStartingBalanceBRL));
  }, [
    settings.costPerContractRoundTripBRL,
    settings.costWinRoundTripBRL,
    settings.costWdoRoundTripBRL,
    settings.slippageTicksPerSide,
    settings.intrabarPolicy,
    settings.disciplinedTrainingStartingBalanceBRL,
    settings.stopTrainingStartingBalanceBRL,
  ]);

  async function save() {
    const nextWinCost = Number(winCost);
    const nextWdoCost = Number(wdoCost);
    const nextSlippage = Number(slippage);

    if (!Number.isFinite(nextWinCost) || nextWinCost < 0) {
      setFeedback("O custo do WIN precisa ser maior ou igual a zero.");
      return;
    }
    if (!Number.isFinite(nextWdoCost) || nextWdoCost < 0) {
      setFeedback("O custo do WDO precisa ser maior ou igual a zero.");
      return;
    }
    if (!Number.isInteger(nextSlippage) || nextSlippage < 0) {
      setFeedback("O slippage precisa ser inteiro e maior ou igual a zero.");
      return;
    }

    let disciplinedCapital: number | null;
    let stopsCapital: number | null;
    try {
      disciplinedCapital = parseOptionalBalance(disciplineBalance, "Treino disciplinado");
      stopsCapital = parseOptionalBalance(stopBalance, "Treinamento de Stops");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Verifique os capitais informados.");
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const next = await saveExecutionSettings({
        costPerContractRoundTripBRL: nextWinCost,
        costWinRoundTripBRL: nextWinCost,
        costWdoRoundTripBRL: nextWdoCost,
        slippageTicksPerSide: nextSlippage,
        intrabarPolicy,
        disciplinedTrainingStartingBalanceBRL: disciplinedCapital,
        stopTrainingStartingBalanceBRL: stopsCapital,
      });
      onSaved(next);
      setFeedback("Configurações salvas.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="execution-settings card">
      <div className="section-heading">
        <h2>Execução simulada</h2>
      </div>

      <div className="execution-settings-grid">
        <label>
          WINFUT · custo por contrato (R$)
          <input type="number" min="0" step="0.01" value={winCost} onChange={(event) => setWinCost(event.target.value)} />
          <InfoTip label="Custo por operação completa">Informe o custo total estimado de ida e volta por contrato, não o custo de cada lado separadamente.</InfoTip>
        </label>
        <label>
          WDOFUT · custo por contrato (R$)
          <input type="number" min="0" step="0.01" value={wdoCost} onChange={(event) => setWdoCost(event.target.value)} />
          <small>Por operação completa.</small>
        </label>
        <label>
          Slippage por lado (ticks)
          <input type="number" min="0" step="1" value={slippage} onChange={(event) => setSlippage(event.target.value)} />
        </label>
        <label>
          Candle M2 ambíguo
          <select value={intrabarPolicy} onChange={(event) => setIntrabarPolicy(event.target.value as IntrabarPolicy)}>
            <option value="STOP_FIRST">Stop primeiro</option>
            <option value="TARGET_FIRST">Alvo primeiro</option>
          </select>
        </label>
      </div>

      <div className="execution-settings-capitals">
        <div className="capital-heading">
          <h3>Capital dos treinamentos</h3>
          <InfoTip label="Como o capital é usado">Informe uma vez; os valores serão usados nos próximos treinos. Cada modalidade mantém seu próprio saldo inicial.</InfoTip>
        </div>
        <div className="execution-settings-grid">
          <label>
            Treino disciplinado (R$)
            <input type="number" min="0.01" step="0.01" value={disciplineBalance} onChange={(event) => setDisciplineBalance(event.target.value)} placeholder="Não configurado" />
          </label>
          <label>
            Treinamento de Stops (R$)
            <input type="number" min="0.01" step="0.01" value={stopBalance} onChange={(event) => setStopBalance(event.target.value)} placeholder="Não configurado" />
          </label>
        </div>
      </div>

      <div className="cost-source-help">
        <InfoTip label="Referências de custos e tarifas">
          Os custos são valores de referência aproximados. Confira sua nota de corretagem e ajuste os valores.{" "}
          <a href={COST_REFERENCE_URL} target="_blank" rel="noreferrer">Referência B3</a> ·{" "}
          <a href={WIN_TARIFF_URL} target="_blank" rel="noreferrer">Tarifas WIN</a> ·{" "}
          <a href={WDO_TARIFF_URL} target="_blank" rel="noreferrer">Tarifas WDO</a>.
        </InfoTip>
      </div>

      <div className="execution-settings-actions">
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
      {feedback && <div className="data-status">{feedback}</div>}
    </section>
  );
}
