export function TradingSystemsPanel() {
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
          <p className="trading-system-summary">Sistema de contexto multi-timeframe. A base de agregação causal já está sendo preparada para calcular as médias de 15 minutos a partir do replay de 2 minutos, sem utilizar candles futuros.</p>
          <div className="trading-system-indicators">
            <span>Gráfico M2</span><span>Médias M15</span><span>VWAP MTF</span><span>TPV</span><span>ATR e ângulos</span>
          </div>
          <h4>Configuração inicial definida</h4>
          <ul>
            <li>Gráfico principal de 2 minutos e timeframe de contexto de 15 minutos.</li>
            <li>Modo causal, sem lookahead: cada atualização considera somente os candles de 2 minutos já disponíveis naquele ponto do replay.</li>
            <li>Quatro médias EMA, com períodos iniciais 8, 20, 50 e 200; fonte de preço de fechamento e reinício diário.</li>
            <li>VWAP MTF, TPV, filtros de angulação e alinhamento serão incorporados conforme a especificação do indicador.</li>
          </ul>
          <h4>Autorização operacional</h4>
          <ul>
            <li>Fundo verde: autoriza somente operações compradas.</li>
            <li>Fundo vermelho: autoriza somente operações vendidas.</li>
            <li>Fundo cinza: não autoriza novas operações.</li>
            <li>A entrada será posicionada manualmente pelo usuário no gráfico. O sistema não abrirá operações nem criará gatilhos automáticos.</li>
          </ul>
          <p className="trading-system-footnote">A agregação M2 → M15 utiliza candles completos de 2 minutos. Como 2 não divide 15, um candle M2 pode atravessar a fronteira de um candle M15; sem os negócios individuais não é possível repartir seu OHLCV com exatidão. Para preservar a causalidade, ele só é incorporado depois de fechado, podendo atrasar a atualização do contexto em até um candle M2.</p>
        </article>
      </div>
    </section>
  );
}
