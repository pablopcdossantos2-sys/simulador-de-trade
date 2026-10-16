import type { ReplaySessionInfo } from "../services/replayData";

interface Props {
  path: string;
  onPathChange: (value: string) => void;
  session: ReplaySessionInfo | null;
  playing: boolean;
  speed: number;
  processed: number;
  currentTimestamp: string | null;
  finished: boolean;
  busy: boolean;
  onLoad: () => void;
  onPlayPause: () => void;
  trainingActive: boolean;
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
  path,
  onPathChange,
  session,
  playing,
  speed,
  processed,
  currentTimestamp,
  finished,
  busy,
  onLoad,
  onPlayPause,
  trainingActive,
  onStep,
  onStepCandle,
  onReset,
  onSpeedChange,
}: Props) {
  return (
    <section className="replay-controls card">
      <div className="section-heading replay-heading">
        <div>
          <p className="eyebrow">Replay histórico · M2</p>
          <h2>Reprodução negócio a negócio</h2>
        </div>
        <span className={`replay-status ${finished ? "finished" : session ? "ready" : ""}`}>
          {finished ? "Sessão concluída" : session ? "Arquivo carregado" : "Aguardando arquivo"}
        </span>
      </div>

      <div className="replay-load-row">
        <label>
          Arquivo tratado (.replay.csv)
          <input
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            placeholder={'Ex.: C:\\Dados\\WINV26_TRADES_0900-1200.replay.csv'}
            disabled={playing}
          />
        </label>
        <button type="button" onClick={onLoad} disabled={busy || playing}>
          {busy ? "Carregando..." : "Carregar replay"}
        </button>
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
              <span>Negócios processados</span>
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
              disabled={finished || !trainingActive}
            >
              {playing ? "Pausar" : "Reproduzir"}
            </button>
            <button
              type="button"
              onClick={onStep}
              disabled={playing || finished || busy || !trainingActive}
            >
              +1 negócio
            </button>
            <button
              type="button"
              onClick={onStepCandle}
              disabled={playing || finished || busy || !trainingActive}
            >
              +1 candle
            </button>
            <button type="button" onClick={onReset} disabled={busy}>
              Reiniciar
            </button>

            <label className="speed-control">
              Ritmo visual
              <select
                value={speed}
                onChange={(event) => onSpeedChange(Number(event.target.value))}
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
            Todos os negócios são processados na ordem histórica. O multiplicador altera apenas
            o ritmo visual do treino; ele não inventa milissegundos ausentes do arquivo do Profit.
            O botão +1 candle para exatamente na fronteira M2, sem revelar o primeiro negócio
            do candle seguinte.
          </p>
        </>
      )}
    </section>
  );
}
