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
          <li>Expanda <strong>Importar e criar arquivo de replay</strong>. Em <strong>Preparar arquivo para replay</strong>, clique em <strong>Selecionar CSV</strong> e escolha o arquivo de candles exportado pelo Profit Ultra.</li>
          <li>Selecione o <strong>ativo WINFUT ou WDOFUT</strong> e o <strong>timeframe M1 ou M2</strong> do CSV. Para um CSV com vários dias, preencha <strong>Data específica do pregão</strong>. Sem essa data, será usada a primeira encontrada no arquivo.</li>
          <li>O formulário já sugere a <strong>janela integral do pregão</strong>: em novembro de 2026, WINFUT 09:00–18:25 e WDOFUT 09:00–18:30. Confira os horários e ajuste-os se necessário; o início é inclusivo e o fim exclusivo. Clique em <strong>Preparar e adicionar</strong>.</li>
          <li>Acompanhe o percentual de preparação. Ao concluir, o replay M2 é registrado no catálogo; arquivos M1 também preservam uma versão original M1, catalogada separadamente. Repita o processo para as outras datas que possui.</li>
          <li>Se já tiver um arquivo <strong>.replay.csv</strong> criado pelo programa e seus metadados correspondentes, clique em <strong>Adicionar replay pronto</strong> na lista do acervo, sem prepará-lo novamente.</li>
          <li>Em <strong>Pregões e replays disponíveis</strong>, use <strong>Atualizar lista</strong> para conferir o acervo. Se mover ou apagar arquivos, use <strong>Remover referências ausentes</strong>; isso não apaga os replays válidos.</li>
        </ol>
        <p>O CSV original não é alterado. Os arquivos tratados são mantidos no local de saída usado pelo programa. Ao mudar ou excluir os arquivos no Windows, os replays podem se tornar indisponíveis no catálogo.</p>
      </section>

      <section className="manual-topic">
        <h3>2. Configurar a estratégia</h3>
        <ol>
          <li>Abra <strong>Sistemas de trading</strong>. Escolha o Sistema 01 (Multi Médias) ou Sistema 02 (MMs MTF + Angulação).</li>
          <li>Expanda <strong>Editar parâmetros da estratégia</strong> no cartão do sistema desejado. Altere períodos das médias; no Sistema 02 também é possível ajustar ângulos, exibição no gráfico e critérios que participam das áreas verdes/vermelhas.</li>
          <li>Clique em <strong>Salvar médias e filtros</strong> e depois selecione o sistema para treinar. A edição é bloqueada durante sessões ou quando existe uma posição aberta.</li>
        </ol>
        <p>Alterar os períodos ou critérios pode modificar a quantidade de histórico necessário para aquecimento. Suas configurações são preservadas localmente e incluídas nos backups JSON do desktop.</p>
      </section>

      <section className="manual-topic">
        <h3>3. Preparar o pregão e seu histórico</h3>
        <ol>
          <li>Na seção <strong>Pregões e replays</strong>, abra <strong>Preparar um pregão e seu histórico</strong>. Escolha o ativo e a data. O catálogo mostra automaticamente os arquivos disponíveis e as pendências.</li>
          <li>O sistema identifica os arquivos já disponíveis e os dias anteriores necessários ao aquecimento da estratégia selecionada.</li>
          <li>Na subseção <strong>Gerar os replays necessários</strong>, confira as pendências. Para cada pregão, selecione o CSV do Profit, informe M1 ou M2 e clique em <strong>Preparar replay</strong>. É possível preparar vários arquivos com o botão <strong>Preparar todos os caminhos informados</strong>.</li>
          <li>Acompanhe a lista <strong>Pregões e replays disponíveis</strong>, que indica os arquivos catalogados e quais dias já estão prontos para a estratégia selecionada.</li>
        </ol>
        <p>O Sistema 01 exige normalmente 260 candles M2 anteriores e o Sistema 02, 450. Esses números podem mudar com as configurações. O aquecimento utiliza apenas candles existentes; o programa não inventa preços para completar horários.</p>
      </section>

      <section className="manual-topic">
        <h3>4. Selecionar o replay no Simulador</h3>
        <ol>
          <li>Em <strong>Simulador → Selecionar replay disponível</strong>, escolha um pregão em <strong>Replays preparados</strong> ou use <strong>Consultar outro dia</strong>. Ao escolher um pregão pronto, o sistema verifica o contrato e o aquecimento e abre o replay automaticamente.</li>
          <li>Se o replay daquele dia não existir ou faltar histórico, o sistema exibirá as pendências e um botão para voltar a <strong>Pregões e replays</strong>, onde os CSVs serão importados e os arquivos gerados.</li>
          <li>Quando aparecer <strong>Replay pronto para treino</strong>, escolha <strong>Treino livre</strong> ou <strong>Modo prova</strong> e inicie a sessão com reprodução imediata ou em pausa.</li>
        </ol>
        <p>O Simulador não importa CSVs nem prepara arquivos. Os candles de aquecimento alimentam os indicadores, mas ficam ocultos; somente o pregão escolhido é reproduzido.</p>
      </section>

      <section className="manual-topic">
        <h3>5. Reproduzir, pausar e navegar no gráfico</h3>
        <ul>
          <li>Use os controles para reproduzir ou pausar, alterar a velocidade, avançar um segundo, avançar um candle e reiniciar o replay quando permitido.</li>
          <li>O contador <strong>Fechamento M2</strong> fica em um painel abaixo do gráfico, ao lado da leitura de preço/horário do cursor. O tempo simulado fica parado quando o replay está pausado.</li>
          <li>Arraste a área de preços para navegar. Candles, médias, VWAP e nuvens permanecem recortados dentro da região de preços: não devem invadir a área de volume nem a escala dos horários.</li>
          <li>Os volumes ficam na faixa inferior própria. Os horários e o texto <strong>JANELA DE TREINO</strong> permanecem legíveis durante o deslocamento do gráfico.</li>
          <li>No Sistema 02, os dados das quatro médias M15, VWAP, ATR e TPV ficam numa faixa fixa abaixo do OHLCV; mover o mouse altera os valores sem reposicionar o gráfico.</li>
        </ul>
      </section>

      <section className="manual-topic">
        <h3>6. Operar durante o treinamento</h3>
        <ul>
          <li>No <strong>Sistema 01</strong>, a zona e as regras de reentrada pela MME lenta configurada determinam a direção permitida. No <strong>Sistema 02</strong>, os filtros M15 ativados autorizam compra ou venda, sem disparar uma ordem automaticamente.</li>
          <li>Defina as distâncias de stop e alvo em pontos. A relação risco/retorno mínima exigida é de 1:2.</li>
          <li>Você pode posicionar a entrada pelo gráfico e ajustar as linhas de stop e alvo conforme as regras do simulador.</li>
          <li>O replay pausa em situações de decisão relevantes durante o treino. Encerre a sessão quando terminar.</li>
          <li>Não é permitido trocar a estratégia ou seus filtros durante uma sessão ou posição aberta. Após alterar o sistema ou os parâmetros, selecione um replay cujo pregão e histórico prévio sejam compatíveis.</li>
        </ul>
      </section>

      <section className="manual-topic">
        <h3>7. Treinamento de Stops</h3>
        <ol>
          <li>Prepare os arquivos na seção Pregões e replays e depois escolha e carregue um replay pronto no Simulador.</li>
          <li>Em <strong>Treinamento de Stops</strong>, configure o saldo inicial em <strong>Configurações</strong>.</li>
          <li>Ative o treinamento antes de iniciar a sessão formal. Se o stop for afastado para aumentar o risco, o simulador interrompe o replay e apresenta a análise do cenário.</li>
        </ol>
      </section>

      <section className="manual-topic">
        <h3>8. Resultados, evolução, backup e importação</h3>
        <ul>
          <li><strong>Resultados:</strong> consulte operações, histórico e métricas disponíveis. Novas sessões registram os períodos e filtros usados, incluídos em relatórios e backups.</li>
          <li><strong>Evolução do Trader:</strong> acompanhe a evolução dos treinos e dos indicadores de disciplina.</li>
          <li><strong>Configurações:</strong> ajuste custos, slippage, saldos e backups. O backup JSON exporta os replays catalogados e as configurações das estratégias. Em <strong>Mesclar</strong>, as preferências das estratégias locais são preservadas; em <strong>Substituir tudo</strong>, as configurações presentes no arquivo são restauradas.</li>
        </ul>
      </section>

      <section className="manual-topic manual-note">
        <h3>Observação sobre a natureza do replay</h3>
        <p>O replay a partir de candles M1/M2 cria trajetórias sintéticas de preço dentro dos candles. Ele não reconstitui negócios históricos tick a tick nem a ordem real das agressões intrabar. Use os resultados para treinamento educacional, não como reprodução exata do mercado.</p>
      </section>
    </div>
  );
}
