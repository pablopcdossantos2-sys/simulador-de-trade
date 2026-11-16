import type { TradingStrategyId } from "../types";

interface Props {
  selectedStrategyId: TradingStrategyId;
  disabled: boolean;
  onSelect: (id: TradingStrategyId) => void;
}

export function TradingSystemsPanel({ selectedStrategyId, disabled, onSelect }: Props) {
  return (
    <section className="trading-systems-page">
      <header className="trading-systems-intro card">
        <h2>Sistemas de trading disponíveis</h2>
        <p>Conheça a lógica, os indicadores e os critérios de cada sistema antes de utilizá-los nos treinamentos.</p>
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
            <span>MME 8</span><span>MMP 20</span><span>MME 52</span><span>VWAP de sessão</span>
          </div>
          <h4>Condições de compra</h4>
          <ul>
            <li>MME 8 acima da MMP 20, e MMP 20 acima da MME 52.</li>
            <li>Candle de alta para iniciar a zona compradora.</li>
          </ul>
          <h4>Condições de venda</h4>
          <ul>
            <li>MME 52 acima da MMP 20, e MMP 20 acima da MME 8.</li>
            <li>Candle de baixa para iniciar a zona vendedora.</li>
          </ul>
          <p className="trading-system-footnote">O sinal é gerado quando uma nova zona direcional começa. A zona permanece ativa enquanto o alinhamento correspondente continuar válido.</p>
          <button type="button" className="trading-system-select" disabled={disabled || selectedStrategyId === "MULTI_MEDIAS"}
            onClick={() => onSelect("MULTI_MEDIAS")}>
            {selectedStrategyId === "MULTI_MEDIAS" ? "Sistema selecionado" : "Treinar com este sistema"}
          </button>
        </article>

        <article className="trading-system-card card">
          <div className="trading-system-heading">
            <div>
              <span className="trading-system-index">SISTEMA 02</span>
              <h3>MMs MTF + Angulação</h3>
            </div>
            <span className="trading-system-status planned">Beta para testes</span>
          </div>
          <p className="trading-system-summary">Estratégia de confluência causal em M15: três médias participantes (8, 20, 50), VWAP ancorada, TPV e alinhamento. A EMA 200 é exibida, mas não vota por padrão.</p>
          <div className="trading-system-indicators">
            <span>Gráfico M2</span><span>Médias M15</span><span>VWAP MTF</span><span>TPV</span><span>ATR e ângulos</span>
          </div>
          <h4>Configuração inicial definida</h4>
          <ul>
            <li>Gráfico principal de 2 minutos e timeframe de contexto de 15 minutos.</li>
            <li>Modo causal, sem lookahead: cada atualização considera somente os candles de 2 minutos já disponíveis naquele ponto do replay.</li>
            <li>MME 8, 20, 50 e 200 em M15; por padrão, a MME 200 não participa da confluência, conforme Pine v13.</li>
            <li>ATR 14 e ângulos das três médias participantes: limiares 2°/1°/1,5°. A VWAP diária usa limiar de 1°, e o TPV usa média de 50 barras e proximidade de 0,45 desvio.</li>
            <li>O fundo verde/vermelho exige todos os votos concordantes e alinhamento estrito das médias; em caso contrário, não há autorização operacional.</li>
          </ul>
          <h4>Autorização operacional</h4>
          <ul>
            <li>Fundo verde: autoriza somente operações compradas.</li>
            <li>Fundo vermelho: autoriza somente operações vendidas.</li>
            <li>Fundo cinza: não autoriza novas operações.</li>
            <li>A entrada será posicionada manualmente pelo usuário no gráfico. O sistema não abrirá operações nem criará gatilhos automáticos.</li>
          </ul>
          <p className="trading-system-footnote">Beta experimental: M15 aproximado a partir de M2 completo, sem lookahead. A fronteira 2→15 minutos não pode ser repartida exatamente sem M1/ticks; VWAP e TPV também usam OHLCV agregado. A validação numérica com o Pine v13 original permanece necessária.</p>
          <button type="button" className="trading-system-select" disabled={disabled || selectedStrategyId === "MTF_ANGULACAO"}
            onClick={() => onSelect("MTF_ANGULACAO")}>
            {selectedStrategyId === "MTF_ANGULACAO" ? "Sistema selecionado" : "Treinar com este sistema (beta)"}
          </button>
        </article>
      </div>
    </section>
  );
}
