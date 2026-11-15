export function TradingSystemsPanel() {
  return (
    <section className="trading-systems-page">
      <header className="trading-systems-intro card">
        <h2>Sistemas de trading disponíveis</h2>
        <p>Conheça a lógica, os indicadores e os critérios de cada sistema antes de utilizá-lo nos treinamentos.</p>
      </header>

      <div className="trading-system-grid">
        <article className="trading-system-card card">
          <div className="trading-system-heading">
            <div>
              <span className="trading-system-index">SISTEMA 01</span>
              <h3>Multi Médias — Nuvem e Sinais</h3>
            </div>
            <span className="trading-system-status available">Sistema atual</span>
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
        </article>

        <article className="trading-system-card card">
          <div className="trading-system-heading">
            <div>
              <span className="trading-system-index">SISTEMA 02</span>
              <h3>MMs MTF + Angulação</h3>
            </div>
            <span className="trading-system-status planned">Em implementação</span>
          </div>
          <p className="trading-system-summary">Indicador multi-timeframe que combina até quatro médias configuráveis, VWAP e TPV para classificar o contexto do mercado.</p>
          <div className="trading-system-indicators">
            <span>Até 4 médias</span><span>VWAP MTF</span><span>TPV</span><span>ATR e ângulos</span>
          </div>
          <h4>Características principais</h4>
          <ul>
            <li>Médias SMA, EMA ou WMA, com períodos e tempos gráficos configuráveis.</li>
            <li>Filtros de angulação, alinhamento das médias, posição em relação à VWAP e direção do TPV.</li>
            <li>Fundo e candles em verde, vermelho ou cinza, conforme a unanimidade dos filtros ativos.</li>
            <li>Intensidade visual da tendência em três níveis, conforme a angulação média.</li>
            <li>Opções de fidelidade histórica do TradingView ou cálculo causal, sem olhar o futuro.</li>
          </ul>
          <p className="trading-system-footnote">A especificação deste indicador define estados de contexto (alta, baixa ou neutro), mas não define sinais de entrada, saída ou envio de ordens. Essas regras precisam ser estabelecidas separadamente para o treinamento.</p>
        </article>
      </div>
    </section>
  );
}
