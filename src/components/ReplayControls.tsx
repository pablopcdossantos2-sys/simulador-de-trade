import type { ReplaySessionInfo } from "../services/replayData";

interface Props {
  timeframeMinutes: number;
  session: ReplaySessionInfo | null;
  playing: boolean;
  speed: number;
  processed: number;
  currentTimestamp: string | null;
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

function clock(timestamp: string | null): string {
  if (!timestamp) return "—";
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
          <p className="eyebrow">
Etapa 6 · Reproduzir o mercado · M{timeframeMinutes}
          </p>
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
          </div>

          <div className="replay-buttons">
            <button
              type="button"
              className="replay-primary"
              onClick={onPlayPause}
              disabled={finished || !trainingActive || locked}
            >
              {playing ? "Pausar" : "Reproduzir"}
            </button>
            <button
              type="button"
              onClick={onStep}
              disabled={playing || finished || busy || !trainingActive || locked}
            >
              {session.synthetic ? "+1 segundo" : "+1 negócio"}
            </button>
            <button
              type="button"
              onClick={onStepCandle}
              disabled={playing || finished || busy || !trainingActive}
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

          <p className="replay-note">
            O ritmo controla o relógio do mercado: em 10×, dois minutos simulados correspondem
            a aproximadamente 12 segundos reais. {session.synthetic
              ? "Cada candle M2 usa os OHLCV históricos como limites e produz uma trajetória pseudoaleatória determinística, com até 120 preços por candle M2, um preço por segundo simulado. Esses preços não são negócios históricos nem reconstruções do fluxo real; o caminho é apenas uma hipótese visual e de execução para treinamento."
              : "Este arquivo legado contém eventos de negócios individuais e preserva sua sequência histórica."}
            {" "}O botão +1 candle avança até a próxima fronteira M2, sem revelar o candle seguinte.
          </p>
        </>
      )}
    </section>
  );
}
