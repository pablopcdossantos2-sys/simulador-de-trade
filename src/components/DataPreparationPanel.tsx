import { useEffect, useState } from "react";
import {
  prepareProfitReplayFile,
  type ProfitPreparationProgress,
  type ProfitPreparationResult,
} from "../services/profitData";

interface Props {
  onPrepared?: (result: ProfitPreparationResult) => void;
  plannedStart?: string;
  plannedEnd?: string;
}

export function DataPreparationPanel({
  onPrepared,
  plannedStart,
  plannedEnd,
}: Props) {
  const [sourcePath, setSourcePath] = useState("");
  const [sessionStart, setSessionStart] = useState("09:00");
  const [sessionEnd, setSessionEnd] = useState("12:00");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState(
    "O arquivo bruto permanece intacto. O sistema gera uma cópia reduzida para replay.",
  );
  const [progress, setProgress] = useState<ProfitPreparationProgress | null>(null);
  const [result, setResult] = useState<ProfitPreparationResult | null>(null);

  useEffect(() => {
    if (plannedStart) setSessionStart(plannedStart);
    if (plannedEnd) setSessionEnd(plannedEnd);
  }, [plannedStart, plannedEnd]);

  async function prepare() {
    const path = sourcePath.trim().replace(/^"(.*)"$/, "$1");
    if (!path) {
      setStatus("error");
      setMessage("Informe o caminho do CSV exportado pelo Profit Ultra.");
      return;
    }

    setStatus("working");
    setResult(null);
    setProgress({
      percent: 0,
      bytesProcessed: 0,
      bytesTotal: 0,
      sourceRows: 0,
      keptRows: 0,
    });
    setMessage(
      `Tratando o arquivo e preservando somente os negócios entre ${sessionStart} e ${sessionEnd}...`,
    );

    try {
      const next = await prepareProfitReplayFile(
        path,
        sessionStart,
        sessionEnd,
        setProgress,
      );
      setResult(next);
      onPrepared?.(next);
      setProgress((current) =>
        current ? { ...current, percent: 100 } : current,
      );
      setStatus("success");
      setMessage("Tratamento concluído. O arquivo bruto não foi modificado.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Falha ao tratar o arquivo.",
      );
    }
  }

  return (
    <section className="data-preparation card">
      <div className="section-heading data-heading">
        <div>
          <p className="eyebrow">Dados históricos · Profit Ultra</p>
          <h2>Preparar arquivo para replay</h2>
        </div>
        <span className="session-window">{sessionStart} → {sessionEnd}</span>
      </div>

      <p className="data-description">
        O tratamento descarta as colunas de instituições/agressão e os negócios
        fora da janela de treino. Permanecem apenas os dados necessários para
        reconstruir o preço, o volume e a sequência do mercado.
      </p>

      <div className="data-window-grid">
        <label>
          Início do período a tratar
          <input
            type="time"
            value={sessionStart}
            onChange={(event) => setSessionStart(event.target.value)}
            disabled={status === "working"}
          />
        </label>
        <label>
          Final do período a tratar
          <input
            type="time"
            value={sessionEnd}
            onChange={(event) => setSessionEnd(event.target.value)}
            disabled={status === "working"}
          />
        </label>
      </div>

      <div className="data-form">
        <label>
          Caminho do CSV bruto do Profit
          <input
            value={sourcePath}
            onChange={(event) => setSourcePath(event.target.value)}
            placeholder={'Ex.: C:\\Dados\\WINV26_TRADES.csv'}
          />
        </label>
        <button type="button" onClick={prepare} disabled={status === "working"}>
          {status === "working" ? "Tratando..." : "Gerar arquivo de replay"}
        </button>
      </div>

      {progress && status === "working" && (
        <div className="preparation-progress" aria-label="Progresso do tratamento">
          <div className="progress-heading">
            <span>
              {progress.sourceRows.toLocaleString("pt-BR")} linhas lidas ·{" "}
              {progress.keptRows.toLocaleString("pt-BR")} preservadas
            </span>
            <strong>{progress.percent.toFixed(1)}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${Math.min(100, progress.percent)}%` }} />
          </div>
        </div>
      )}

      <div className={`data-status ${status}`} aria-live="polite">
        {message}
      </div>

      {result && (
        <div className="preparation-result">
          <div>
            <span>Ativo</span>
            <strong>{result.symbol || "Não identificado"}</strong>
          </div>
          <div>
            <span>Negócios preservados</span>
            <strong>{result.keptRows.toLocaleString("pt-BR")}</strong>
          </div>
          <div>
            <span>Negócios descartados</span>
            <strong>{result.discardedRows.toLocaleString("pt-BR")}</strong>
          </div>
          <div>
            <span>Redução do arquivo</span>
            <strong>{result.reductionPct.toFixed(1)}%</strong>
          </div>
          <div>
            <span>Ordem da fonte</span>
            <strong>{result.sourceOrder}</strong>
          </div>
          <div className="result-path">
            <span>Arquivo gerado</span>
            <strong>{result.outputPath}</strong>
          </div>
        </div>
      )}

      <p className="data-footnote">
        O horário inicial é inclusivo e o horário final é exclusivo. Use nesta
        etapa exatamente a faixa de dados que você pretende preservar; o
        planejador da simulação também indicará os dados extras necessários
        para aquecer o indicador.
      </p>
    </section>
  );
}
