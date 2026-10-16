import { useEffect, useMemo, useState } from "react";
import {
  buildStudentProgress,
  summarizeStudentProgress,
  type StudentProgressPoint,
} from "../domain/studentProgress";
import {
  loadAllTrades,
  loadAllTrainingEvents,
  loadTrainingSessions,
} from "../services/persistence";

interface Props {
  refreshKey: number;
  hidden?: boolean;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function shortDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function TrendLine({
  points,
  selector,
  min = 0,
  max = 100,
}: {
  points: StudentProgressPoint[];
  selector: (point: StudentProgressPoint) => number;
  min?: number;
  max?: number;
}) {
  if (points.length === 0) return null;

  const width = 520;
  const height = 120;
  const pad = 14;
  const values = points.map(selector);
  const dynamicMin = min === max ? Math.min(...values, 0) : min;
  const dynamicMax = min === max ? Math.max(...values, 1) : max;
  const range = Math.max(dynamicMax - dynamicMin, 1);

  const x = (index: number) =>
    pad +
    (index * (width - pad * 2)) /
      Math.max(points.length - 1, 1);
  const y = (value: number) =>
    height -
    pad -
    ((value - dynamicMin) / range) * (height - pad * 2);

  const path = values
    .map((value, index) =>
      `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`,
    )
    .join(" ");

  return (
    <svg
      className="student-progress-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Evolução ao longo das sessões"
    >
      <line
        x1={pad}
        x2={width - pad}
        y1={height - pad}
        y2={height - pad}
        className="progress-axis"
      />
      <path d={path} className="progress-line" />
      {values.map((value, index) => (
        <circle
          key={points[index].sessionId}
          cx={x(index)}
          cy={y(value)}
          r="4"
          className="progress-dot"
        />
      ))}
    </svg>
  );
}

export function StudentProgressPanel({
  refreshKey,
  hidden = false,
}: Props) {
  const [points, setPoints] = useState<StudentProgressPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      loadTrainingSessions(),
      loadAllTrainingEvents(),
      loadAllTrades(),
    ])
      .then(([sessions, events, trades]) => {
        if (!active) return;
        setPoints(buildStudentProgress(sessions, events, trades));
        setError(null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const summary = useMemo(
    () => summarizeStudentProgress(points),
    [points],
  );
  const recent = points.slice(-10);
  const rValues = recent.map((point) => point.totalR);
  const minR = Math.min(...rValues, 0);
  const maxR = Math.max(...rValues, 1);

  return (
    <section className="student-progress card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Evolução histórica</p>
          <h2>Desenvolvimento do trader</h2>
        </div>
        <span className="history-count">
          {summary.sessions} sessões concluídas
        </span>
      </div>

      {hidden ? (
        <div className="exam-lock">
          <strong>Painel oculto durante o Modo Prova</strong>
          <span>
            O histórico de desempenho volta a aparecer quando a prova atual
            for encerrada.
          </span>
        </div>
      ) : error ? (
        <div className="data-status error">{error}</div>
      ) : points.length === 0 ? (
        <p className="empty-state">
          Conclua sessões de treino para formar a série histórica.
        </p>
      ) : (
        <>
          <div className="student-progress-kpis">
            <div>
              <span>Aderência média</span>
              <strong>{summary.averageAdherencePct.toFixed(1)}%</strong>
            </div>
            <div>
              <span>Aderência aos sinais</span>
              <strong>{summary.averageSignalAdherencePct.toFixed(1)}%</strong>
            </div>
            <div>
              <span>Win rate médio</span>
              <strong>{summary.averageWinRatePct.toFixed(1)}%</strong>
            </div>
            <div>
              <span>Resultado acumulado</span>
              <strong>{summary.totalR.toFixed(2)} R</strong>
            </div>
            <div>
              <span>Líquido acumulado</span>
              <strong>{formatBRL(summary.netResultBRL)}</strong>
            </div>
            <div>
              <span>Bloqueios</span>
              <strong>{summary.blockedAttempts}</strong>
            </div>
            <div>
              <span>Problemas técnicos</span>
              <strong>{summary.technicalIssues}</strong>
            </div>
          </div>

          <div className="student-progress-charts">
            <article>
              <div className="training-timeline-heading">
                <strong>Aderência por sessão</strong>
                <span>últimas {recent.length}</span>
              </div>
              <TrendLine
                points={recent}
                selector={(point) => point.adherencePct}
                min={0}
                max={100}
              />
            </article>

            <article>
              <div className="training-timeline-heading">
                <strong>Resultado em R por sessão</strong>
                <span>últimas {recent.length}</span>
              </div>
              <TrendLine
                points={recent}
                selector={(point) => point.totalR}
                min={minR}
                max={maxR}
              />
            </article>
          </div>

          <div className="student-progress-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Ativo</th>
                  <th>Modo</th>
                  <th>Trades</th>
                  <th>Aderência</th>
                  <th>Sinais</th>
                  <th>R</th>
                  <th>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {recent
                  .slice()
                  .reverse()
                  .map((point) => (
                    <tr key={point.sessionId}>
                      <td>{shortDate(point.tradeDate)}</td>
                      <td>{point.asset}</td>
                      <td>{point.mode === "EXAM" ? "Prova" : "Treino"}</td>
                      <td>{point.trades}</td>
                      <td>{point.adherencePct.toFixed(1)}%</td>
                      <td>{point.signalAdherencePct.toFixed(1)}%</td>
                      <td
                        className={point.totalR >= 0 ? "positive" : "negative"}
                      >
                        {point.totalR.toFixed(2)}
                      </td>
                      <td
                        className={
                          point.netResultBRL >= 0 ? "positive" : "negative"
                        }
                      >
                        {formatBRL(point.netResultBRL)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
