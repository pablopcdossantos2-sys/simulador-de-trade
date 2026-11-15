import { useEffect, useState } from "react";
import { InfoTip } from "./InfoTip";
import {
  prepareProfitReplayFile,
  type ProfitPreparationProgress,
  type ProfitPreparationResult,
} from "../services/profitData";

function readableError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    if (message.trim()) return message;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
  } catch {
    // Mantém a mensagem alternativa se o erro não puder ser serializado.
  }
  return fallback;
}

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
      operationId: "",
      percent: 0,
      bytesProcessed: 0,
      bytesTotal: 0,
      sourceRows: 0,
      keptRows: 0,
    });
    setMessage(
      `Tratando o arquivo e preservando os dados entre ${sessionStart} e ${sessionEnd}...`,
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
        readableError(error, "Falha ao tratar o arquivo. Consulte os detalhes técnicos."),
      );
    }
  }

  return (
    <section className="data-preparation card">
      <div className="section-heading data-heading">
        <div>
          <h2>Preparar arquivo para replay</h2>
        </div>
        <span className="session-window">{sessionStart} → {sessionEnd}</span>
      </div>

      <div className="data-preparation-help">
        <InfoTip label="Formato dos arquivos aceitos">
          Exporte do Profit as colunas Ativo/Contrato, Data, Hora, Abertura, Máxima, Mínima, Fechamento e Quantidade. Se houver Volume Financeiro e Quantidade, o sistema utiliza Quantidade. O replay M2 gera uma trajetória sintética dentro de cada candle; não representa negócios históricos tick a tick. Arquivos antigos de negócios individuais continuam aceitos para compatibilidade.
        </InfoTip>
      </div>

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
            <span>{result.dataMode === "CANDLES_M2_SYNTHETIC" ? "Candles M2 preservados" : "Negócios preservados"}</span>
            <strong>{result.keptRows.toLocaleString("pt-BR")}</strong>
          </div>
          <div>
            <span>{result.dataMode === "CANDLES_M2_SYNTHETIC" ? "Candles M2 fora da janela" : "Negócios descartados"}</span>
            <strong>{(result.dataMode === "CANDLES_M2_SYNTHETIC" ? result.discardedOutsideWindowRows : result.discardedRows).toLocaleString("pt-BR")}</strong>
          </div>
          {result.dataMode === "CANDLES_M2_SYNTHETIC" && result.sourceTimeframeMinutes === 1 && (
            <div>
              <span>Candles M1 incompletos descartados</span>
              <strong>{result.incompleteM1CandlesDropped.toLocaleString("pt-BR")}</strong>
            </div>
          )}
          <div>
            <span>Redução do arquivo</span>
            <strong>{result.reductionPct.toFixed(1)}%</strong>
          </div>
          <div>
            <span>Formato de replay</span>
            <strong>{result.dataMode === "CANDLES_M2_SYNTHETIC" ? "OHLCV M2 · movimento sintético" : "Negócios tick a tick · legado"}</strong>
          </div>
          <div className="result-path">
            <span>Arquivo gerado</span>
            <strong>{result.outputPath}</strong>
          </div>
        </div>
      )}

      <div className="data-footnote">
        <InfoTip label="Sobre a faixa de horário">
          O horário inicial é inclusivo e o horário final é exclusivo. O planejador indicará também os dados anteriores necessários para aquecer o indicador.
        </InfoTip>
      </div>
    </section>
  );
}
