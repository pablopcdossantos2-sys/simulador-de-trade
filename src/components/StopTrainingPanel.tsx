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
  startingBalanceBRL: number | null;
  enabled: boolean;
  trainingActive: boolean;
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

function marketPrice(value: number, asset: Asset): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: asset === "WDOFUT" ? 1 : 0,
    maximumFractionDigits: asset === "WDOFUT" ? 1 : 0,
  }).format(value);
}

function clock(value: string | null): string {
  if (!value) return "horário indisponível";
  const match = value.match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? value;
}

export function StopTrainingPanel({
  asset,
  startingBalanceBRL,
  enabled,
  trainingActive,
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
  const validBalance = startingBalanceBRL !== null && Number.isFinite(startingBalanceBRL) && startingBalanceBRL > 0;
  const initialAdjustments = scenario?.adjustments.slice(0, 6) ?? [];
  const remainingAdjustments = scenario
    ? scenario.adjustments.length > 12
      ? scenario.adjustments.slice(-6)
      : scenario.adjustments.slice(6)
    : [];
  const omittedAdjustmentCount = scenario
    ? Math.max(0, scenario.adjustments.length - initialAdjustments.length - remainingAdjustments.length)
    : 0;
  const remainingAdjustmentOffset = scenario && scenario.adjustments.length > 12
    ? scenario.adjustments.length - 6
    : 6;

  return (
    <section className="stop-training-panel card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Treinamento específico</p>
          <h2>Treinamento de Stops</h2>
        </div>
        <span className={incident ? "stop-training-status violated" : enabled ? "stop-training-status active" : "stop-training-status"}>
          {incident ? "Regra infringida" : enabled ? trainingActive ? "Monitoramento ativo" : "Armado para o próximo treino" : "Não iniciado"}
        </span>
      </div>

      <p className="data-description">
        Treine a preservação do risco planejado. Quando o stop for afastado para aumentar o prejuízo possível, o replay será interrompido e a sessão será examinada em um cenário separado.
      </p>

      {!incident && (
        <div className="stop-training-setup">
          <small>
            Capital: {validBalance
              ? brl.format(startingBalanceBRL)
              : "não configurado em Configurações"}
          </small>
          <small>{fullDayReady ? "Pregão completo disponível." : "Prepare os arquivos M2 completos do pregão na aba Simulador."}</small>
          {!enabled ? (
            <button type="button" className="planner-apply" onClick={() => onEnabledChange(true)} disabled={!configurable || !validBalance || !fullDayReady}>
              Ativar treinamento
            </button>
          ) : (
            <div className="stop-training-enabled-note">
              <p>Ativado para a próxima sessão formal.</p>
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
            O stop original foi preservado e o replay foi pausado. Encerre o Treino disciplinado para liberar a análise hipotética.
          </p>
          {configurable && (
            <button type="button" className="secondary" onClick={onDismissIncident} disabled={analysisLoading}>{analysisLoading ? "Aguardando análise..." : "Concluir análise e liberar novo treinamento"}</button>
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
            <div><span>Último stop hipotético</span><strong>{marketPrice(scenario.lastStop, asset)}</strong></div>
            <div><span>Saída hipotética</span><strong>{marketPrice(scenario.exitPrice, asset)}</strong><small>{clock(scenario.exitTimestamp)}</small></div>
          </div>
          <div className="stop-adjustment-history">
            <div className="stop-adjustment-heading">
              <strong>Como o stop teria evoluído</strong>
              <small>{scenario.adjustments.length.toLocaleString("pt-BR")} afastamentos simulados</small>
            </div>
            {scenario.adjustments.length === 0 ? (
              <p className="stop-adjustment-empty">Nenhum novo toque no stop ocorreu antes do alvo ou do fim do período analisado.</p>
            ) : (
              <ol className="stop-adjustment-list">
                {initialAdjustments.map((adjustment, index) => (
                  <li className="stop-adjustment-event" key={`first-${index}-${adjustment.timestamp}`}>
                    <span className="stop-adjustment-number">{index + 1}</span>
                    <div>
                      <strong>{clock(adjustment.timestamp)} · mercado em {marketPrice(adjustment.marketPrice, asset)}</strong>
                      <small>Stop afastado de {marketPrice(adjustment.previousStop, asset)} para {marketPrice(adjustment.nextStop, asset)}</small>
                    </div>
                  </li>
                ))}
                {omittedAdjustmentCount > 0 && (
                  <li className="stop-adjustment-omitted">{omittedAdjustmentCount.toLocaleString("pt-BR")} afastamentos intermediários não exibidos</li>
                )}
                {remainingAdjustments.map((adjustment, index) => (
                  <li className="stop-adjustment-event" key={`last-${index}-${adjustment.timestamp}`}>
                    <span className="stop-adjustment-number">{remainingAdjustmentOffset + index + 1}</span>
                    <div>
                      <strong>{clock(adjustment.timestamp)} · mercado em {marketPrice(adjustment.marketPrice, asset)}</strong>
                      <small>Stop afastado de {marketPrice(adjustment.previousStop, asset)} para {marketPrice(adjustment.nextStop, asset)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
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
