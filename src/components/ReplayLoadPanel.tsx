import type { ReplaySessionInfo } from "../services/replayData";

interface Props {
  path: string;
  timeframeMinutes: number;
  onPathChange: (value: string) => void;
  session: ReplaySessionInfo | null;
  playing: boolean;
  busy: boolean;
  trainingActive: boolean;
  onLoad: () => void;
}

export function ReplayLoadPanel({
  path,
  timeframeMinutes,
  onPathChange,
  session,
  playing,
  busy,
  trainingActive,
  onLoad,
}: Props) {
  const finished = Boolean(session?.endTime);

  return (
    <section className="replay-controls card replay-load-panel">
      <div className="section-heading replay-heading">
        <div>
          <p className="eyebrow">Etapa 4 · Carregar replay · M{timeframeMinutes}</p>
          <h2>Arquivo histórico do pregão</h2>
        </div>
        <span className={`replay-status ${finished ? "finished" : session ? "ready" : ""}`}>
          {finished ? "Sessão concluída" : session ? "Arquivo carregado" : "Aguardando arquivo"}
        </span>
      </div>

      <p className="data-description">
        Selecione o arquivo tratado (.replay.csv) preparado na Etapa 3.
        Depois de carregá-lo, inicie a sessão na Etapa 5; os controles para
        reproduzir e avançar o mercado estarão logo abaixo dela.
      </p>

      <div className="replay-load-row">
        <label>
          Arquivo tratado (.replay.csv)
          <input
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            placeholder={'Ex.: C:\\Dados\\WINV26_TRADES_0900-1200.replay.csv'}
            disabled={playing || trainingActive}
          />
        </label>
        <button type="button" onClick={onLoad} disabled={busy || playing || trainingActive}>
          {busy ? "Carregando..." : "Carregar replay"}
        </button>
      </div>
    </section>
  );
}
