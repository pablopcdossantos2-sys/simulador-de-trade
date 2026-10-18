import { useEffect, useState } from "react";
import { saveExecutionSettings } from "../services/executionSettings";
import type { ExecutionSettings, IntrabarPolicy } from "../types";

interface Props { settings: ExecutionSettings; onSaved: (settings: ExecutionSettings) => void; }

const COST_REFERENCE_URL = "https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/day-trade/conheca-as-caracteristicas-dos-principais-produtos-de-day-trade/";
const WIN_TARIFF_URL = "https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-ibovespa-e-indice-brasil-50/futuros-e-estruturadas/";
const WDO_TARIFF_URL = "https://b3.com.br/main.jsp?doui_processActionId=setLocaleProcessAction&locale=pt_BR&lumA=1&lumII=8A80CB816340383D4F50DA&lumPageId=8A68812D556EB21301556F5951D27D3C";

export function ExecutionSettingsPanel({ settings, onSaved }: Props) {
  const [winCost, setWinCost] = useState(String(settings.costWinRoundTripBRL ?? settings.costPerContractRoundTripBRL));
  const [wdoCost, setWdoCost] = useState(String(settings.costWdoRoundTripBRL ?? settings.costPerContractRoundTripBRL));
  const [slippage, setSlippage] = useState(String(settings.slippageTicksPerSide));
  const [intrabarPolicy, setIntrabarPolicy] = useState<IntrabarPolicy>(settings.intrabarPolicy);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWinCost(String(settings.costWinRoundTripBRL ?? settings.costPerContractRoundTripBRL));
    setWdoCost(String(settings.costWdoRoundTripBRL ?? settings.costPerContractRoundTripBRL));
    setSlippage(String(settings.slippageTicksPerSide));
    setIntrabarPolicy(settings.intrabarPolicy);
  }, [settings.costPerContractRoundTripBRL, settings.costWinRoundTripBRL, settings.costWdoRoundTripBRL, settings.slippageTicksPerSide, settings.intrabarPolicy]);

  async function save() {
    const nextWinCost = Number(winCost);
    const nextWdoCost = Number(wdoCost);
    const nextSlippage = Number(slippage);
    if (!Number.isFinite(nextWinCost) || nextWinCost < 0) {
      setFeedback("O custo do WIN precisa ser um valor maior ou igual a zero.");
      return;
    }
    if (!Number.isFinite(nextWdoCost) || nextWdoCost < 0) {
      setFeedback("O custo do WDO precisa ser um valor maior ou igual a zero.");
      return;
    }
    if (!Number.isInteger(nextSlippage) || nextSlippage < 0) {
      setFeedback("O slippage precisa ser uma quantidade inteira de ticks maior ou igual a zero.");
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
      });
      onSaved(next);
      setFeedback("Configurações de execução salvas.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="execution-settings card">
      <div className="section-heading">
        <div><p className="eyebrow">Ajustes antes do treino</p><h2>Execução simulada</h2></div>
        <span className="history-count">snapshot por trade</span>
      </div>
      <p className="data-description">
        Defina os custos e o slippage usados nas próximas operações. Cada trade preserva
        os valores ativos no momento da entrada, mesmo que você altere estas configurações depois.
      </p>

      <div className="execution-settings-grid">
        <label>
          WINFUT · custo por contrato · round trip (R$)
          <input type="number" min="0" step="0.01" value={winCost} onChange={(event) => setWinCost(event.target.value)} />
          <small>Referência inicial: R$ 0,50 por contrato.</small>
        </label>
        <label>
          WDOFUT · custo por contrato · round trip (R$)
          <input type="number" min="0" step="0.01" value={wdoCost} onChange={(event) => setWdoCost(event.target.value)} />
          <small>Referência inicial: R$ 2,12 por contrato.</small>
        </label>
        <label>
          Slippage por lado (ticks)
          <input type="number" min="0" step="1" value={slippage} onChange={(event) => setSlippage(event.target.value)} />
          <small>Aplicado adversamente na entrada e na saída. Padrão: 0 tick.</small>
        </label>
        <label>
          Ambiguidade intrabar (OHLC)
          <select value={intrabarPolicy} onChange={(event) => setIntrabarPolicy(event.target.value as IntrabarPolicy)}>
            <option value="STOP_FIRST">Conservadora · Stop primeiro</option>
            <option value="TARGET_FIRST">Otimista · Alvo primeiro</option>
          </select>
          <small>Só vale quando um candle agregado toca Stop e Alvo sem sequência intrabar. Replay negócio a negócio usa a ordem real.</small>
        </label>
      </div>

      <p className="cost-source-note">
        Valores aproximados de referência para emolumentos e tarifas B3 no day trade, encontrados
        no material educacional da B3 publicado em 22/10/2025. Não representam tarifa garantida nem
        incluem necessariamente a corretagem da sua instituição; confirme os valores na nota de
        corretagem e edite os campos conforme seu caso. Fontes:{" "}
        <a href={COST_REFERENCE_URL} target="_blank" rel="noreferrer">referência educacional da B3</a>
        {" · "}
        <a href={WIN_TARIFF_URL} target="_blank" rel="noreferrer">tarifas oficiais do WIN</a>
        {" · "}
        <a href={WDO_TARIFF_URL} target="_blank" rel="noreferrer">tarifas oficiais do WDO</a>.
      </p>

      <div className="execution-settings-actions">
        <button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</button>
        <span>O custo é aplicado por contrato na operação completa (entrada e saída). O slippage altera os preços executados; a política intrabar só resolve candles agregados ambíguos.</span>
      </div>
      {feedback && <div className="data-status">{feedback}</div>}
    </section>
  );
}
