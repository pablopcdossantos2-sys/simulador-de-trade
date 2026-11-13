import { useEffect, useMemo, useState } from "react";
import { buildTraderEvolutionMetrics } from "../domain/traderEvolution";
import {
  loadAllTrades,
  loadAllTrainingEvents,
  loadTrainingSessions,
} from "../services/persistence";
import {
  loadUsageSessions,
  subscribeUsageSessions,
  type UsageSessionRecord,
} from "../services/usageTracking";
import "./TraderEvolutionPanel.css";

interface Props {
  refreshKey: number;
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes} min`;
}

export function TraderEvolutionPanel({ refreshKey }: Props) {
  const [usageSessions, setUsageSessions] = useState<UsageSessionRecord[]>(loadUsageSessions);
  const [trainingSessions, setTrainingSessions] = useState<Awaited<ReturnType<typeof loadTrainingSessions>>>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadAllTrainingEvents>>>([]);
  const [trades, setTrades] = useState<Awaited<ReturnType<typeof loadAllTrades>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeUsageSessions(() => setUsageSessions(loadUsageSessions()));
    setUsageSessions(loadUsageSessions());
    return unsubscribe;
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadTrainingSessions(), loadAllTrainingEvents(), loadAllTrades()])
      .then(([nextSessions, nextEvents, nextTrades]) => {
        if (!active) return;
        setTrainingSessions(nextSessions);
        setEvents(nextEvents);
        setTrades(nextTrades);
        setError(null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { active = false; };
  }, [refreshKey]);

  const metrics = useMemo(
    () => buildTraderEvolutionMetrics(usageSessions, trainingSessions, events, trades),
    [usageSessions, trainingSessions, events, trades],
  );

  return (
    <section className="trader-evolution">
      <div className="evolution-intro">
        <p>
          Acompanhe sua rotina de prática, o uso do simulador e a aplicação das regras.
          Os dados são armazenados localmente neste dispositivo.
        </p>
        <span>O tempo de uso considera o aplicativo em primeiro plano; não significa, por si só, tempo efetivo de estudo.</span>
      </div>

      {error && <div className="evolution-error">Não foi possível carregar todo o histórico: {error}</div>}

      <article className={`evolution-diagnosis ${metrics.diagnosticLevel.toLowerCase()}`}>
        <div>
          <p className="eyebrow">Diagnóstico da rotina</p>
          <h3>{metrics.diagnosticTitle}</h3>
          <p>{metrics.diagnosticDescription}</p>
        </div>
        <div className="evolution-recommendation">
          <strong>Próximo passo sugerido</strong>
          <span>{metrics.recommendation}</span>
        </div>
      </article>

      <div className="evolution-section-heading">
        <h3>Uso do programa</h3>
        <span>Atividade registrada neste dispositivo</span>
      </div>
      <div className="evolution-kpis">
        <article><span>Inicializações</span><strong>{metrics.launches}</strong></article>
        <article><span>Tempo em primeiro plano</span><strong>{formatDuration(metrics.activeUsageSeconds)}</strong></article>
        <article><span>Tempo médio por inicialização</span><strong>{formatDuration(metrics.averageUsageSeconds)}</strong></article>
        <article><span>Dias em que abriu o programa</span><strong>{metrics.activeDays}</strong></article>
      </div>

      <div className="evolution-section-heading">
        <h3>Prática e operações</h3>
        <span>Registros de sessões e operações concluídas</span>
      </div>
      <div className="evolution-kpis">
        <article><span>Sessões de treino iniciadas</span><strong>{metrics.trainingSessions}</strong></article>
        <article><span>Dias de treino · últimos 14</span><strong>{metrics.practiceDaysLast14}</strong></article>
        <article><span>Operações concluídas</span><strong>{metrics.totalTrades}</strong></article>
        <article><span>Operações vencedoras</span><strong className="positive">{metrics.profitableTrades}</strong></article>
        <article><span>Operações perdedoras</span><strong className="negative">{metrics.losingTrades}</strong></article>
        <article><span>Empates</span><strong>{metrics.breakevenTrades}</strong></article>
      </div>

      <div className="evolution-section-heading">
        <h3>Aplicação das regras durante os treinos</h3>
        <span>Não confundir aderência técnica com lucro ou prejuízo</span>
      </div>
      <div className="evolution-rule-grid">
        <article>
          <span>Entradas aprovadas pelo operacional</span>
          <strong>{metrics.approvedTrainingEntries}</strong>
        </article>
        <article>
          <span>Tentativas bloqueadas pelas regras</span>
          <strong>{metrics.blockedTrainingAttempts}</strong>
        </article>
        <article>
          <span>Aderência nas tentativas registradas</span>
          <strong>{metrics.trainingAttemptAdherencePct === null ? "—" : `${metrics.trainingAttemptAdherencePct.toFixed(1)}%`}</strong>
        </article>
        <article>
          <span>Sinais não utilizados</span>
          <strong>{metrics.ignoredSignals}</strong>
        </article>
      </div>
      <p className="evolution-footnote">
        A aderência é calculada como entradas aceitas ÷ (entradas aceitas + tentativas bloqueadas), somente nas sessões que registram esses eventos.
        Sinais ignorados são mostrados à parte e não são tratados automaticamente como erros. As operações vencedoras e perdedoras representam resultado financeiro,
        não uma avaliação isolada da qualidade da decisão.
      </p>
      <p className="evolution-footnote">
        Este diagnóstico avalia hábitos e dados observáveis do simulador. Ele não certifica que alguém se tornou um bom trader nem prevê rentabilidade futura.
      </p>
    </section>
  );
}
