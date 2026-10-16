import type {
  TrainingSession,
  TrainingSummary,
} from "../types";

interface Props {
  session: TrainingSession | null;
  summary: TrainingSummary | null;
  canStart: boolean;
  replayLoaded: boolean;
  onStart: () => void;
  onEnd: () => void;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function TrainingSessionPanel({
  session,
  summary,
  canStart,
  replayLoaded,
  onStart,
  onEnd,
}: Props) {
  const active = session?.status === "ACTIVE";

  return (
    <section className="training-session-panel card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sessão formal</p>
          <h2>Treino disciplinado</h2>
        </div>
        <span
          className={`training-status ${active ? "active" : session ? "ended" : ""}`}
        >
          {active ? "Em andamento" : session ? "Encerrado" : "Não iniciado"}
        </span>
      </div>

      {!session && (
        <p className="data-description">
          Carregue um replay válido e inicie a sessão antes de operar. A partir
          desse momento, tentativas bloqueadas, operações e sinais ignorados
          passam a ser registrados.
        </p>
      )}

      {session && (
        <div className="training-kpis">
          <div>
            <span>Pregão</span>
            <strong>{session.tradeDate}</strong>
          </div>
          <div>
            <span>Janela</span>
            <strong>
              {session.startTime}–{session.endTime}
            </strong>
          </div>
          <div>
            <span>Timeframe</span>
            <strong>{session.timeframeMinutes} min</strong>
          </div>
          <div>
            <span>Aquecimento</span>
            <strong>{session.warmupBars} candles</strong>
          </div>
        </div>
      )}

      <div className="training-actions">
        {!active ? (
          <button
            type="button"
            className="training-start"
            onClick={onStart}
            disabled={!canStart || !replayLoaded}
          >
            Iniciar treino
          </button>
        ) : (
          <button
            type="button"
            className="training-end"
            onClick={onEnd}
          >
            Encerrar treino
          </button>
        )}
      </div>

      {!replayLoaded && (
        <small className="training-hint">
          O replay do pregão-alvo precisa estar carregado antes do início.
        </small>
      )}

      {summary && (
        <div className="training-summary">
          <div>
            <span>Operações abertas</span>
            <strong>{summary.tradesExecuted}</strong>
          </div>
          <div>
            <span>Tentativas bloqueadas</span>
            <strong>{summary.blockedAttempts}</strong>
          </div>
          <div>
            <span>Sinais ignorados</span>
            <strong>{summary.ignoredSignals}</strong>
          </div>
          <div>
            <span>Aderência às tentativas</span>
            <strong>{formatPct(summary.executionAdherencePct)}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
