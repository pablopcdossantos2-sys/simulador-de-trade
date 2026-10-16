import type {
  TrainingEvent,
  TrainingSession,
  TrainingSummary,
} from "../types";

interface Props {
  session: TrainingSession | null;
  summary: TrainingSummary | null;
  events: TrainingEvent[];
  canStart: boolean;
  replayLoaded: boolean;
  onStart: () => void;
  onEnd: () => void;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function eventLabel(event: TrainingEvent): string {
  switch (event.type) {
    case "SESSION_STARTED":
      return "Sessão iniciada";
    case "SESSION_ENDED":
      return "Sessão encerrada";
    case "BLOCKED_ATTEMPT":
      return "Tentativa bloqueada";
    case "SIGNAL_IGNORED":
      return "Sinal ignorado";
    case "TRADE_OPENED":
      return "Operação aberta";
    case "TRADE_CLOSED":
      return "Operação encerrada";
    case "TECHNICAL_ISSUE":
      return "Problema técnico";
  }
}

function eventDetail(event: TrainingEvent): string {
  if (event.type === "BLOCKED_ATTEMPT") {
    return event.reason ?? "Entrada recusada pelas regras.";
  }

  if (event.type === "SIGNAL_IGNORED") {
    return `${event.side === "BUY" ? "Compra" : "Venda"} · sinal não utilizado`;
  }

  if (event.type === "TRADE_OPENED") {
    return `${event.side === "BUY" ? "Compra" : "Venda"} · entrada válida`;
  }

  if (event.type === "TRADE_CLOSED") {
    return event.reason === "TARGET" ? "Alvo atingido" : "Stop atingido";
  }

  if (event.type === "TECHNICAL_ISSUE") {
    return event.reason ?? "Falha técnica registrada pelo simulador.";
  }

  return event.marketTimestamp
    ? `Mercado: ${event.marketTimestamp}`
    : "Evento da sessão";
}

function marketClock(value: string | null): string {
  if (!value) return "—";
  const match = value.match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? value;
}

export function TrainingSessionPanel({
  session,
  summary,
  events,
  canStart,
  replayLoaded,
  onStart,
  onEnd,
}: Props) {
  const active = session?.status === "ACTIVE";
  const relevantEvents = session
    ? events
        .filter((event) => event.sessionId === session.id)
        .slice()
        .reverse()
        .slice(0, 12)
    : [];

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
            <span>Operações encerradas</span>
            <strong>{summary.closedTrades}</strong>
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

      {relevantEvents.length > 0 && (
        <div className="training-timeline">
          <div className="training-timeline-heading">
            <strong>Linha do tempo disciplinar</strong>
            <span>últimos {relevantEvents.length} eventos</span>
          </div>

          {relevantEvents.map((event) => (
            <div
              key={event.id}
              className={`training-event event-${event.type.toLowerCase().replaceAll("_", "-")}`}
            >
              <div>
                <strong>{eventLabel(event)}</strong>
                <small>{eventDetail(event)}</small>
              </div>
              <time>{marketClock(event.marketTimestamp)}</time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
