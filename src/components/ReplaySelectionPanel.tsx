import { useMemo, useState } from "react";
import type { Asset, MovingAverageSettings, TradingStrategyId } from "../types";
import type { ReplayCatalogEntry } from "../services/replayCatalog";
import type { SimulationPlan } from "../domain/simulationPlan";
import type { ReplaySessionInfo } from "../services/replayData";
import { replayChoiceForDate, replayChoicesFromCatalog, type ReplayChoice } from "../domain/replayChoices";
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
  session: ReplaySessionInfo | null;
  onLoad: (plan: SimulationPlan) => Promise<string | null>;
  onPrepare: (asset: Asset, date: string) => void;
  onRefresh: () => void;
}

function brDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

export function ReplaySelectionPanel({
  entries, loading, error, strategyId, settings, currentPlan,
  disabled, busy, session, onLoad, onPrepare, onRefresh,
}: Props) {
  const choices = useMemo(
    () => replayChoicesFromCatalog(entries, strategyId, settings),
    [entries, strategyId, settings],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [searchAsset, setSearchAsset] = useState<Asset>("WINFUT");
  const [searchDate, setSearchDate] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedKey = session && currentPlan ? `${currentPlan.asset}|${currentPlan.targetDate}` : "";
  const loadedChoice = choices.find((item) => `${item.asset}|${item.date}` === loadedKey);
  const chosen = selectedKey === null ? loadedChoice
    : choices.find((item) => `${item.asset}|${item.date}` === selectedKey);
  const choice = searchDate
    ? replayChoiceForDate(entries, searchAsset, searchDate, strategyId, settings)
    : chosen ?? null;
  const locked = disabled || loading || busy;
  // Um pregão que ficou pronto após atualizar o catálogo pode ser escolhido novamente.
  const catalogValue = searchDate || !chosen || (chosen.ready && selectedKey && !busy && !loadError)
    ? ""
    : selectedKey ?? loadedKey;

  async function loadChoice(item: ReplayChoice | undefined | null) {
    setLoadError(null);
    if (locked || error || !item?.ready || !item.plan || `${item.asset}|${item.date}` === loadedKey) return;
    const failure = await onLoad(item.plan);
    setLoadError(failure);
    if (!failure) setSelectedKey(null);
  }

  function chooseCatalog(key: string) {
    setSelectedKey(key === loadedKey ? null : key);
    setSearchDate("");
    const item = choices.find((candidate) => `${candidate.asset}|${candidate.date}` === key);
    if (item) setSearchAsset(item.asset);
    void loadChoice(item);
  }

  function consultDate(asset: Asset, date: string) {
    setSearchAsset(asset);
    setSearchDate(date);
    setSelectedKey("");
    void loadChoice(choices.find((item) => item.asset === asset && item.date === date));
  }

  return (
    <section className="replay-selection-panel card" aria-label="Escolher um replay pronto para treinar">
      <div className="section-heading">
        <div className="section-title-with-help">
          <h2>Selecionar replay disponível</h2>
          <InfoTip label="Como escolher um replay">
            Ao escolher um pregão pronto, o sistema verifica os arquivos e o histórico dos
            indicadores, e abre o replay. Prepare pregões e histórico em Pregões e replays.
          </InfoTip>
        </div>
        <button type="button" className="catalog-refresh" onClick={onRefresh}
          disabled={locked}>Atualizar lista</button>
      </div>
      {error && <div className="data-status error" role="alert">{error}</div>}
      <div className="available-replays-summary">
        <div><span>Pregões catalogados</span><strong>{choices.length}</strong></div>
        <div><span>Prontos para esta estratégia</span><strong>{choices.filter((item) => item.ready).length}</strong></div>
      </div>
      <div className="replay-selection-fields">
        <label>Replays preparados
          <select value={catalogValue} disabled={locked}
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
          <input type="date" value={searchDate} disabled={locked}
            onChange={(event) => consultDate(searchAsset, event.target.value)} />
        </label>
        <label>Ativo da consulta
          <select value={searchAsset} disabled={locked}
            onChange={(event) => consultDate(event.target.value as Asset, searchDate)}>
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
            disabled={locked}>Ir para Pregões e replays</button>
        </div>
      )}
      {choice?.error && <div className="data-status error" role="status">{choice.error}</div>}
      {choice && !choice.ready && !choice.error && (
        <div className="replay-selection-notice missing" role="status">
          <strong>{!choice.targetReady
            ? `Não há replay válido de ${brDate(choice.date)} para ${choice.asset}`
            : "O replay existe, mas falta histórico para os indicadores"}</strong>
          {choice.missing.length > 0 && (
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
          <button type="button" onClick={() => onPrepare(choice.asset, choice.date)}
            disabled={locked}>Preparar arquivos em Pregões e replays</button>
        </div>
      )}
      {loadError && choice?.ready && (
        <div className="replay-selection-notice">
          <p role="alert">{loadError}</p>
          <button type="button" onClick={() => void loadChoice(choice)} disabled={locked || Boolean(error)}>
            Tentar novamente
          </button>
        </div>
      )}
      {(busy || (session && currentPlan)) && (
        <p className="replay-selection-current" role="status">
          {busy ? "Carregando replay…" : session && currentPlan && (
            <>
              <strong>{loadedChoice?.ready ? "Replay pronto para treino" : "Replay carregado"}</strong>
              {` · ${session.asset} · ${brDate(currentPlan.targetDate)} · `}
              {session.mode === "TICK_LEGACY" ? "Negócios históricos tick a tick"
                : session.mode === "CANDLES_M1_SYNTHETIC" ? "Replay sintético M1" : "Replay sintético M2"}.
              {!loadedChoice?.ready && " Verifique os arquivos no catálogo para iniciar o treino."}
            </>
          )}
        </p>
      )}
      {choice && !choice.ready && choice.targetReady && (
        <small className="training-hint">O histórico de aquecimento depende da estratégia e das médias configuradas.</small>
      )}
    </section>
  );
}
