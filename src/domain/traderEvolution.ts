import type { Trade, TrainingEvent, TrainingSession } from "../types";
import type { UsageSessionRecord } from "../services/usageTracking";

export interface TraderEvolutionMetrics {
  launches: number;
  activeUsageSeconds: number;
  averageUsageSeconds: number;
  activeDays: number;
  trainingSessions: number;
  practiceDaysLast14: number;
  totalTrades: number;
  profitableTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  approvedTrainingEntries: number;
  blockedTrainingAttempts: number;
  trainingAttemptAdherencePct: number | null;
  ignoredSignals: number;
  diagnosticTitle: string;
  diagnosticLevel: "INFO" | "ATTENTION" | "POSITIVE";
  diagnosticDescription: string;
  recommendation: string;
}

function localDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildTraderEvolutionMetrics(
  usageSessions: UsageSessionRecord[],
  trainingSessions: TrainingSession[],
  events: TrainingEvent[],
  trades: Trade[],
  now = new Date(),
): TraderEvolutionMetrics {
  const activeUsageSeconds = usageSessions.reduce(
    (total, session) => total + Math.max(0, session.activeSeconds || 0),
    0,
  );
  const activeDays = new Set(
    usageSessions.map((session) => localDateKey(session.startedAt)).filter(Boolean),
  ).size;

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 13);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffTime = cutoff.getTime();
  const practiceDaysLast14 = new Set(
    trainingSessions
      .filter((session) => {
        const time = new Date(session.startedAt).getTime();
        return Number.isFinite(time) && time >= cutoffTime && time <= now.getTime();
      })
      .map((session) => localDateKey(session.startedAt))
      .filter(Boolean),
  ).size;

  const profitableTrades = trades.filter((trade) => trade.netResultBRL > 0).length;
  const losingTrades = trades.filter((trade) => trade.netResultBRL < 0).length;
  const breakevenTrades = trades.length - profitableTrades - losingTrades;

  const approvedTrainingEntries = events.filter((event) => event.type === "TRADE_OPENED").length;
  const blockedTrainingAttempts = events.filter((event) => event.type === "BLOCKED_ATTEMPT").length;
  const totalTrainingAttempts = approvedTrainingEntries + blockedTrainingAttempts;
  const trainingAttemptAdherencePct = totalTrainingAttempts > 0
    ? (approvedTrainingEntries / totalTrainingAttempts) * 100
    : null;
  const ignoredSignals = events.filter((event) => event.type === "SIGNAL_IGNORED").length;

  let diagnosticTitle = "Histórico em formação";
  let diagnosticLevel: TraderEvolutionMetrics["diagnosticLevel"] = "INFO";
  let diagnosticDescription =
    "Ainda há poucos registros para avaliar a regularidade e a aplicação das regras. Continue usando sessões de replay para construir uma amostra útil.";

  if (
    trainingAttemptAdherencePct !== null &&
    totalTrainingAttempts >= 5 &&
    trainingAttemptAdherencePct < 75
  ) {
    diagnosticTitle = "Atenção à execução das regras";
    diagnosticLevel = "ATTENTION";
    diagnosticDescription =
      "Uma parcela relevante das tentativas durante os treinos foi bloqueada pelas regras do operacional. Vale revisar os motivos dos bloqueios antes de aumentar a frequência de operações.";
  } else if (
    trainingSessions.length >= 5 &&
    practiceDaysLast14 >= 3 &&
    (trainingAttemptAdherencePct === null || trainingAttemptAdherencePct >= 90)
  ) {
    diagnosticTitle = "Rotina de prática consistente";
    diagnosticLevel = "POSITIVE";
    diagnosticDescription =
      "Os registros mostram sessões distribuídas ao longo dos últimos dias e boa aderência nas tentativas avaliadas. Isso indica consistência de prática, não uma garantia de rentabilidade ou de domínio do mercado.";
  } else if (trainingSessions.length >= 3 && practiceDaysLast14 >= 2) {
    diagnosticTitle = "Evolução em construção";
    diagnosticLevel = "INFO";
    diagnosticDescription =
      "Você já formou uma rotina inicial de prática. O próximo passo é manter a regularidade e observar se a proporção de tentativas aprovadas melhora ao longo das sessões.";
  } else if (trainingSessions.length >= 3) {
    diagnosticTitle = "Regularidade a desenvolver";
    diagnosticLevel = "ATTENTION";
    diagnosticDescription =
      "Há sessões registradas, mas elas ainda estão concentradas em poucos dias recentes. Distribuir a prática ao longo da semana ajuda a transformar esforço pontual em rotina.";
  }

  let recommendation = "Conclua algumas sessões de replay em dias diferentes antes de tirar conclusões sobre sua evolução.";
  if (
    trainingAttemptAdherencePct !== null &&
    totalTrainingAttempts >= 5 &&
    trainingAttemptAdherencePct < 90
  ) {
    recommendation = "Abra o histórico de eventos das sessões e revise os motivos das tentativas bloqueadas. O objetivo é reduzir a repetição dos mesmos erros.";
  } else if (practiceDaysLast14 < 3) {
    recommendation = "Procure distribuir os treinos por pelo menos três dias na quinzena, em vez de concentrar toda a prática em um único dia.";
  } else if (trainingSessions.length >= 5 && trades.length >= 10) {
    recommendation = "Compare as sessões mais recentes com as primeiras e verifique se a aderência às regras e a qualidade das decisões estão melhorando.";
  }

  return {
    launches: usageSessions.length,
    activeUsageSeconds,
    averageUsageSeconds: usageSessions.length > 0 ? activeUsageSeconds / usageSessions.length : 0,
    activeDays,
    trainingSessions: trainingSessions.length,
    practiceDaysLast14,
    totalTrades: trades.length,
    profitableTrades,
    losingTrades,
    breakevenTrades,
    approvedTrainingEntries,
    blockedTrainingAttempts,
    trainingAttemptAdherencePct,
    ignoredSignals,
    diagnosticTitle,
    diagnosticLevel,
    diagnosticDescription,
    recommendation,
  };
}
