import { useEffect, useMemo, useState } from "react";
import {
  calculateSessionPerformance,
  classifyTrainingEvent,
  performanceByHour,
} from "../domain/sessionReport";
import {
  loadSessionTrades,
  loadTrainingEvents,
  loadTrainingSessions,
} from "../services/persistence";
import type {
  Trade,
  TrainingEvent,
  TrainingSession,
} from "../types";

interface Props {
  refreshKey: number;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatPoints(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function brDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function ratio(value: number | null): string {
  return value === null ? "∞" : value.toFixed(2);
}

export function SessionHistoryPanel({ refreshKey }: Props) {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<TrainingEvent[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    loadTrainingSessions()
      .then((next) => {
        if (!active) return;
        setSessions(next);
        setSelectedId((current) => current ?? next[0]?.id ?? null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const selected =
    sessions.find((session) => session.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setTrades([]);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      loadTrainingEvents(selected.id),
      loadSessionTrades(selected.id),
    ])
      .then(([nextEvents, nextTrades]) => {
        if (!active) return;
        setEvents(nextEvents);
        setTrades(nextTrades);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selected?.id, refreshKey]);

  const performance = useMemo(
    () =>
      selected
        ? calculateSessionPerformance(selected, events, trades)
        : null,
    [selected, events, trades],
  );
  const byHour = useMemo(() => performanceByHour(trades), [trades]);

  const disciplineEvents = events.filter(
    (event) => classifyTrainingEvent(event) === "DISCIPLINE",
  );
  const technicalEvents = events.filter(
    (event) => classifyTrainingEvent(event) === "TECHNICAL",
  );

  return (
    <section className="session-history card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Histórico persistente</p>
          <h2>Sessões concluídas</h2>
        </div>
        <span className="history-count">{sessions.length} sessões</span>
      </div>

      {error && <div className="data-status error">{error}</div>}

      {sessions.length === 0 ? (
        <p className="empty-state">
          As sessões de treino concluídas aparecerão aqui.
        </p>
      ) : (
        <div className="session-history-layout">
          <nav className="session-list" aria-label="Sessões de treinamento">
            {sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={selectedId === session.id ? "active" : ""}
                onClick={() => setSelectedId(session.id)}
              >
                <strong>
                  {brDate(session.tradeDate)} · {session.asset}
                </strong>
                <span>
                  {session.startTime}–{session.endTime} · M
                  {session.timeframeMinutes}
                </span>
                <small>
                  {session.status === "ENDED" ? "Concluída" : "Interrompida/ativa"}
                </small>
              </button>
            ))}
          </nav>

          <div className="session-report">
            {loading || !selected || !performance ? (
              <p className="empty-state">Carregando relatório da sessão...</p>
            ) : (
              <>
                <div className="report-title">
                  <div>
                    <span>Relatório pós-sessão</span>
                    <strong>
                      {brDate(selected.tradeDate)} · {selected.asset}
                    </strong>
                  </div>
                  <small>
                    {selected.startTime}–{selected.endTime} ·{" "}
                    {selected.timeframeMinutes} min
                  </small>
                </div>

                <div className="report-kpis">
                  <div>
                    <span>Resultado</span>
                    <strong
                      className={
                        performance.netPoints >= 0 ? "positive" : "negative"
                      }
                    >
                      {formatPoints(performance.netPoints)}
                    </strong>
                  </div>
                  <div>
                    <span>Win rate</span>
                    <strong>{formatPct(performance.winRatePct)}</strong>
                  </div>
                  <div>
                    <span>Payoff</span>
                    <strong>{ratio(performance.payoff)}</strong>
                  </div>
                  <div>
                    <span>Profit factor</span>
                    <strong>{ratio(performance.profitFactor)}</strong>
                  </div>
                  <div>
                    <span>Resultado em R</span>
                    <strong>{performance.totalR.toFixed(2)} R</strong>
                  </div>
                  <div>
                    <span>Expectativa</span>
                    <strong>{performance.expectancyR.toFixed(2)} R/trade</strong>
                  </div>
                  <div>
                    <span>Drawdown máx.</span>
                    <strong>{performance.maxDrawdownPoints.toFixed(1)} pts</strong>
                  </div>
                  <div>
                    <span>Aderência</span>
                    <strong>
                      {formatPct(performance.executionAdherencePct)}
                    </strong>
                  </div>
                  <div>
                    <span>Bloqueios</span>
                    <strong>{performance.blockedAttempts}</strong>
                  </div>
                  <div>
                    <span>Problemas técnicos</span>
                    <strong>{performance.technicalIssues}</strong>
                  </div>
                  <div>
                    <span>Sinais ignorados</span>
                    <strong>{performance.ignoredSignals}</strong>
                  </div>
                </div>

                <div className="report-columns">
                  <article>
                    <h3>Execução</h3>
                    <dl>
                      <div>
                        <dt>Trades</dt>
                        <dd>{performance.totalTrades}</dd>
                      </div>
                      <div>
                        <dt>Vitórias / derrotas</dt>
                        <dd>
                          {performance.wins} / {performance.losses}
                        </dd>
                      </div>
                      <div>
                        <dt>Média por trade</dt>
                        <dd>{formatPoints(performance.averagePoints)}</dd>
                      </div>
                      <div>
                        <dt>Média ganho</dt>
                        <dd>{formatPoints(performance.averageWinPoints)}</dd>
                      </div>
                      <div>
                        <dt>Média perda</dt>
                        <dd>
                          {performance.averageLossPoints.toFixed(1)} pts
                        </dd>
                      </div>
                      <div>
                        <dt>Melhor / pior</dt>
                        <dd>
                          {formatPoints(performance.bestTradePoints)} /{" "}
                          {formatPoints(performance.worstTradePoints)}
                        </dd>
                      </div>
                      <div>
                        <dt>Compra / venda</dt>
                        <dd>
                          {performance.buyTrades} / {performance.sellTrades}
                        </dd>
                      </div>
                      <div>
                        <dt>Resultado compras</dt>
                        <dd>{formatPoints(performance.buyNetPoints)}</dd>
                      </div>
                      <div>
                        <dt>Resultado vendas</dt>
                        <dd>{formatPoints(performance.sellNetPoints)}</dd>
                      </div>
                    </dl>
                  </article>

                  <article>
                    <h3>Resultado por horário</h3>
                    {byHour.length === 0 ? (
                      <p className="empty-state">Nenhuma operação encerrada.</p>
                    ) : (
                      <div className="hour-report">
                        {byHour.map((bucket) => (
                          <div key={bucket.hour}>
                            <span>{bucket.hour}</span>
                            <strong>{bucket.trades} trades</strong>
                            <small
                              className={
                                bucket.netPoints >= 0 ? "positive" : "negative"
                              }
                            >
                              {formatPoints(bucket.netPoints)}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>

                <div className="error-separation">
                  <article>
                    <span>Erros de execução/disciplinar</span>
                    <strong>{disciplineEvents.length}</strong>
                    <small>
                      Ações do trader que tentaram violar as regras do operacional.
                    </small>
                  </article>
                  <article>
                    <span>Problemas técnicos</span>
                    <strong>{technicalEvents.length}</strong>
                    <small>
                      Falhas de replay/aplicativo registradas separadamente e que
                      não reduzem a aderência do trader.
                    </small>
                  </article>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
