import { useEffect, useMemo, useState } from "react";
import { buildTraderEvolutionMetrics } from "../domain/traderEvolution";
import { buildTradeReviewInsights } from "../domain/tradeReviewInsights";
import { buildTradeReviewContextInsights } from "../domain/tradeReviewContextInsights";
import {
  assessTradeReview,
  createTradeReviewDraft,
  type TradeReviewDraft,
} from "../domain/tradeReview";
import {
  buildPracticeCalendar,
  calculatePracticeStreaks,
} from "../domain/practiceCalendar";
import {
  loadAllTrades,
  loadAllTrainingEvents,
  loadTrainingSessions,
  saveTrade,
} from "../services/persistence";
import {
  loadUsageSessions,
  subscribeUsageSessions,
  type UsageSessionRecord,
} from "../services/usageTracking";
import type { Trade, TradeReview } from "../types";
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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Data indisponível";
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const entryOptions = [
  ["PLANNED", "Seguiu o plano de entrada"],
  ["PARTIAL", "Seguiu parcialmente"],
  ["OUTSIDE_PLAN", "Entrou fora do plano"],
] as const;

const stopOptions = [
  ["RESPECTED", "Respeitou o stop definido"],
  ["MOVED_WITH_PLAN", "Ajustou conforme regra prevista"],
  ["MOVED_AGAINST_PLAN", "Afastou o stop para evitar a saída"],
  ["NOT_APPLICABLE", "Não se aplica"],
] as const;

const targetOptions = [
  ["RESPECTED", "Respeitou o alvo definido"],
  ["CLOSED_EARLY", "Encerrou antes do alvo"],
  ["EXTENDED_WITH_PLAN", "Estendeu conforme regra prevista"],
  ["EXTENDED_WITHOUT_PLAN", "Estendeu sem previsão no plano"],
  ["NOT_APPLICABLE", "Não se aplica"],
] as const;

const ruleOptions = [
  ["ALL", "Cumpriu todas as regras"],
  ["PARTIAL", "Cumpriu parcialmente"],
  ["BROKE", "Quebrou uma ou mais regras"],
] as const;

const emotionOptions = [
  ["NONE", "Nenhuma interferência percebida"],
  ["FEAR", "Medo"],
  ["GREED", "Ganância"],
  ["REVENGE", "Tentativa de recuperar prejuízo"],
  ["FOMO", "Medo de ficar de fora (FOMO)"],
  ["HESITATION", "Hesitação"],
  ["OTHER", "Outra"],
] as const;

function reviewLabel(review: TradeReview): string {
  const assessment = assessTradeReview(review);
  if (assessment === "ALIGNED") return "Execução alinhada";
  if (assessment === "PARTIAL") return "Execução parcial";
  return "Revisar decisão";
}

export function TraderEvolutionPanel({ refreshKey }: Props) {
  const [usageSessions, setUsageSessions] = useState<UsageSessionRecord[]>(loadUsageSessions);
  const [trainingSessions, setTrainingSessions] = useState<Awaited<ReturnType<typeof loadTrainingSessions>>>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadAllTrainingEvents>>>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, TradeReviewDraft>>({});
  const [reviewFeedback, setReviewFeedback] = useState<Record<string, string>>({});
  const [reviewFilter, setReviewFilter] = useState<"ALL" | "PENDING" | "REVIEWED">("ALL");
  const [visibleTradeLimit, setVisibleTradeLimit] = useState(20);

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
        setReviewDrafts(Object.fromEntries(
          nextTrades.map((trade) => [trade.id, createTradeReviewDraft(trade.review)]),
        ));
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

  const calendarDays = useMemo(
    () => buildPracticeCalendar(trainingSessions, calendarMonth),
    [trainingSessions, calendarMonth],
  );
  const streaks = useMemo(
    () => calculatePracticeStreaks(trainingSessions),
    [trainingSessions],
  );
  const monthSessionCount = calendarDays.reduce(
    (total, day) => total + (day?.sessionCount ?? 0),
    0,
  );

  const reviewInsights = useMemo(() => buildTradeReviewInsights(trades), [trades]);
  const reviewContextInsights = useMemo(
    () => buildTradeReviewContextInsights(trades),
    [trades],
  );

  const reviewSummary = useMemo(() => {
    const reviewed = trades.filter((trade) => trade.review);
    return {
      reviewed: reviewed.length,
      pending: trades.length - reviewed.length,
      aligned: reviewed.filter((trade) => assessTradeReview(trade.review!) === "ALIGNED").length,
      partial: reviewed.filter((trade) => assessTradeReview(trade.review!) === "PARTIAL").length,
      needsReview: reviewed.filter((trade) => assessTradeReview(trade.review!) === "NEEDS_REVIEW").length,
    };
  }, [trades]);

  const filteredTrades = useMemo(() => {
    const sorted = [...trades].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    if (reviewFilter === "PENDING") return sorted.filter((trade) => !trade.review);
    if (reviewFilter === "REVIEWED") return sorted.filter((trade) => Boolean(trade.review));
    return sorted;
  }, [trades, reviewFilter]);

  function updateDraft<K extends keyof TradeReviewDraft>(
    tradeId: string,
    key: K,
    value: TradeReviewDraft[K],
  ) {
    setReviewDrafts((current) => ({
      ...current,
      [tradeId]: {
        ...(current[tradeId] ?? createTradeReviewDraft()),
        [key]: value,
      } as TradeReviewDraft,
    }));
  }

  async function saveReview(trade: Trade) {
    const draft = reviewDrafts[trade.id] ?? createTradeReviewDraft();
    if (
      !draft.entryExecution ||
      !draft.stopDiscipline ||
      !draft.targetDiscipline ||
      !draft.ruleAdherence ||
      !draft.emotionalInterference
    ) {
      setReviewFeedback((current) => ({
        ...current,
        [trade.id]: "Preencha todos os critérios antes de salvar a avaliação.",
      }));
      return;
    }

    const review: TradeReview = {
      tradeId: trade.id,
      reviewedAt: new Date().toISOString(),
      entryExecution: draft.entryExecution as TradeReview["entryExecution"],
      stopDiscipline: draft.stopDiscipline as TradeReview["stopDiscipline"],
      targetDiscipline: draft.targetDiscipline as TradeReview["targetDiscipline"],
      ruleAdherence: draft.ruleAdherence as TradeReview["ruleAdherence"],
      emotionalInterference: draft.emotionalInterference as TradeReview["emotionalInterference"],
      lesson: draft.lesson.trim(),
    };

    const updated: Trade = {
      ...trade,
      review,
      postTradeNote: trade.postTradeNote ?? "",
    };

    try {
      await saveTrade(updated);
      setTrades((current) => current.map((item) => item.id === trade.id ? updated : item));
      setReviewFeedback((current) => ({ ...current, [trade.id]: "Avaliação salva." }));
    } catch (reason) {
      setReviewFeedback((current) => ({
        ...current,
        [trade.id]: reason instanceof Error ? reason.message : "Não foi possível salvar a avaliação.",
      }));
    }
  }

  function moveCalendarMonth(offset: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <section className="trader-evolution">
      <div className="evolution-intro">
        <p>
          Acompanhe sua rotina de prática, o uso do simulador e a aplicação das regras.
          Os dados são armazenados localmente neste dispositivo.
        </p>
      </div>

      {error && <div className="evolution-error">Não foi possível carregar todo o histórico: {error}</div>}

      <article className={`evolution-diagnosis ${metrics.diagnosticLevel.toLowerCase()}`}>
        <div>
          <h3>{metrics.diagnosticTitle}</h3>
          <p>{metrics.diagnosticDescription}</p>
        </div>
        <div className="evolution-recommendation">
          <strong>Próximo passo sugerido</strong>
          <span>{metrics.recommendation}</span>
        </div>
      </article>

      <div className="evolution-section-heading">
        <h3>Calendário de consistência</h3>
        <span>Conta dias com sessões de treino, não apenas aberturas do aplicativo</span>
      </div>
      <section className="practice-calendar">
        <div className="practice-calendar-top">
          <button type="button" onClick={() => moveCalendarMonth(-1)} aria-label="Mês anterior">‹</button>
          <strong>{calendarMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong>
          <button type="button" onClick={() => moveCalendarMonth(1)} aria-label="Próximo mês">›</button>
        </div>
        <div className="practice-calendar-grid practice-weekdays">
          {weekdayLabels.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="practice-calendar-grid practice-days">
          {calendarDays.map((day, index) => day ? (
            <div
              key={day.dateKey}
              className={[
                "practice-day",
                day.sessionCount > 0 ? "has-practice" : "",
                day.isToday ? "is-today" : "",
                day.isFuture ? "is-future" : "",
              ].filter(Boolean).join(" ")}
              title={day.sessionCount > 0 ? `${day.sessionCount} sessão(ões) de treino` : "Sem sessão de treino"}
            >
              <span>{day.day}</span>
              {day.sessionCount > 0 && <small>{day.sessionCount}×</small>}
            </div>
          ) : <div className="practice-day empty" key={`empty-${index}`} />)}
        </div>
        <div className="practice-calendar-legend">
          <span><i className="practice-legend-dot" /> Dia com treino</span>
          <span>{monthSessionCount} sessão(ões) no mês</span>
        </div>
      </section>
      <div className="evolution-kpis practice-streak-kpis">
        <article><span>Dias de prática registrados</span><strong>{streaks.practiceDays}</strong></article>
        <article><span>Sequência atual</span><strong>{streaks.currentStreak} dias</strong></article>
        <article><span>Maior sequência</span><strong>{streaks.longestStreak} dias</strong></article>
        <article><span>Dias de treino · últimos 14</span><strong>{metrics.practiceDaysLast14}</strong></article>
      </div>

      <div className="evolution-section-heading">
        <h3>Uso do programa</h3>
        <span>Atividade registrada neste dispositivo</span>
        <InfoTip label="Como o tempo de uso é calculado">
          O tempo considera o aplicativo em primeiro plano. Ele não representa, necessariamente, o tempo efetivo de estudo.
        </InfoTip>
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
        <article><span>Operações concluídas</span><strong>{metrics.totalTrades}</strong></article>
        <article><span>Operações vencedoras</span><strong className="positive">{metrics.profitableTrades}</strong></article>
        <article><span>Operações perdedoras</span><strong className="negative">{metrics.losingTrades}</strong></article>
        <article><span>Empates</span><strong>{metrics.breakevenTrades}</strong></article>
      </div>

      <div className="evolution-section-heading">
        <h3>Avaliação individual das operações</h3>
        <span>Revise o processo de cada trade encerrado, independentemente do resultado financeiro</span>
      </div>
      <div className="evolution-kpis review-summary-kpis">
        <article><span>Avaliações concluídas</span><strong>{reviewSummary.reviewed}</strong></article>
        <article><span>Pendentes</span><strong>{reviewSummary.pending}</strong></article>
        <article><span>Execução alinhada</span><strong>{reviewSummary.aligned}</strong></article>
        <article><span>Execução parcial / a revisar</span><strong>{reviewSummary.partial + reviewSummary.needsReview}</strong></article>
      </div>
      <div className="evolution-section-heading">
        <h3>Padrões de comportamento identificados</h3>
        <span>Análise das avaliações individuais, separada do resultado financeiro</span>
        <InfoTip label="Como interpretar as avaliações">
          A classificação resume as respostas registradas. Não é uma nota automática nem uma conclusão sobre habilidade. Emoções e decisões discricionárias são informadas pelo próprio trader; o simulador não as infere.
        </InfoTip>
      </div>
      <section className="review-insights">
        <div className="review-insights-overview">
          <article>
            <span>Operações avaliadas</span>
            <strong>{reviewInsights.reviewedTrades}</strong>
          </article>
          <article>
            <span>Padrões recorrentes</span>
            <strong>{reviewInsights.recurrentPatterns}</strong>
          </article>
          <article>
            <span>Sinais iniciais</span>
            <strong>{reviewInsights.earlySignals}</strong>
          </article>
        </div>

        {reviewInsights.patterns.length === 0 ? (
          <div className="review-insights-empty">
            {reviewInsights.reviewedTrades === 0
              ? "As análises aparecerão depois que você avaliar operações encerradas."
              : "Nenhum desvio foi registrado até aqui. Continue avaliando operações; recorrências só serão apontadas quando houver amostra suficiente."}
          </div>
        ) : (
          <div className="review-insights-list">
            {reviewInsights.patterns.map((pattern) => (
              <article className={`review-insight-card ${pattern.strength.toLowerCase()}`} key={pattern.key}>
                <div className="review-insight-heading">
                  <strong>{pattern.title}</strong>
                  <span className={`review-insight-strength ${pattern.strength.toLowerCase()}`}>
                    {pattern.strength === "RECURRENT" ? "Padrão recorrente" : "Sinal inicial"}
                  </span>
                </div>
                <p>{pattern.description}</p>
                <div className="review-insight-recommendation">
                  <strong>O que experimentar na próxima sessão</strong>
                  <span>{pattern.recommendation}</span>
                </div>
                <div className="review-insight-metrics">
                  <strong>{pattern.count} de {pattern.sampleSize}</strong>
                  <span>{pattern.percentage.toFixed(0)}% das avaliações aplicáveis</span>
                </div>
                <div className="review-insight-bar" role="img" aria-label={`${pattern.percentage.toFixed(0)} por cento`}>
                  <span style={{ width: `${Math.min(100, pattern.percentage)}%` }} />
                </div>
                <div className="review-insight-trend">
                  {pattern.trend === "IMPROVING" && <span className="improving">Menos frequente nas avaliações recentes</span>}
                  {pattern.trend === "WORSENING" && <span className="worsening">Mais frequente nas avaliações recentes</span>}
                  {pattern.trend === "STABLE" && <span>Frequência semelhante nas duas amostras</span>}
                  {pattern.trend === "INSUFFICIENT" && <span>Comparação temporal ainda sem amostra suficiente</span>}
                  {pattern.trend !== "INSUFFICIENT" && pattern.recentPercentage !== null && pattern.previousPercentage !== null && (
                    <small>Recentes ({pattern.recentSampleSize}): {pattern.recentPercentage.toFixed(0)}% · anteriores ({pattern.previousSampleSize}): {pattern.previousPercentage.toFixed(0)}%</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="evolution-inline-help">
          <InfoTip label="Critérios dos padrões e da comparação">
            Um padrão é recorrente quando há pelo menos 5 avaliações aplicáveis, 2 ocorrências e frequência mínima de 20%. Antes disso, aparece como sinal inicial. A tendência compara até 10 avaliações recentes com até 10 anteriores, desde que cada grupo tenha ao menos 5 registros. Os dados vêm da autoavaliação do trader.
          </InfoTip>
        </div>
      </section>
      <div className="evolution-section-heading">
        <h3>Em quais contextos os desvios aparecem?</h3>
        <span>Cruzamento das avaliações com as condições na entrada</span>
        <InfoTip label="Quais condições são analisadas">
          A análise cruza os desvios com ativo, direção, zona do indicador, posição do preço em relação à VWAP, proporção do corpo do candle de entrada, amplitude frente aos 10 candles anteriores, distância do stop em relação à volatilidade recente e relação risco/retorno planejada. Operações antigas sem snapshot ainda contribuem para ativo, direção e risco/retorno, mas não para as condições que dependem do gráfico.
        </InfoTip>
      </div>
      <section className="review-context-insights">
        <div className="review-context-coverage">
          <article>
            <span>Operações avaliadas</span>
            <strong>{reviewContextInsights.reviewedTrades}</strong>
          </article>
          <article>
            <span>Com contexto de mercado</span>
            <strong>{reviewContextInsights.reviewedWithContext}</strong>
          </article>
          <article>
            <span>Cobertura dos snapshots</span>
            <strong>{reviewContextInsights.contextCoveragePercentage.toFixed(0)}%</strong>
          </article>
        </div>

        {reviewContextInsights.associations.length === 0 ? (
          <div className="review-context-empty">
            Nenhuma associação contextual atingiu os critérios mínimos até agora.
          </div>
        ) : (
          <div className="review-context-list">
            {reviewContextInsights.associations.map((association) => (
              <article className="review-context-card" key={association.id}>
                <div className="review-context-card-heading">
                  <strong>{association.patternTitle}</strong>
                  <span className={association.strength === "RECURRENT" ? "recurrent" : "early"}>
                    {association.strength === "RECURRENT" ? "Associação recorrente" : "Sinal contextual inicial"}
                  </span>
                </div>
                <p><strong>{association.dimensionLabel}:</strong> {association.contextLabel}</p>
                <div className="review-context-comparison">
                  <strong>{association.count} de {association.sampleSize} operações · {association.percentage.toFixed(0)}%</strong>
                  <span>Base geral: {association.baselineCount} de {association.baselineSampleSize} · {association.baselinePercentage.toFixed(0)}%</span>
                  <span className="review-context-delta">+{association.differencePercentagePoints.toFixed(0)} p.p.</span>
                </div>
                <div className="review-insight-bar" role="img" aria-label={"Frequência de " + association.percentage.toFixed(0) + " por cento nesse contexto"}>
                  <span style={{ width: String(Math.min(100, association.percentage)) + "%" }} />
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="evolution-inline-help">
          <InfoTip label="Critérios das associações contextuais">
            São exibidas até 12 associações com maior diferença em relação à base geral. Um sinal inicial exige ao menos 3 operações no grupo; uma associação recorrente exige 5 operações e 2 ocorrências. A diferença mínima é de 10 pontos percentuais. Esses critérios são exploratórios: não provam causalidade nem substituem uma análise estatística.
          </InfoTip>
        </div>
      </section>
      <div className="trade-review-toolbar">
        <label>
          Exibir operações
          <select value={reviewFilter} onChange={(event) => {
            setReviewFilter(event.target.value as "ALL" | "PENDING" | "REVIEWED");
            setVisibleTradeLimit(20);
          }}>
            <option value="ALL">Todas</option>
            <option value="PENDING">Pendentes</option>
            <option value="REVIEWED">Já avaliadas</option>
          </select>
        </label>
        <span>{filteredTrades.length} operação(ões)</span>
      </div>

      {filteredTrades.length === 0 ? (
        <p className="empty-state">
          {trades.length === 0
            ? "As operações encerradas aparecerão aqui para avaliação."
            : "Não há operações nesta categoria."}
        </p>
      ) : (
        <div className="trade-review-list">
          {filteredTrades.slice(0, visibleTradeLimit).map((trade) => {
            const draft = reviewDrafts[trade.id] ?? createTradeReviewDraft(trade.review);
            const assessment = trade.review ? assessTradeReview(trade.review) : null;
            return (
              <details className="trade-review-card" key={trade.id}>
                <summary>
                  <div className="trade-review-title">
                    <strong>{trade.asset} · {trade.side === "BUY" ? "Compra" : "Venda"}</strong>
                    <small>{formatDate(trade.closedAt)} · {trade.contracts} contrato(s)</small>
                  </div>
                  <span className={`trade-review-status ${assessment ?? "PENDING"}`}>
                    {trade.review ? reviewLabel(trade.review) : "Avaliação pendente"}
                  </span>
                  <strong className={trade.netResultBRL >= 0 ? "positive" : "negative"}>
                    {formatMoney(trade.netResultBRL)}
                  </strong>
                </summary>
                <div className="trade-review-context">
                  <span>Entrada: {trade.entry}</span>
                  <span>Stop: {trade.stopLoss}</span>
                  <span>Alvo: {trade.target}</span>
                  <span>Saída: {trade.exitPrice} · {trade.exitReason}</span>
                  <span>Resultado: {trade.resultPoints >= 0 ? "+" : ""}{trade.resultPoints.toFixed(1)} pts</span>
                </div>
                <div className="trade-review-form">
                  <label>
                    <strong>A entrada respeitou o plano?</strong>
                    <select value={draft.entryExecution} onChange={(event) => updateDraft(trade.id, "entryExecution", event.target.value as TradeReviewDraft["entryExecution"])}>
                      <option value="">Selecione...</option>
                      {entryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <strong>Como você lidou com o stop?</strong>
                    <select value={draft.stopDiscipline} onChange={(event) => updateDraft(trade.id, "stopDiscipline", event.target.value as TradeReviewDraft["stopDiscipline"])}>
                      <option value="">Selecione...</option>
                      {stopOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <strong>Como você lidou com o alvo?</strong>
                    <select value={draft.targetDiscipline} onChange={(event) => updateDraft(trade.id, "targetDiscipline", event.target.value as TradeReviewDraft["targetDiscipline"])}>
                      <option value="">Selecione...</option>
                      {targetOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <strong>As regras do operacional foram cumpridas?</strong>
                    <select value={draft.ruleAdherence} onChange={(event) => updateDraft(trade.id, "ruleAdherence", event.target.value as TradeReviewDraft["ruleAdherence"])}>
                      <option value="">Selecione...</option>
                      {ruleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <strong>Houve interferência emocional?</strong>
                    <select value={draft.emotionalInterference} onChange={(event) => updateDraft(trade.id, "emotionalInterference", event.target.value as TradeReviewDraft["emotionalInterference"])}>
                      <option value="">Selecione...</option>
                      {emotionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="review-lesson">
                    O que você aprendeu ou faria diferente?
                    <textarea
                      rows={3}
                      value={draft.lesson}
                      onChange={(event) => updateDraft(trade.id, "lesson", event.target.value)}
                      placeholder="Registre uma observação concreta para a próxima sessão..."
                    />
                  </label>
                  <div className="trade-review-actions">
                    <button type="button" onClick={() => void saveReview(trade)}>
                      {trade.review ? "Atualizar avaliação" : "Salvar avaliação"}
                    </button>
                    <span>{reviewFeedback[trade.id] ?? ""}</span>
                  </div>
                </div>
              </details>
            );
          })}
          {filteredTrades.length > visibleTradeLimit && (
            <button className="review-show-more" type="button" onClick={() => setVisibleTradeLimit((current) => current + 20)}>
              Mostrar mais 20 operações
            </button>
          )}
        </div>
      )}

      <div className="evolution-section-heading">
        <h3>Aplicação das regras durante os treinos</h3>
        <span>Não confundir aderência técnica com lucro ou prejuízo</span>
      </div>
      <div className="evolution-rule-grid">
        <article><span>Entradas aprovadas pelo operacional</span><strong>{metrics.approvedTrainingEntries}</strong></article>
        <article><span>Tentativas bloqueadas pelas regras</span><strong>{metrics.blockedTrainingAttempts}</strong></article>
        <article><span>Aderência nas tentativas registradas</span><strong>{metrics.trainingAttemptAdherencePct === null ? "—" : `${metrics.trainingAttemptAdherencePct.toFixed(1)}%`}</strong></article>
        <article><span>Sinais não utilizados</span><strong>{metrics.ignoredSignals}</strong></article>
      </div>
      <div className="evolution-inline-help">
        <InfoTip label="Como interpretar a aderência e o diagnóstico">
          A aderência é calculada como entradas aceitas ÷ (entradas aceitas + tentativas bloqueadas), apenas nas sessões que registram esses eventos. Sinais ignorados aparecem à parte e não são tratados automaticamente como erros. O diagnóstico de rotina consistente exige ao menos 5 sessões e prática em 3 dos últimos 14 dias; o alerta de execução exige ao menos 5 tentativas e aprovação inferior a 75%. São referências operacionais, não padrões científicos. O diagnóstico não certifica habilidade nem prevê rentabilidade.
        </InfoTip>
      </div>
    </section>
  );
}
