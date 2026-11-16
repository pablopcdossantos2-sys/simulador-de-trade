import type { ReplaySessionInfo } from "../services/replayData";
import { InfoTip } from "./InfoTip";

interface Props {
  path: string;
  timeframeMinutes: number;
  session: ReplaySessionInfo | null;
  playing: boolean;
  busy: boolean;
  canLoad: boolean;
  trainingActive: boolean;
  onLoad: () => void;
}

export function ReplayLoadPanel({
  path,
  timeframeMinutes,
  session,
  playing,
  busy,
  canLoad,
  trainingActive,
  onLoad,
}: Props) {
  const finished = Boolean(session?.finished);
  const sourceDescription = session?.mode === "CANDLES_M1_SYNTHETIC"
    ? "Replay sintético a partir de candles M1: são geradas 60 observações por minuto; os preços intermediários são simulados e não representam negócios/ticks reais."
    : session?.mode === "CANDLES_M2_SYNTHETIC"
      ? "Replay sintético a partir de candles M2: os preços intermediários são simulados para fins de visualização e não representam negócios/ticks reais."
      : session?.mode === "TICK_LEGACY"
      ? "Replay de negócios tick a tick: os registros de preço e quantidade vêm diretamente do arquivo tratado."
      : null;

  return (
    <section className="replay-controls card replay-load-panel">
      <div className="section-heading replay-heading">
        <div className="replay-load-title">
          <h2>Carregar pregão · M{timeframeMinutes}</h2>
          <InfoTip label="Sobre o replay">Escolha um pregão na lista de replays preparados. A importação e a criação dos arquivos são feitas exclusivamente em Pregões e replays.</InfoTip>
        </div>
        <span className={`replay-status ${finished ? "finished" : session ? "ready" : ""}`}>
          {finished ? "Sessão concluída" : session ? "Arquivo carregado" : "Aguardando arquivo"}
        </span>
      </div>

      <div className="replay-load-row">
        <label>
          Arquivo do pregão-alvo selecionado pelo catálogo
          <input value={path} readOnly placeholder="Selecione um replay preparado acima" />
        </label>
        <button type="button" onClick={onLoad} disabled={!canLoad || busy || playing || trainingActive}>
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
