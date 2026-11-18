import { useEffect, useState } from "react";
import { readErrorMessage } from "../services/readErrorMessage";
import { InfoTip } from "./InfoTip";
import { saveExecutionSettings } from "../services/executionSettings";
import { loadSignalAlertSettings, saveSignalAlertSettings } from "../services/signalAlerts";
import type { ExecutionSettings, IntrabarPolicy } from "../types";

interface Props {
  settings: ExecutionSettings;
  cloudOpacity: number;
  onCloudOpacitySaved: (value: number) => void;
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

export function ExecutionSettingsPanel({ settings, cloudOpacity, onCloudOpacitySaved, onSaved }: Props) {
  const [cloudOpacityPercent, setCloudOpacityPercent] = useState(String(Math.round(cloudOpacity * 100)));
  const [winCost, setWinCost] = useState(String(settings.costWinRoundTripBRL ?? settings.costPerContractRoundTripBRL));
  const [wdoCost, setWdoCost] = useState(String(settings.costWdoRoundTripBRL ?? settings.costPerContractRoundTripBRL));
  const [slippage, setSlippage] = useState(String(settings.slippageTicksPerSide));
  const [intrabarPolicy, setIntrabarPolicy] = useState<IntrabarPolicy>(settings.intrabarPolicy);
  const [disciplineBalance, setDisciplineBalance] = useState(formatOptionalBalance(settings.disciplinedTrainingStartingBalanceBRL));
  const [signalAlerts, setSignalAlerts] = useState(loadSignalAlertSettings);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWinCost(String(settings.costWinRoundTripBRL ?? settings.costPerContractRoundTripBRL));
    setWdoCost(String(settings.costWdoRoundTripBRL ?? settings.costPerContractRoundTripBRL));
    setSlippage(String(settings.slippageTicksPerSide));
    setIntrabarPolicy(settings.intrabarPolicy);
    setDisciplineBalance(formatOptionalBalance(settings.disciplinedTrainingStartingBalanceBRL));
  }, [
    settings.costPerContractRoundTripBRL,
    settings.costWinRoundTripBRL,
    settings.costWdoRoundTripBRL,
    settings.slippageTicksPerSide,
    settings.intrabarPolicy,
    settings.disciplinedTrainingStartingBalanceBRL,
  ]);

  useEffect(() => {
    setCloudOpacityPercent(String(Math.round(cloudOpacity * 100)));
  }, [cloudOpacity]);

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
    try {
      disciplinedCapital = parseOptionalBalance(disciplineBalance, "Treino disciplinado");
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
      });
      onSaved(next);
      const opacity = Math.max(0, Math.min(100, Number(cloudOpacityPercent))) / 100;
      onCloudOpacitySaved(opacity);
      setFeedback("Configurações salvas.");
    } catch (error) {
      setFeedback(readErrorMessage(error, "Não foi possível salvar as configurações."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="execution-settings card">
      <div className="section-heading">
        <div className="section-title-with-help">
          <h2>Execução simulada</h2>
          <InfoTip label="Custos por operação e referências">
            Informe o custo estimado de ida e volta por contrato, não o custo de cada lado separadamente. Confira sua nota de corretagem e ajuste os valores de referência.{" "}
            <a href={COST_REFERENCE_URL} target="_blank" rel="noreferrer">Referência B3</a> ·{" "}
            <a href={WIN_TARIFF_URL} target="_blank" rel="noreferrer">Tarifas WIN</a> ·{" "}
            <a href={WDO_TARIFF_URL} target="_blank" rel="noreferrer">Tarifas WDO</a>.
          </InfoTip>
        </div>
      </div>

      <div className="execution-settings-grid">
        <label>
          WINFUT · custo por contrato (R$)
          <input type="number" min="0" step="0.01" value={winCost} onChange={(event) => setWinCost(event.target.value)} />
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
          Candle M2 ambíguo (sem sequência de negócios)
          <select value={intrabarPolicy} onChange={(event) => setIntrabarPolicy(event.target.value as IntrabarPolicy)}>
            <option value="STOP_FIRST">Stop primeiro</option>
            <option value="TARGET_FIRST">Alvo primeiro</option>
          </select>
          <small>
            Esta preferência só resolve candles OHLC que atingem Stop e Alvo no mesmo intervalo.
            No replay negócio a negócio, vale o primeiro nível efetivamente atingido na sequência histórica.
          </small>
        </label>
      </div>

      <div className="execution-settings-capitals">
        <div className="capital-heading">
          <h3>Visualização do gráfico</h3>
          <InfoTip label="Opacidade da confluência">Ajuste a intensidade da área verde ou vermelha entre as médias quando houver confluência. O valor não altera os cálculos do indicador.</InfoTip>
        </div>
        <label className="cloud-opacity-control">
          Opacidade da área de confluência
          <div className="cloud-opacity-input">
            <input type="range" min="0" max="100" step="5" value={cloudOpacityPercent} onChange={(event) => setCloudOpacityPercent(event.target.value)} />
            <output>{cloudOpacityPercent}%</output>
          </div>
        </label>
      </div>

      <div className="execution-settings-capitals">
        <div className="capital-heading">
          <h3>Capital do treino disciplinado</h3>
          <InfoTip label="Como o capital é usado">Informe o saldo inicial que será utilizado nos próximos treinos disciplinados. Deixe em branco se não quiser registrar um saldo inicial.</InfoTip>
        </div>
        <div className="execution-settings-grid">
          <label>
            Saldo inicial (R$)
            <input type="number" min="0.01" step="0.01" value={disciplineBalance} onChange={(event) => setDisciplineBalance(event.target.value)} placeholder="Não configurado" />
          </label>
        </div>
      </div>

      <div className="execution-settings-capitals">
        <div className="capital-heading">
          <h3>Alertas sonoros de sinais</h3>
          <InfoTip label="Como funcionam os alertas">Os dois sistemas usam um som ascendente para a área de compra e um descendente para a área de venda. No Sistema 01, os sons também indicam sinais e reentradas. Você pode ativar cada direção separadamente.</InfoTip>
        </div>
        <div className="signal-alert-options">
          <label>
            <input
              type="checkbox"
              checked={signalAlerts.buyEnabled}
              onChange={(event) => {
                const next = { ...signalAlerts, buyEnabled: event.target.checked };
                setSignalAlerts(next);
                saveSignalAlertSettings(next);
              }}
            />
            Som para sinal de compra
          </label>
          <label>
            <input
              type="checkbox"
              checked={signalAlerts.sellEnabled}
              onChange={(event) => {
                const next = { ...signalAlerts, sellEnabled: event.target.checked };
                setSignalAlerts(next);
                saveSignalAlertSettings(next);
              }}
            />
            Som para sinal de venda
          </label>
        </div>
        <small>Os sons são emitidos quando um novo sinal é confirmado durante a simulação ou replay.</small>
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
