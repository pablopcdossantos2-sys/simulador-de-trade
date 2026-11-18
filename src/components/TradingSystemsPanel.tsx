import type { MovingAverageSettings, TradingStrategyId } from "../types";
import { DEFAULT_MOVING_AVERAGE_SETTINGS, describeMtfVotes } from "../services/strategyMovingAverages";
import { StrategyAveragesPanel } from "./StrategyAveragesPanel";

interface Props {
  selectedStrategyId: TradingStrategyId;
  movingAverages?: MovingAverageSettings;
  disabled: boolean;
  onSelect: (id: TradingStrategyId) => void;
  onSaveStrategy: (settings: MovingAverageSettings, strategyId: TradingStrategyId) => Promise<void>;
}

export function TradingSystemsPanel({ selectedStrategyId, movingAverages = DEFAULT_MOVING_AVERAGE_SETTINGS, disabled, onSelect, onSaveStrategy }: Props) {
  const { emaFastLength, wmaLength, emaSlowLength } = movingAverages.multiMedias;
  return (
    <section className="trading-systems-page">
      <header className="trading-systems-intro card">
        <h2>Sistemas de trading disponíveis</h2>
        <p>Configure e salve cada sistema aqui. Depois, selecione a estratégia desejada e prossiga para o Simulador para treinar com os parâmetros salvos.</p>
      </header>

      <div className="trading-system-grid">
        <article className="trading-system-card card">
          <div className="trading-system-heading">
            <div>
              <span className="trading-system-index">SISTEMA 01</span>
              <h3>Multi Médias — Nuvem e Sinais</h3>
            </div>
            <span className="trading-system-status available">Disponível</span>
          </div>
          <p className="trading-system-summary">Sistema direcional baseado no alinhamento de três médias móveis e na posição do preço em relação à VWAP.</p>
          <div className="trading-system-indicators">
            <span>MME {emaFastLength}</span><span>MMP {wmaLength}</span><span>MME {emaSlowLength}</span><span>VWAP de sessão</span>
          </div>
          <StrategyAveragesPanel strategyId="MULTI_MEDIAS" settings={movingAverages}
            disabled={disabled} onSave={(value) => onSaveStrategy(value, "MULTI_MEDIAS")} />
          <h4>Condições de compra</h4>
          <ul>
            <li>MME {emaFastLength} acima da MMP {wmaLength}, e MMP {wmaLength} acima da MME {emaSlowLength}.</li>
            <li>Candle de alta para iniciar a zona compradora.</li>
          </ul>
          <h4>Condições de venda</h4>
          <ul>
            <li>MME {emaSlowLength} acima da MMP {wmaLength}, e MMP {wmaLength} acima da MME {emaFastLength}.</li>
            <li>Candle de baixa para iniciar a zona vendedora.</li>
          </ul>
          <p className="trading-system-footnote">O sinal é gerado quando uma nova zona direcional começa. A zona permanece ativa enquanto o alinhamento correspondente continuar válido. Os períodos podem ser personalizados no editor desta estratégia, abaixo.</p>
          <button type="button" className="trading-system-select" disabled={disabled}
            onClick={() => onSelect("MULTI_MEDIAS")}>
            {selectedStrategyId === "MULTI_MEDIAS" ? "Ir ao Simulador com este sistema" : "Selecionar e treinar com este sistema"}
          </button>
        </article>

        <article className="trading-system-card card">
          <div className="trading-system-heading">
            <div>
              <span className="trading-system-index">SISTEMA 02</span>
              <h3>MMs MTF + Angulação</h3>
            </div>
            <span className="trading-system-status available">Disponível</span>
          </div>
          <p className="trading-system-summary">Estratégia de confluência causal em M15: quatro MMEs configuráveis, VWAP diária, TPV e alinhamento opcionais. Cada MME pode ser exibida sem participar do cálculo do fundo verde/vermelho.</p>
          <div className="trading-system-indicators">
            <span>Gráfico M2</span><span>Médias M15</span><span>VWAP MTF</span><span>TPV</span><span>ATR e ângulos</span>
          </div>
          <StrategyAveragesPanel strategyId="MTF_ANGULACAO" settings={movingAverages}
            disabled={disabled} onSave={(value) => onSaveStrategy(value, "MTF_ANGULACAO")} />
          <h4>Filtros utilizados na configuração atual</h4>
          <p className="trading-system-footnote">{describeMtfVotes(movingAverages)}</p>
          <h4>Configuração inicial definida</h4>
          <ul>
            <li>Gráfico principal de 2 minutos e timeframe de contexto de 15 minutos.</li>
            <li>Modo causal, sem lookahead: cada atualização considera somente os candles de 2 minutos já disponíveis naquele ponto do replay.</li>
            <li>MMEs de períodos {movingAverages.mtf.periods.join(", ")} em M15. Cada linha possui um controle de visibilidade independente do voto na confluência.</li>
            <li>ATR 14 e limites angulares individuais editáveis (padrões 2°/1°/1,5°/1°). A VWAP diária usa limiar de 1°; o TPV compara seu valor com a média de 50 barras, sem cálculo de desvio.</li>
            <li>O fundo verde/vermelho exige concordância dos critérios habilitados; quando exigido, o alinhamento das médias também deve confirmar a direção.</li>
          </ul>
          <h4>Autorização operacional</h4>
          <ul>
            <li>Fundo verde: autoriza somente operações compradas.</li>
            <li>Fundo vermelho: autoriza somente operações vendidas.</li>
            <li>Fundo cinza: não autoriza novas operações.</li>
            <li>A entrada será posicionada manualmente pelo usuário no gráfico. O sistema não abrirá operações nem criará gatilhos automáticos.</li>
          </ul>
          <p className="trading-system-footnote">M15 aproximado a partir de M2 completo, sem lookahead. A fronteira 2→15 minutos não pode ser repartida exatamente sem M1/ticks; VWAP e TPV também usam OHLCV agregado.</p>
          <button type="button" className="trading-system-select" disabled={disabled}
            onClick={() => onSelect("MTF_ANGULACAO")}>
            {selectedStrategyId === "MTF_ANGULACAO" ? "Ir ao Simulador com este sistema" : "Selecionar e treinar com este sistema"}
          </button>
        </article>
      </div>
    </section>
  );
}
