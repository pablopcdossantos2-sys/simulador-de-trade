import { useEffect, useMemo, useState } from "react";
import { summarizeExecutionResults } from "../domain/executionResults";
import { EXIT_TIME_LIMIT_MS } from "../domain/disciplineConfig";
import { loadAllTrainingEvents, loadTrainingSessions } from "../services/persistence";
import type { Trade } from "../types";

export type ResultsView = "simple" | "full";
export const RESULTS_VIEW_KEY = "simulador-de-trade:results-view";
export function readResultsView(): ResultsView {
  try { return localStorage.getItem(RESULTS_VIEW_KEY) === "full" ? "full" : "simple"; }
  catch { return "simple"; }
}

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export function SimpleResultsPanel({ trades, refreshKey }: { trades: Trade[]; refreshKey: number }) {
  const results = useMemo(() => summarizeExecutionResults(trades), [trades]);
  const [blocks, setBlocks] = useState<{ count: number; sessions: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    Promise.all([loadTrainingSessions(), loadAllTrainingEvents()]).then(([sessions, events]) => {
      const ended = new Set(sessions.filter(session => session.status === "ENDED").map(session => session.id));
      const count = events.filter(event => ended.has(event.sessionId) && event.type === "BLOCKED_ATTEMPT").length;
      if (active) setBlocks({ count, sessions: ended.size });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [refreshKey]);

  return <section className="card discipline-panel" aria-labelledby="execution-summary-title">
    <div className="discipline-heading"><div>
      <h3 id="execution-summary-title">Execução do plano</h3>
      <p>As operações com perda também contam como disciplinadas quando todas as regras são cumpridas.</p>
    </div></div>
    <dl className="discipline-metrics results-process-metrics">
      <div className="discipline-metric-main"><dt>Operações com as regras cumpridas</dt>
        <dd>{results.measured ? percent.format(results.disciplined / results.measured) : "—"}</dd>
        <small>{results.measured ? `${results.disciplined} de ${results.measured} operações medidas` : "Nenhuma operação com disciplina registrada"}</small>
      </div>
      <div><dt>Stops manuais em até {EXIT_TIME_LIMIT_MS / 1000} s</dt>
        <dd>{results.touched ? percent.format(results.onTime / results.touched) : "—"}</dd>
        <small>{results.touched ? `${results.onTime} de ${results.touched} stops atingidos nos níveis manuais` : "Nenhum stop atingido nos níveis manuais"}</small>
      </div>
      <div><dt>Tentativas bloqueadas pelas regras</dt>
        <dd>{failed || !blocks?.sessions ? "—" : blocks.count}</dd>
        <small>{failed ? "Falha ao carregar as tentativas" : !blocks ? "Carregando sessões…" :
          blocks.sessions ? `Em ${blocks.sessions} sessões concluídas` : "Nenhuma sessão concluída"}</small>
      </div>
    </dl>
  </section>;
}
