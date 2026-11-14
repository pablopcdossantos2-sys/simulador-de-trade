import { useMemo, useState } from "react";
import {
  calculateSimulationPlan,
  DEFAULT_TIMEFRAME_MINUTES,
  type SimulationPlan,
} from "../domain/simulationPlan";
import type { Asset } from "../types";

interface Props {
  onPlanChange?: (plan: SimulationPlan) => void | Promise<void>;
  disabled?: boolean;
}

function brDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function SimulationPlanner({ onPlanChange, disabled = false }: Props) {
  const [asset, setAsset] = useState<Asset>("WINFUT");
  const [date, setDate] = useState("2026-10-14");
  const timeframeMinutes = DEFAULT_TIMEFRAME_MINUTES;

  const result = useMemo(() => {
    try {
      return {
        plan: calculateSimulationPlan({ asset, date, timeframeMinutes }),
        error: null,
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [asset, date]);

  function applyPlan() {
    if (disabled || !result.plan) return;
    void onPlanChange?.(result.plan);
  }

  return (
    <section className="simulation-planner card">
      <div className="section-heading">
        <h2>Planejar simulação</h2>
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
              <small>{result.plan.visibleBars.toLocaleString("pt-BR")} candles M{result.plan.timeframeMinutes}</small>
            </div>
            <div>
              <span>Histórico anterior</span>
              <strong>{result.plan.warmupBars.toLocaleString("pt-BR")} candles</strong>
              <small>Ocultos durante o treino para estabilizar a MME 52</small>
            </div>
          </div>

          {result.plan.contractWarning && (
            <p className="planner-warning planner-warning-critical">
              {result.plan.contractWarning}
            </p>
          )}

          <button
            type="button"
            className="planner-apply"
            onClick={applyPlan}
            disabled={disabled}
          >
            Usar pregão completo
          </button>
        </div>
      )}
    </section>
  );
}
