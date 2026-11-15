import type { ReplaySessionInfo } from "../services/replayData";
import { InfoTip } from "./InfoTip";

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
  const finished = Boolean(session?.finished);
  const sourceDescription = session?.mode === "CANDLES_M2_SYNTHETIC"
    ? "Replay sintético a partir de candles M2: os preços intermediários são simulados para fins de visualização e não representam negócios/ticks reais."
    : session?.mode === "TICK_LEGACY"
      ? "Replay de negócios tick a tick: os registros de preço e quantidade vêm diretamente do arquivo tratado."
      : null;

  return (
    <section className="replay-controls card replay-load-panel">
      <div className="section-heading replay-heading">
        <div className="replay-load-title">
          <h2>Carregar pregão · M{timeframeMinutes}</h2>
          <InfoTip label="Sobre o replay">Selecione o arquivo M2 completo gerado pelo fluxo de preparação de dados. O arquivo tratado é salvo na mesma pasta do CSV de origem.</InfoTip>
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
            placeholder="Arquivo .replay.csv"
            disabled={playing || trainingActive}
          />
        </label>
        <button type="button" onClick={onLoad} disabled={busy || playing || trainingActive}>
          {busy ? "Carregando..." : "Carregar replay"}
        </button>
      </div>
      {session && sourceDescription && (
        <p className="replay-session-note">
          <strong>{session.symbol}</strong> · {session.asset} — {sourceDescription}
        </p>
      )}
    </section>
  );
}
