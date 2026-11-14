export function ManualPanel() {
  return (
    <div className="manual-panel card">
      <p className="manual-intro">
        Este manual explica o fluxo recomendado para preparar os dados do Profit,
        carregar um pregão e realizar os treinamentos. Os arquivos são processados
        localmente e o CSV original não é alterado.
      </p>

      <section className="manual-topic">
        <h3>1. Preparar uma simulação</h3>
        <ol>
          <li>Abra a aba <strong>Simulador</strong> e escolha o ativo: WINFUT ou WDOFUT.</li>
          <li>O campo <strong>Data do pregão</strong> começa preenchido com a data atual. Você pode escolher outra data quando quiser estudar um pregão anterior.</li>
          <li>Clique em <strong>Usar pregão completo</strong>. O programa calcula quais arquivos são necessários: o pregão-alvo e o histórico anterior usado para aquecer o indicador.</li>
        </ol>
        <p>Se a data atual cair em fim de semana ou feriado da B3, ela não será um pregão válido. Nesse caso, escolha uma data de pregão disponível.</p>
      </section>

      <section className="manual-topic">
        <h3>2. Exportar e selecionar arquivos do Profit</h3>
        <ol>
          <li>No Profit Ultra, exporte os candles do ativo e das datas necessárias em CSV. O formato M1 é aceito e convertido automaticamente para M2; arquivos M2 também são aceitos.</li>
          <li>Na seção <strong>Dados do pregão</strong>, cada linha identifica uma data e sua função: <strong>Histórico prévio</strong> ou <strong>Pregão completo</strong>.</li>
          <li>Em cada linha, clique em <strong>Selecionar CSV</strong> e escolha o arquivo correspondente àquela data. A seleção preenche somente a linha em que você clicou; os demais campos permanecem independentes.</li>
          <li>Se um único CSV contiver várias datas, você pode informar manualmente o mesmo caminho nas linhas correspondentes. O sistema separa os registros pela data solicitada.</li>
          <li>Clique em <strong>Preparar M2</strong> em cada linha ou em <strong>Preparar todos os caminhos informados</strong> depois de preencher os caminhos necessários.</li>
        </ol>
      </section>

      <section className="manual-topic">
        <h3>3. Entender os dois arquivos de replay</h3>
        <p>
          É normal que uma simulação gere mais de um arquivo. O replay do <strong>pregão-alvo</strong>
          contém o dia que será exibido e treinado. O replay do <strong>histórico prévio</strong>
          fornece candles anteriores para estabilizar os cálculos do indicador, especialmente a MME 52.
        </p>
        <p>
          Por exemplo, ao preparar 12/11/2026 e 13/11/2026 para estudar o pregão de 13/11,
          mantenha os dois arquivos no catálogo: 12/11 será usado como histórico prévio
          (oculto durante o treino) e 13/11 será o pregão-alvo. Não junte os dois arquivos.
        </p>
      </section>

      <section className="manual-topic">
        <h3>4. Conferir o catálogo e carregar o pregão</h3>
        <ol>
          <li>Confira a seção <strong>Arquivos disponíveis</strong>. Ela mostra se cada requisito do plano foi atendido e se o ativo/contrato é compatível.</li>
          <li>Quando todos os requisitos estiverem disponíveis, o arquivo do pregão-alvo será selecionado para carregamento. O histórico prévio é carregado como contexto oculto do indicador.</li>
          <li>Na seção <strong>Carregar pregão</strong>, clique em <strong>Carregar replay</strong>. Aguarde a confirmação de que o arquivo foi carregado.</li>
          <li>Escolha <strong>Treino livre</strong> ou <strong>Modo prova</strong> e clique em <strong>Iniciar treino</strong> ou <strong>Iniciar prova</strong>.</li>
          <li>Use os controles para reproduzir, pausar, mudar a velocidade, avançar um segundo ou avançar um candle.</li>
        </ol>
      </section>

      <section className="manual-topic">
        <h3>5. Operar durante o treinamento</h3>
        <ul>
          <li>A direção permitida depende da zona e do sinal do indicador.</li>
          <li>Configure a distância do stop e do alvo em pontos. A relação risco/retorno mínima exigida é de 1:2.</li>
          <li>Você pode posicionar a entrada pelo gráfico e ajustar as linhas de stop e alvo conforme as regras do simulador.</li>
          <li>O replay pausa em situações de decisão relevantes durante o treino. Encerre a sessão quando terminar.</li>
        </ul>
      </section>

      <section className="manual-topic">
        <h3>6. Treinamento de Stops</h3>
        <ol>
          <li>Prepare e carregue um pregão completo na aba Simulador.</li>
          <li>Em <strong>Treinamento de Stops</strong>, configure o saldo inicial em <strong>Configurações</strong>.</li>
          <li>Ative o treinamento antes de iniciar a sessão formal. Se o stop for afastado para aumentar o risco, o simulador interrompe o replay e apresenta a análise do cenário.</li>
        </ol>
      </section>

      <section className="manual-topic">
        <h3>7. Resultados, evolução e configurações</h3>
        <ul>
          <li><strong>Resultados:</strong> consulte operações encerradas, histórico e métricas disponíveis.</li>
          <li><strong>Evolução do Trader:</strong> acompanhe a evolução das sessões e dos indicadores de disciplina.</li>
          <li><strong>Configurações:</strong> ajuste custos, slippage, saldos iniciais dos treinamentos e opções de backup/restauração.</li>
        </ul>
      </section>

      <section className="manual-topic manual-note">
        <h3>Observação sobre a natureza do replay</h3>
        <p>
          O replay M2 cria um percurso sintético de preço dentro de cada candle. Ele não
          reconstitui os negócios históricos tick a tick nem a sequência real de agressões
          intrabar. Use os resultados como ferramenta educacional, não como reprodução
          exata do mercado.
        </p>
      </section>
    </div>
  );
}
