import type { ReplaySessionInfo } from "../services/replayData";
import { InfoTip } from "./InfoTip";

interface Props {
  timeframeMinutes: number;
  session: ReplaySessionInfo | null;
  playing: boolean;
  speed: number;
  processed: number;
  currentTimestamp: string | null;
  countdownSeconds?: number | null;
  finished: boolean;
  busy: boolean;
  onPlayPause: () => void;
  trainingActive: boolean;
  locked?: boolean;
  onStep: () => void;
  onStepCandle: () => void;
  onReset: () => void;
  onSpeedChange: (value: number) => void;
}

function countdown(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function clock(timestamp: string | null): string {
  if (!timestamp) return "—";
  // O replay mantém o relógio do pregão; não converta timestamps sem fuso
  // para o fuso configurado no Windows.
  const marketClock = /^(?:\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(timestamp);
  if (marketClock) return `${marketClock[1]}:${marketClock[2]}:${marketClock[3]}`;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ReplayControls({
  timeframeMinutes,
  session,
  playing,
  speed,
  processed,
  currentTimestamp,
  countdownSeconds = null,
  finished,
  busy,
  onPlayPause,
  trainingActive,
  locked = false,
  onStep,
  onStepCandle,
  onReset,
  onSpeedChange,
}: Props) {
  if (!session) return null;

  return (
    <section className="replay-controls card">
      <div className="section-heading replay-heading">
        <div>
          <h2>Controles de reprodução</h2>
        </div>
        <span className={`replay-status ${finished ? "finished" : session ? "ready" : ""}`}>
          {finished ? "Sessão concluída" : session ? "Arquivo carregado" : "Aguardando arquivo"}
        </span>
      </div>

      {session && (
        <>
          <div className="replay-kpis">
            <div>
              <span>Contrato</span>
              <strong>{session.symbol}</strong>
            </div>
            <div>
              <span>Família</span>
              <strong>{session.asset}</strong>
            </div>
            <div>
              <span>{session.synthetic ? "Segundos simulados" : "Negócios processados"}</span>
              <strong>{processed.toLocaleString("pt-BR")}</strong>
            </div>
            <div>
              <span>Horário atual</span>
              <strong>{clock(currentTimestamp)}</strong>
            </div>
            {countdownSeconds !== null && (
              <div className="replay-countdown" aria-live="off">
                <span>Tempo restante do pregão</span>
                <strong>{countdown(countdownSeconds)}</strong>
              </div>
            )}
          </div>

          <div className="replay-buttons">
            <button
              type="button"
              className="replay-primary"
              onClick={onPlayPause}
              disabled={finished || busy || locked}
            >
              {playing ? "Pausar" : "Reproduzir"}
            </button>
            <button
              type="button"
              onClick={onStep}
              disabled={playing || finished || busy || locked}
            >
              {session.synthetic ? "+1 segundo" : "+1 negócio"}
            </button>
            <button
              type="button"
              onClick={onStepCandle}
              disabled={playing || finished || busy || locked}
            >
              +1 candle
            </button>
            <button type="button" onClick={onReset} disabled={busy || trainingActive || locked}>
              Reiniciar
            </button>

            <label className="speed-control">
              Ritmo visual
              <select
                value={speed}
                onChange={(event) => onSpeedChange(Number(event.target.value))}
                disabled={locked}
              >
                {[1, 2, 5, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!trainingActive && (
            <p className="replay-note replay-start-guidance" role="status">
              Inicie o treino para liberar a reprodução e os avanços do replay. A sessão começará novamente do início do pregão selecionado.
            </p>
          )}

          <div className="replay-note replay-note-help">
            <InfoTip label="Como funciona o replay">
              O ritmo controla o relógio do mercado: em 10×, dois minutos simulados correspondem a aproximadamente 12 segundos reais. {session.synthetic
                ? "Cada candle M2 usa os OHLCV históricos como limites e produz uma trajetória pseudoaleatória determinística com 120 preços, um por segundo simulado. A quantidade total do candle é distribuída igualmente entre esses 120 segundos; essa distribuição não representa o fluxo histórico de negócios. Os preços e as quantidades por segundo não são negócios históricos nem reconstruções do fluxo real: são uma hipótese visual e de execução para treinamento."
                : "Este arquivo legado contém eventos de negócios individuais e preserva sua sequência histórica."} O botão +1 candle avança até a próxima fronteira do candle do gráfico ({timeframeMinutes} min), sem revelar o candle seguinte.
            </InfoTip>
          </div>
        </>
      )}
    </section>
  );
}
