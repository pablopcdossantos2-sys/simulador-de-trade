import { CandleChart } from "./CandleChart";
import type { Asset, Candle, IndicatorEvaluation, Position } from "../types";
import type { StopWideningScenario } from "../domain/stopWidening";

interface Incident {
  attemptedStop: number;
  previousStop: number;
  marketTimestamp: string | null;
  position: Position;
}

interface Props {
  asset: Asset;
  startingBalance: string;
  onStartingBalanceChange: (value: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onDismissIncident: () => void;
  configurable: boolean;
  fullDayReady: boolean;
  incident: Incident | null;
  analysisLoading: boolean;
  analysisError: string | null;
  candles: Candle[];
  contextCandles: Candle[];
  evaluation: IndicatorEvaluation | null;
  scenario: StopWideningScenario | null;
  scope: "FULL_DAY" | "WINDOW" | null;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function clock(value: string | null): string {
  if (!value) return "horário indisponível";
  const match = value.match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? value;
}

export function StopTrainingPanel({
  asset,
  startingBalance,
  onStartingBalanceChange,
  enabled,
  onEnabledChange,
  onDismissIncident,
  configurable,
  fullDayReady,
  incident,
  analysisLoading,
  analysisError,
  candles,
  contextCandles,
  evaluation,
  scenario,
  scope,
}: Props) {
  const validBalance = Number.isFinite(Number(startingBalance)) && Number(startingBalance) > 0;

  return (
    <section className="stop-training-panel card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Treinamento específico</p>
          <h2>Treinamento de Stops</h2>
        </div>
        <span className={incident ? "stop-training-status violated" : enabled ? "stop-training-status active" : "stop-training-status"}>
          {incident ? "Regra infringida" : enabled ? "Monitoramento ativo" : "Não iniciado"}
        </span>
      </div>

      <p className="data-description">
        Treine a preservação do risco planejado. Quando o stop for afastado para aumentar o prejuízo possível, o replay será interrompido e a sessão será examinada em um cenário separado.
      </p>

      {!incident && (
        <div className="stop-training-setup">
          <label htmlFor="stop-training-balance">Saldo inicial deste treinamento (R$)</label>
          <input
            id="stop-training-balance"
            type="number"
            min="0.01"
            step="0.01"
            value={startingBalance}
            onChange={(event) => onStartingBalanceChange(event.target.value)}
            placeholder="Informe o saldo inicial"
            disabled={!configurable || enabled}
          />
          <small>Não existe saldo padrão. Informe o capital que será usado para avaliar o risco de esgotamento da conta.</small>
          <small>{fullDayReady ? "Pregão completo preparado e pronto para análise." : "Antes de ativar, prepare o arquivo do pregão completo na seção de preparação de dados usando o CSV original."}</small>
          {!enabled ? (
            <button type="button" className="planner-apply" onClick={() => onEnabledChange(true)} disabled={!configurable || !validBalance || !fullDayReady}>
              Ativar treinamento de Stops
            </button>
          ) : (
            <div className="stop-training-enabled-note">
              <p>O afastamento do stop será monitorado durante o próximo treinamento formal.</p>
              <button type="button" className="secondary" onClick={() => onEnabledChange(false)} disabled={!configurable}>Desativar</button>
            </div>
          )}
        </div>
      )}

      {incident && (
        <div className="stop-training-incident" role="alert">
          <strong>Treinamento interrompido: o risco da posição foi aumentado.</strong>
          <span>
            Stop original: {incident.previousStop.toLocaleString("pt-BR")} · tentativa de novo stop: {incident.attemptedStop.toLocaleString("pt-BR")}
          </span>
          <span>Direção: {incident.position.side === "BUY" ? "Compra" : "Venda"} · preço de entrada executado: {incident.position.entry.toLocaleString("pt-BR")}</span>
          <span>Momento da infração: {clock(incident.marketTimestamp)}.</span>
          <p>
            A alteração não foi aplicada à posição real do simulador. O replay foi pausado no instante da tentativa; a análise abaixo é hipotética e não altera o resultado registrado da operação.
          </p>
          {configurable && (
            <button type="button" className="secondary" onClick={onDismissIncident}>Concluir análise e liberar novo treinamento</button>
          )}
        </div>
      )}

      {analysisLoading && (
        <div className="stop-analysis-status" aria-live="polite">
          Carregando o histórico completo e calculando o cenário contrafactual...
        </div>
      )}

      {analysisError && (
        <div className="stop-analysis-status error" role="alert">{analysisError}</div>
      )}

      {scenario && incident && (
        <div className="stop-scenario-results">
          <div className="stop-scenario-heading">
            <div>
              <strong>O que aconteceria se o stop continuasse sendo afastado?</strong>
              <small>{scope === "FULL_DAY" ? "Pregão completo" : "Somente a janela de replay carregada"} · {scenario.processedTrades.toLocaleString("pt-BR")} eventos examinados</small>
            </div>
            <span className={scenario.outcome === "TARGET" ? "positive" : scenario.outcome === "BANKRUPTCY" ? "negative" : ""}>
              {scenario.outcome === "TARGET" ? "Alvo alcançado" : scenario.outcome === "BANKRUPTCY" ? "Saldo esgotado" : "Fim da sessão"}
            </span>
          </div>
          <div className="stop-scenario-grid">
            <div><span>Saldo inicial</span><strong>{brl.format(scenario.startingBalanceBRL)}</strong></div>
            <div><span>Saldo final hipotético</span><strong className={scenario.finalBalanceBRL >= scenario.startingBalanceBRL ? "positive" : "negative"}>{brl.format(scenario.finalBalanceBRL)}</strong></div>
            <div><span>Resultado hipotético</span><strong className={scenario.netResultBRL >= 0 ? "positive" : "negative"}>{brl.format(scenario.netResultBRL)}</strong></div>
            <div><span>Afastamentos adicionais</span><strong>{scenario.widenedTimes}</strong></div>
            <div><span>Risco inicial (1R)</span><strong>{scenario.initialRiskPoints.toLocaleString("pt-BR")} pts</strong></div>
            <div><span>Último stop hipotético</span><strong>{scenario.lastStop.toLocaleString("pt-BR")}</strong></div>
          </div>
          <p className="stop-scenario-note">
            Regra didática aplicada: a partir do stop que você tentou definir, cada novo toque no stop desloca-o mais 1R para longe da entrada, mantendo o alvo original. Os custos e o slippage configurados para a posição são considerados no resultado.
          </p>
          {scenario.outcome === "BANKRUPTCY" && (
            <p className="stop-bankruptcy-warning">
              Nesse cenário, a perda não realizada estimada ultrapassaria o saldo informado antes de o mercado alcançar o alvo. É uma aproximação educacional, não um cálculo de margem, chamada de capital ou liquidação real da corretora.
            </p>
          )}
        </div>
      )}

      {incident && candles.length > 0 && evaluation && (
        <div className="stop-full-session-chart">
          <div className="stop-chart-heading">
            <strong>{scope === "FULL_DAY" ? "Gráfico do pregão completo" : "Gráfico da janela carregada"}</strong>
            <small>{candles.length.toLocaleString("pt-BR")} candles M2 · {asset}</small>
          </div>
          <CandleChart
            candles={candles}
            contextCandles={contextCandles}
            evaluation={evaluation}
            position={null}
            asset={asset}
            entryPlacementEnabled={false}
            fitAllCandles
          />
        </div>
      )}
    </section>
  );
}
