import { useMemo, useState } from "react";
import type { Asset, MovingAverageSettings, TradingStrategyId } from "../types";
import type { ReplayCatalogEntry } from "../services/replayCatalog";
import type { SimulationPlan } from "../domain/simulationPlan";
import type { ReplaySessionInfo } from "../services/replayData";
import { replayChoiceForDate, replayChoicesFromCatalog } from "../domain/replayChoices";
import { InfoTip } from "./InfoTip";

interface Props {
  entries: ReplayCatalogEntry[];
  loading: boolean;
  error: string | null;
  strategyId: TradingStrategyId;
  settings: MovingAverageSettings;
  currentPlan: SimulationPlan | null;
  disabled: boolean;
  busy: boolean;
  loadedReplay: boolean;
  session?: ReplaySessionInfo | null;
  onLoad: (plan: SimulationPlan) => void | Promise<void>;
  onPrepare: (asset: Asset, date: string) => void;
  onRefresh: () => void;
}

function brDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

export function ReplaySelectionPanel({
  entries, loading, error, strategyId, settings, currentPlan,
  disabled, busy, loadedReplay, session, onLoad, onPrepare, onRefresh,
}: Props) {
  const choices = useMemo(
    () => replayChoicesFromCatalog(entries, strategyId, settings),
    [entries, strategyId, settings],
  );
  const [selectedKey, setSelectedKey] = useState("");
  const [searchAsset, setSearchAsset] = useState<Asset>("WINFUT");
  const [searchDate, setSearchDate] = useState("");
  const chosen = choices.find((item) => `${item.asset}|${item.date}` === selectedKey);
  const choice = searchDate
    ? replayChoiceForDate(entries, searchAsset, searchDate, strategyId, settings)
    : chosen ?? null;
  const sameAsLoaded = Boolean(choice && loadedReplay && currentPlan &&
    choice.asset === currentPlan.asset && choice.date === currentPlan.targetDate);
  const selectedActive = currentPlan && replayChoiceForDate(
    entries, currentPlan.asset, currentPlan.targetDate, strategyId, settings,
  );

  function chooseCatalog(key: string) {
    setSelectedKey(key);
    setSearchDate("");
    const item = choices.find((candidate) => `${candidate.asset}|${candidate.date}` === key);
    if (item) setSearchAsset(item.asset);
  }

  return (
    <section className="replay-selection-panel card" aria-label="Escolher um replay pronto para treinar">
      <div className="section-heading">
        <div className="section-title-with-help">
          <h2>Selecionar e carregar replay</h2>
          <InfoTip label="Como escolher um replay">
            Os arquivos CSV e os replays são preparados em Pregões e replays. Aqui você
            escolhe um pregão catalogado e clica em Carregar replay. Em uma só
            operação, o sistema verifica o histórico anterior necessário para
            os indicadores e a compatibilidade do contrato, e abre o replay.
          </InfoTip>
        </div>
        <button type="button" className="catalog-refresh" onClick={onRefresh}
          disabled={disabled || loading}>Atualizar lista</button>
      </div>
      {error && <div className="data-status error" role="alert">{error}</div>}
      <div className="available-replays-summary">
        <div><span>Pregões catalogados</span><strong>{choices.length}</strong></div>
        <div><span>Prontos para esta estratégia</span><strong>{choices.filter((item) => item.ready).length}</strong></div>
      </div>
      <p className="data-description">
        Escolha um replay pronto ou consulte um dia específico. Clique apenas
        em Carregar replay; os indicadores e o histórico são preparados automaticamente.
      </p>
      <div className="replay-selection-fields">
        <label>Replays preparados
          <select value={searchDate ? "" : selectedKey} disabled={disabled || loading}
            onChange={(event) => chooseCatalog(event.target.value)}>
            <option value="">Selecione um pregão do catálogo</option>
            {choices.map((item) => (
              <option key={`${item.asset}|${item.date}`} value={`${item.asset}|${item.date}`}>
                {item.asset} · {brDate(item.date)} · {item.ready ? "Pronto para treino" : item.targetReady ? "Falta histórico prévio" : "Replay indisponível/incompleto"}
              </option>
            ))}
          </select>
        </label>
        <label>Consultar outro dia
          <input type="date" value={searchDate} disabled={disabled || loading}
            onChange={(event) => { setSearchDate(event.target.value); setSelectedKey(""); }} />
        </label>
        <label>Ativo da consulta
          <select value={searchAsset} disabled={disabled || loading}
            onChange={(event) => { setSearchAsset(event.target.value as Asset); setSelectedKey(""); }}>
            <option value="WINFUT">WINFUT</option>
            <option value="WDOFUT">WDOFUT</option>
          </select>
        </label>
      </div>

      {!loading && choices.length === 0 && !choice && (
        <div className="replay-selection-notice" role="status">
          <strong>Nenhum pregão pronto para seleção.</strong>
          <p>Vá até Pregões e replays para importar os CSVs e criar os arquivos de replay.</p>
          <button type="button" onClick={() => onPrepare(searchAsset, searchDate)}
            disabled={disabled}>Ir para Pregões e replays</button>
        </div>
      )}
      {choice?.error && <div className="data-status error" role="status">{choice.error}</div>}
      {choice && !choice.error && (
        <div className={`replay-selection-notice ${choice.ready ? "ready" : "missing"}`} role="status">
          <strong>{sameAsLoaded
            ? `Replay de ${brDate(choice.date)} carregado`
            : choice.ready
              ? `Replay de ${brDate(choice.date)} pronto para carregar`
            : !choice.targetReady
              ? `Não há replay válido de ${brDate(choice.date)} para ${choice.asset}`
              : "O replay existe, mas falta histórico para os indicadores"}</strong>
          <p>{sameAsLoaded
            ? "O replay está aberto e os indicadores foram aquecidos. Escolha o modo e inicie o treino no painel abaixo."
            : choice.ready
              ? `Pregão e histórico necessários catalogados · ${choice.plan?.warmupBars} candles M2 de aquecimento previstos.`
            : "Acesse Pregões e replays para importar os CSVs, gerar os arquivos necessários e completar o histórico antes da simulação."}</p>
          {!choice.ready && choice.missing.length > 0 && (
            <div className="replay-selection-requirements">
              <small>Arquivos pendentes ou incompatíveis:</small>
              {choice.missing.map((item) => (
                <span key={`${item.requirement.role}-${item.requirement.date}`}>
                  {item.requirement.role === "TARGET" ? "Pregão" : "Aquecimento"} {brDate(item.requirement.date)}
                  {item.status === "CONTRACT_MISMATCH" ? " · contrato incompatível" :
                    item.status === "INCOMPLETE" ? " · dados/metadados inválidos" : " · arquivo ausente"}
                </span>
              ))}
            </div>
          )}
          <div className="replay-selection-actions">
            {choice.ready && choice.plan && (
              <button type="button" className="planner-apply"
                disabled={disabled || busy || sameAsLoaded}
                onClick={() => void onLoad(choice.plan!)}>
                {busy ? "Carregando replay..." : sameAsLoaded ? "Replay carregado" : "Carregar replay"}
              </button>
            )}
            {!choice.ready && (
              <button type="button" onClick={() => onPrepare(choice.asset, choice.date)}
                disabled={disabled}>Preparar arquivos em Pregões e replays</button>
            )}
          </div>
        </div>
      )}
      {currentPlan && loadedReplay && (!choice || !sameAsLoaded) && (
        <p className="replay-selection-current">
          Replay atualmente carregado: <strong>{currentPlan.asset} · {brDate(currentPlan.targetDate)}</strong>.
          {selectedActive && !selectedActive.ready ? " Verifique os arquivos antes do próximo treino." : ""}
        </p>
      )}
      {loadedReplay && session && (
        <p className="replay-session-note" role="status">
          <strong>{session.symbol}</strong> · {session.asset} · {session.mode === "TICK_LEGACY"
            ? "Negócios históricos tick a tick"
            : session.mode === "CANDLES_M1_SYNTHETIC"
              ? "Replay sintético M1"
              : "Replay sintético M2"}.
          {session.synthetic ? " Os preços intrabar são simulados, não ticks históricos." : ""}
        </p>
      )}
      {choice && !choice.ready && choice.targetReady && (
        <small className="training-hint">O histórico de aquecimento depende da estratégia e das médias configuradas.</small>
      )}
    </section>
  );
}
