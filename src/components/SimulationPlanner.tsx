import { useMemo, useState } from "react";
import {
  calculateSimulationPlan,
  DEFAULT_TIMEFRAME_MINUTES,
  SUPPORTED_TIMEFRAMES_MINUTES,
  type SimulationPlan,
  type WarmupPolicy,
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

export function SimulationPlanner({
  onPlanChange,
  disabled = false,
}: Props) {
  const [asset, setAsset] = useState<Asset>("WINFUT");
  const [date, setDate] = useState("2026-10-14");
  const [timeframeMinutes, setTimeframeMinutes] =
    useState(DEFAULT_TIMEFRAME_MINUTES);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [warmupPolicy, setWarmupPolicy] =
    useState<WarmupPolicy>("STANDARD");

  const result = useMemo(() => {
    try {
      return {
        plan: calculateSimulationPlan({
          asset,
          date,
          timeframeMinutes,
          startTime,
          endTime,
          warmupPolicy,
        }),
        error: null,
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [asset, date, timeframeMinutes, startTime, endTime, warmupPolicy]);

  function applyPlan() {
    if (disabled || !result.plan) return;
    void onPlanChange?.(result.plan);
  }

  return (
    <section className="simulation-planner card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Etapa 1 · Defina o pregão</p>
          <h2>Planejar simulação</h2>
        </div>
        <span className="session-window">
          M{timeframeMinutes} · {timeframeMinutes} minutos
        </span>
      </div>

      <p className="data-description">
        {disabled
          ? "O plano fica bloqueado enquanto há uma sessão ou posição ativa. Encerre o treino antes de alterá-lo."
          : "Defina primeiro o pregão que deseja treinar. O sistema calcula a janela visível e o histórico anterior necessário para aquecer o indicador sem revelar esses dados ao trader durante a simulação."}
      </p>


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

        <label>
          Timeframe
          <select
            value={timeframeMinutes}
            disabled={disabled}
            onChange={(event) =>
              setTimeframeMinutes(Number(event.target.value))
            }
          >
            {SUPPORTED_TIMEFRAMES_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                M{minutes} · {minutes} minutos
              </option>
            ))}
          </select>
        </label>

        <label>
          Início visível
          <input
            type="time"
            value={startTime}
            disabled={disabled}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>

        <label>
          Final visível
          <input
            type="time"
            value={endTime}
            disabled={disabled}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </label>

        <label>
          Aquecimento
          <select
            value={warmupPolicy}
            disabled={disabled}
            onChange={(event) => setWarmupPolicy(event.target.value as WarmupPolicy)}
          >
            <option value="STANDARD">Padrão · 5× MME 52</option>
            <option value="STRICT">Estrito · 10× MME 52</option>
          </select>
        </label>
      </div>

      {result.error && <div className="data-status error">{result.error}</div>}

      {result.plan && (
        <div className="planner-result">
          <div className="planner-summary">
            <div>
              <span>Período visível</span>
              <strong>
                {brDate(result.plan.targetDate)} · {result.plan.targetStartTime}–{result.plan.targetEndTime}
              </strong>
              <small>{result.plan.visibleBars} candles M{result.plan.timeframeMinutes}</small>
            </div>
            <div>
              <span>Aquecimento oculto</span>
              <strong>{result.plan.warmupBars} candles</strong>
              <small>{Math.floor(result.plan.warmupMinutes / 60)}h {result.plan.warmupMinutes % 60}min de barras M{result.plan.timeframeMinutes}</small>
            </div>
          </div>

          <div className="planner-options">
            <article>
              <strong>Opção recomendada · pregão anterior completo</strong>
              <p>
                Colete {result.plan.fullSessionsNeeded === 1 ? "o pregão" : "os pregões"}{" "}
                {result.plan.fullSessionPreviousDates.map(brDate).join(", ")} entre 09:00 e{" "}
                {result.plan.fullSessionEnd}. Isso fornece aproximadamente{" "}
                {result.plan.fullSessionBars} candles M{result.plan.timeframeMinutes} para aquecimento.
              </p>
            </article>

            <article>
              <strong>Se você só tiver a mesma faixa horária</strong>
              <p>
                Serão necessárias {result.plan.sameWindowSessionsNeeded} sessões anteriores:{" "}
                {result.plan.sameWindowPreviousDates.map(brDate).join(", ")}, sempre na faixa{" "}
                {result.plan.targetStartTime}–{result.plan.targetEndTime}.
              </p>
            </article>
          </div>

          <p className="planner-warning">
            A MME é recursiva. O aquecimento padrão reduz fortemente a influência
            da inicialização, mas não é uma promessa de igualdade matemática absoluta
            com todo o histórico disponível no TradingView.
          </p>

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
            Usar estes horários no tratamento
          </button>
        </div>
      )}
    </section>
  );
}
