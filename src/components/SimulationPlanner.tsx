import { useEffect, useMemo, useState } from "react";
import {
  calculateSimulationPlan,
  DEFAULT_TIMEFRAME_MINUTES,
  type SimulationPlan,
} from "../domain/simulationPlan";
import type { Asset, MovingAverageSettings, TradingStrategyId } from "../types";

interface Props {
  onPlanChange?: (plan: SimulationPlan | null) => void | Promise<void>;
  strategyId?: TradingStrategyId;
  movingAverages?: MovingAverageSettings;
  disabled?: boolean;
  request?: { asset: Asset; date: string } | null;
}

function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function brDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function SimulationPlanner({
  onPlanChange, strategyId = "MULTI_MEDIAS", movingAverages, disabled = false,
  request,
}: Props) {
  const [asset, setAsset] = useState<Asset>(request?.asset ?? "WINFUT");
  const [date, setDate] = useState(request?.date ?? currentLocalDate);
  useEffect(() => {
    if (request) {
      setAsset(request.asset);
      setDate(request.date);
    }
  }, [request]);
  const timeframeMinutes = DEFAULT_TIMEFRAME_MINUTES;

  const result = useMemo(() => {
    try {
      return {
        plan: calculateSimulationPlan({ asset, date, timeframeMinutes, strategyId, movingAverages }),
        error: null,
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [asset, date, strategyId, movingAverages]);

  useEffect(() => {
    void onPlanChange?.(result.plan);
  }, [onPlanChange, result.plan]);

  return (
    <section className="simulation-planner card">
      <p className="data-description">Escolha o ativo e o dia que deseja preparar. Esta verificação encontra também os pregões anteriores exigidos para aquecer os indicadores da estratégia atualmente selecionada.</p>
      <div className="section-heading">
        <h2>Verificar arquivos necessários ao pregão</h2>
        <span className="session-window">Pregão completo · M{timeframeMinutes}</span>
      </div>

      <div className="planner-grid">
        <label>
          Ativo
          <select
            value={asset}
            disabled={disabled}
            onChange={(event) => setAsset(event.target.value as Asset)}
          >
            <option value="WINFUT">WINFUT</option>
            <option value="WDOFUT">WDOFUT</option>
          </select>
        </label>

        <label>
          Data do pregão
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

      </div>

      {result.error && <div className="data-status error">{result.error}</div>}

      {result.plan && (
        <div className="planner-result">
          <div className="planner-summary">
            <div>
              <span>Pregão</span>
              <strong>{brDate(result.plan.targetDate)} · {result.plan.targetStartTime}–{result.plan.targetEndTime}</strong>
              <small>Até {result.plan.visibleBars.toLocaleString("pt-BR")} intervalos M{result.plan.timeframeMinutes}; somente candles existentes serão reproduzidos.</small>
            </div>
            <div>
              <span>Histórico anterior</span>
              <strong>{result.plan.warmupBars.toLocaleString("pt-BR")} candles</strong>
              <small>{strategyId === "MTF_ANGULACAO"
                ? "Histórico M2 oculto para aquecer as médias M15, ATR e TPV de 50 períodos"
                : `Ocultos durante o treino para estabilizar a MME ${movingAverages?.multiMedias.emaSlowLength ?? 52}`}</small>
            </div>
          </div>

          {result.plan.contractWarning && (
            <p className="planner-warning planner-warning-critical">
              {result.plan.contractWarning}
            </p>
          )}

        </div>
      )}
    </section>
  );
}
