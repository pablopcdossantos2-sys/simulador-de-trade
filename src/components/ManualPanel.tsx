export function ManualPanel() {
  return (
    <div className="manual-panel card">
      <p className="manual-intro">
        Este manual explica como montar seu acervo de pregões, configurar uma
        estratégia e começar a treinar. Todo o processamento dos CSVs acontece
        no seu computador, sem modificar os arquivos originais do Profit.
      </p>

      <section className="manual-topic">
        <h3>1. Adicionar pregões e replays ao acervo</h3>
        <ol>
          <li>Abra <strong>Pregões e replays</strong> no menu principal. Não é necessário passar pelo Simulador nem criar um plano de treino para importar seus arquivos.</li>
          <li>Em <strong>Preparar arquivo para replay</strong>, clique em <strong>Selecionar CSV</strong> e escolha o arquivo de candles exportado pelo Profit Ultra.</li>
          <li>Selecione o <strong>ativo WINFUT ou WDOFUT</strong> e o <strong>timeframe M1 ou M2</strong> do CSV. Para um CSV com vários dias, preencha <strong>Data específica do pregão</strong>. Sem essa data, será usada a primeira encontrada no arquivo.</li>
          <li>O formulário já sugere a <strong>janela integral do pregão</strong>: em novembro de 2026, WINFUT 09:00–18:25 e WDOFUT 09:00–18:30. Confira os horários e ajuste-os se necessário; o início é inclusivo e o fim exclusivo. Clique em <strong>Preparar e adicionar</strong>.</li>
          <li>Acompanhe o percentual de preparação. Ao concluir, o replay M2 é registrado no catálogo; arquivos M1 também preservam uma versão original M1, catalogada separadamente. Repita o processo para as outras datas que possui.</li>
          <li>Se já tiver um arquivo <strong>.replay.csv</strong> criado pelo programa e seus metadados correspondentes, clique em <strong>Adicionar replay pronto</strong> na lista do acervo, sem prepará-lo novamente.</li>
          <li>Em <strong>Pregões e replays disponíveis</strong>, use <strong>Atualizar lista</strong> para conferir o acervo. Se mover ou apagar arquivos, use <strong>Remover referências ausentes</strong>; isso não apaga os replays válidos.</li>
        </ol>
        <p>O CSV original não é alterado. Os arquivos tratados são mantidos no local de saída usado pelo programa. Ao mudar ou excluir os arquivos no Windows, os replays podem se tornar indisponíveis no catálogo.</p>
      </section>

      <section className="manual-topic">
        <h3>2. Escolher a estratégia e planejar o treinamento</h3>
        <ol>
          <li>Abra <strong>Simulador</strong>. A página mostra resumos compactos das etapas já concluídas. Clique no título de qualquer etapa contraída para revisar ou alterar sua configuração.</li>
          <li>Expanda <strong>Estratégia de treinamento</strong> se quiser alternar entre <strong>01 — Multi Médias · Nuvem e Sinais</strong> e <strong>02 — MMs MTF + Angulação (beta)</strong>. O sistema selecionado fica indicado no resumo.</li>
          <li>Expanda <strong>Configurar médias da estratégia</strong> somente quando desejar alterar os períodos das médias ou, no Sistema 02, ativar ou desativar os filtros de angulação, alinhamento, MMEs, VWAP e TPV. Clique em <strong>Salvar médias e filtros</strong> para aplicar.</li>
          <li>Em <strong>Planejar simulação</strong>, escolha WINFUT ou WDOFUT e a data do pregão. Clique em <strong>Usar pregão completo</strong>.</li>
          <li>O programa calcula o histórico anterior necessário para o aquecimento. Quando o plano estiver aplicado, sua seção é contraída automaticamente, mas pode ser aberta para edição.</li>
        </ol>
        <p>Se a data cair em feriado ou fim de semana da B3, escolha um pregão válido. Com as configurações padrão, o Sistema 01 pede 260 candles M2 anteriores; o Sistema 02 pede 450. Ao modificar períodos ou a participação das médias, o aquecimento pode mudar e o plano deve ser reaplicado. Seus CSVs já catalogados permanecem preservados.</p>
      </section>

      <section className="manual-topic">
        <h3>3. Conferir arquivos do plano e carregar o pregão</h3>
        <ol>
          <li>Expanda <strong>Arquivos disponíveis e preparação do pregão</strong> somente se houver pendências ou se quiser conferir o vínculo entre os arquivos, a data e o contrato.</li>
          <li>O catálogo identifica automaticamente pregões já preparados em <strong>Pregões e replays</strong>. Não é necessário importá-los novamente quando atendem ao plano.</li>
          <li>Se faltar algum CSV, use <strong>Dados do pregão</strong> dentro da etapa: cada linha indica histórico prévio ou pregão-alvo. Clique em <strong>Selecionar CSV</strong>, confira M1/M2 e depois em <strong>Preparar replay</strong>. Um arquivo com várias datas pode servir a várias linhas, desde que cada linha identifique sua própria data.</li>
          <li>Quando todos os arquivos estiverem disponíveis, essa etapa é contraída automaticamente e a seção <strong>Carregar pregão</strong> fica disponível. Clique em <strong>Carregar replay</strong>.</li>
          <li>Após o carregamento, o painel de carga também fica compacto. Escolha <strong>Treino livre</strong> ou <strong>Modo prova</strong> e clique em <strong>Iniciar treino</strong> ou <strong>Iniciar prova</strong>.</li>
        </ol>
        <p>Os candles de histórico prévio alimentam os indicadores, mas permanecem ocultos durante o treinamento. O replay mostra somente os negócios sintéticos ou históricos correspondentes ao pregão selecionado.</p>
      </section>

      <section className="manual-topic">
        <h3>4. Reproduzir, pausar e navegar no gráfico</h3>
        <ul>
          <li>Use os controles para reproduzir ou pausar, alterar a velocidade, avançar um segundo, avançar um candle e reiniciar o replay quando permitido.</li>
          <li>O contador <strong>Fechamento M2</strong> no canto inferior direito do gráfico mostra quanto tempo simulado falta para o candle fechar; fica parado quando o replay está pausado.</li>
          <li>Arraste a área de preços para navegar. Candles, médias, VWAP e nuvens permanecem recortados dentro da região de preços: não devem invadir a área de volume nem a escala dos horários.</li>
          <li>Os volumes ficam na faixa inferior própria. Os horários e o texto <strong>JANELA DE TREINO</strong> permanecem legíveis durante o deslocamento do gráfico.</li>
          <li>No Sistema 02, os dados das quatro médias M15, VWAP, ATR e TPV ficam numa faixa fixa abaixo do OHLCV; mover o mouse altera os valores sem reposicionar o gráfico.</li>
        </ul>
      </section>

      <section className="manual-topic">
        <h3>5. Operar durante o treinamento</h3>
        <ul>
          <li>No <strong>Sistema 01</strong>, a zona e as regras de reentrada pela MME lenta configurada determinam a direção permitida. No <strong>Sistema 02</strong>, os filtros M15 ativados autorizam compra ou venda, sem disparar uma ordem automaticamente.</li>
          <li>Defina as distâncias de stop e alvo em pontos. A relação risco/retorno mínima exigida é de 1:2.</li>
          <li>Você pode posicionar a entrada pelo gráfico e ajustar as linhas de stop e alvo conforme as regras do simulador.</li>
          <li>O replay pausa em situações de decisão relevantes durante o treino. Encerre a sessão quando terminar.</li>
          <li>Não é permitido trocar a estratégia ou seus filtros durante uma sessão ou posição aberta. Após alterar o sistema ou os parâmetros, reaplique o plano e recarregue o replay.</li>
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
        <h3>7. Resultados, evolução, backup e importação</h3>
        <ul>
          <li><strong>Resultados:</strong> consulte operações, histórico e métricas disponíveis. Novas sessões registram os períodos e filtros usados, incluídos em relatórios e backups.</li>
          <li><strong>Evolução do Trader:</strong> acompanhe a evolução dos treinos e dos indicadores de disciplina.</li>
          <li><strong>Configurações:</strong> ajuste custos, slippage, saldos e backups. Em <strong>Modo de importação</strong>, use <strong>Mesclar</strong> para preservar os registros existentes ou <strong>Substituir tudo</strong> para restaurar os dados do backup no lugar dos locais; confirme antes de substituir.</li>
        </ul>
      </section>

      <section className="manual-topic manual-note">
        <h3>Observação sobre a natureza do replay</h3>
        <p>O replay a partir de candles M1/M2 cria trajetórias sintéticas de preço dentro dos candles. Ele não reconstitui negócios históricos tick a tick nem a ordem real das agressões intrabar. Use os resultados para treinamento educacional, não como reprodução exata do mercado.</p>
      </section>
    </div>
  );
}
