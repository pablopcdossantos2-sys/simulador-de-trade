# Simulador de Trade

Aplicativo desktop educacional para treinar execução disciplinada em WINFUT e WDOFUT, com replay histórico, **seleção de duas estratégias**, ordens OCO e análise dos resultados. A estratégia 01 está consolidada; a segunda concluiu a validação humana com o Pine v13 e no Windows.

## Testar a versão atual no Windows

**Não confunda CI aprovada com executável atualizado.** O workflow de instalação é manual; por isso, o [pacote Windows da execução 43781902065](https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions/runs/43781902065) foi compilado do commit **`7446a18`**, anterior à escolha das estratégias e às correções recentes da interface.

Para testar a versão atual, abra [Windows packaging (on demand)](https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions/workflows/windows-build.yml), selecione **Run workflow → Branch: main → Run workflow** e baixe o **artefato dessa nova execução** (não de uma execução antiga).

O pacote atualizado inclui `BUILD-INFO.txt` com o commit completo e o link da compilação. O programa também mostra **Compilação: <sete caracteres>** abaixo do título. Confira que os sete caracteres coincidem com o início do commit registrado no `BUILD-INFO.txt`. Consulte o [guia de instalação](docs/INSTALACAO-WINDOWS.md) para o procedimento ilustrado em texto.

## Organizar seu acervo sem iniciar um treinamento

Na página **Pregões e replays**, importe os CSVs históricos do Profit diretamente, sem passar pela área inicial do Simulador. Use **Selecionar CSV**, escolha o **ativo WINFUT/WDOFUT**, o timeframe real (M1 ou M2) e, se necessário, a **data específica** caso o CSV reúna vários pregões. A janela padrão corresponde ao pregão integral (WIN encerra normalmente às 18:25 após 09/03/2026; WDO às 18:30). Confirme os horários e clique **Preparar e adicionar**. O programa gera os replays e os registra no catálogo, preservando o arquivo bruto. Repita para outras datas.

Se você já tem um arquivo `.replay.csv` gerado pelo sistema com seus metadados, use **Adicionar replay pronto**. A lista pode ser atualizada e referências ausentes removidas sem excluir arquivos existentes.

No **Simulador**, as etapas de estratégia, configuração de médias, planejamento, conferência de arquivos e carregamento aparecem **contraídas quando já estão corretas**; basta clicar no título para revisar. Etapas pendentes são abertas conforme necessário. Ao editar as médias/filtros ou trocar de estratégia, será necessário reaplicar o plano, mas os arquivos preparados permanecem catalogados.

O gráfico usa **recortes independentes para preço e volume**: arrastar os preços verticalmente não faz candles/médias invadirem o histograma de volume, o eixo de horários ou os textos da sessão.

Em **Configurações → Backup e restauração**, o seletor **Modo de importação** foi padronizado com duas opções: **Mesclar** e **Substituir tudo**. Use *Substituir tudo* somente quando desejar trocar os registros locais pelos dados de um backup.

## Personalizar os períodos das médias (ambas as estratégias)

No **Simulador**, escolha o sistema e expanda **Configurar médias da estratégia** (imediatamente acima de **Planejar simulação**). Insira períodos inteiros entre **2 e 300**, em ordem crescente, e clique **Salvar médias**. O botão **Preencher valores padrão** restaura os campos originais; clique em **Salvar médias** para confirmar.

- **Sistema 01 — Multi Médias:** altere os períodos da MME rápida (8), MMP ponderada (20) e MME lenta (52). O sinal de confluência e a reentrada após toque na MME lenta usam **os valores efetivamente salvos**.
- **Sistema 02 — MMs MTF:** altere os quatro períodos das MMEs M15 (8, 20, 50, 200) e escolha individualmente quais participam da cor do fundo. Por padrão as três primeiras votam e a quarta é apenas referência, como no Pine.
- **Filtros opcionais do Sistema 02:** marque/desmarque *Usar angulação no fundo (ATR 14)*, *Usar alinhamento das médias*, *Usar MME N no fundo* (cada uma das quatro), *Usar VWAP diária no fundo* e *Usar TPV no fundo*. Quando a angulação está desligada, as médias podem votar **juntas por alinhamento**, se essa trava estiver ligada; a VWAP não vota. Se nenhum critério participar, nenhuma entrada será autorizada. O ATR é o normalizador da angulação, **não um voto independente**.
- Os valores numéricos dos limiares permanecem os defaults do Pine v13 (MMEs 2°/1°/1,5°/1°; VWAP 1°; TPV 50 barras/0,45 desvio). A tela permite **ligar/desligar critérios**, não modificar essas fórmulas nem o tipo das médias.
- Os períodos e os filtros escolhidos permanecem no mesmo computador após fechar o aplicativo. Cada **nova sessão** salva um snapshot no SQLite e o preserva em backups, relatórios JSON e exportações CSV. Sessões antigas continuam sem snapshot; não é possível atribuir retroativamente uma configuração que não foi registrada.
- A edição é bloqueada durante o treino ou com uma posição aberta. Salvar períodos ou filtros descarrega o replay, invalida o plano de aquecimento e solicita **aplicar novamente o plano**; o catálogo de CSVs não é apagado. O histórico necessário é recalculado conforme as médias participantes mais longas.

## Cronômetro e leitura estável do gráfico

Durante o replay, o canto inferior direito **da área de preços** mostra **Fechamento M2** com contagem regressiva de `02:00` até `00:00`, calculada **exclusivamente a partir do horário de mercado revelado**. Pausar congela a contagem; acelerar o replay acelera a passagem do tempo de mercado. Sem replay carregado, a contagem não é inventada.

Na segunda estratégia, os valores **M15 (quatro MMEs, VWAP, ATR e TPV)** ficam em uma faixa de tamanho reservado **logo abaixo dos valores OHLCV**. A passagem do mouse muda somente os valores, não a altura da barra nem a posição do gráfico. Testar o layout no Windows em diferentes dimensões continua importante.

## Como funciona

O simulador recebe **candles M1 (1 minuto, formato recomendado) ou M2 (2 minutos)** exportados do Profit, sem exigir negócios tick a tick. Ao importar M1, preserva um replay M1 e gera um segundo arquivo M2 agregado; ambos podem ser selecionados automaticamente pelo catálogo. Os candles originais contêm OHLCV: abertura, máxima, mínima, fechamento e quantidade negociada.

Durante a reprodução, um algoritmo cria uma trajetória sintética para os **60 segundos de cada M1** ou **120 segundos de cada M2**. O percurso:

- começa na abertura e termina no fechamento;
- permanece entre a mínima e a máxima do candle de origem;
- visita a máxima e a mínima em instantes variáveis;
- usa uma semente determinística por candle, portanto o mesmo arquivo gera o mesmo percurso sempre que a sessão é reiniciada;
- distribui a quantidade total de forma determinística entre os 120 segundos. Quando a quantidade de origem é inteira, cada segundo recebe uma quantidade inteira de contratos; alguns segundos podem receber zero quando o volume é baixo.

**Importante:** os preços e a distribuição de volume segundo a segundo são sintéticos. Eles não são negócios históricos, não reconstituem a ordem real dos negócios nem o perfil intrabar de volume. Por isso, a VWAP enquanto um candle está em formação também é uma aproximação de treinamento. Quando Stop e Alvo poderiam ter sido atingidos dentro do mesmo candle, o resultado depende do percurso simulado. Os relatórios representam um cenário de treinamento, não uma reprodução tick a tick do mercado.

Arquivos legados de negócios individuais continuam aceitos para compatibilidade, mas o fluxo recomendado é **CSV M1 com o timeframe declarado corretamente**.

## Exportar os dados do Profit

Exporte um CSV de candles M1 (preferencial) ou M2 do Profit, informando o timeframe correspondente ao importar. O arquivo deve conter:

- Ativo ou contrato;
- Data/Hora do candle (ou Data com data e hora juntas, ou Data e Hora separadas);
- Abertura;
- Máxima;
- Mínima;
- Fechamento;
- Volume Quantidade/Quantidade (contratos). Quando o Profit exportar Volume Financeiro e Volume Quantidade, o simulador utiliza Volume Quantidade.

O simulador interpreta o timestamp como **abertura do candle**. Essa convenção ainda precisa de confirmação operacional no Profit; não desloque os horários sem evidência. Use o mesmo contrato/série contínua no aquecimento e no pregão-alvo, observando que a identificação genérica WINFUT/WDOFUT não comprova o vencimento.

Prepare os CSVs em **Pregões e replays**. Ao escolher um pregão pronto no **Simulador**, o catálogo identifica os arquivos compatíveis e carrega o histórico de aquecimento oculto e o pregão-alvo. O aplicativo preserva o CSV bruto do Profit.

## Funcionalidades

- Replay M1 ou M2 com movimento sintético segundo a segundo, controles de velocidade, pausa, avanço de segundo e avanço de candle;
- aquecimento histórico oculto do indicador antes do início do período visível;
- **sistema 01 — Multi Médias · Nuvem e Sinais:** MME 8, MMP 20, MME 52, VWAP e sinais de entrada;
- **sistema 02 — MMs MTF + Angulação:** quatro MMEs M15 (8, 20, 50, 200), ATR 14, VWAP M15 e TPV 50 com autorização direcional verde/vermelha/cinza, sem disparar entradas automáticas;
- seleção da estratégia antes do plano; o sistema 02 requer 450 candles M2 anteriores (normalmente dois pregões), e o sistema 01 mantém 260;
- entradas direcionais condicionadas por sinal e reentrada autorizada pela MME 52;
- ordem OCO obrigatória, risco/retorno mínimo de 1:2, custos e slippage configuráveis;
- stop manual, histórico persistente, notas pós-trade, relatórios e evolução dos resultados; a estratégia selecionada acompanha a sessão e aparece nos relatórios e backups;
- modo claro/escuro, configurações locais e backup/restauração.

## Escolher com qual estratégia treinar

1. Em **Sistemas de trading**, escolha o sistema 01 ou 02.
2. No **Simulador**, selecione um replay pronto. **O sistema 02 pede mais histórico** para aquecer o TPV e as médias M15. Se faltarem dados, prepare os CSVs indicados em **Pregões e replays**.
3. Inicie o treino. No sistema 02, **verde** autoriza apenas compra manual, **vermelho** apenas venda manual e **cinza** bloqueia novas entradas. O OCO e a razão mínima 1:2 continuam obrigatórios.
4. Termine o treino e feche a posição antes de trocar de sistema. Após a troca, selecione um replay para a nova estratégia.

A segunda estratégia não reproduz M15 exato a partir de M2, nem reconstitui negócios intrabar; veja [especificação e limitações](docs/ESTRATEGIA-02-MTF.md). O resultado da validação humana está nos [critérios de aceite](docs/CRITERIOS-DE-ACEITE-V1.md).

## Executar em desenvolvimento

Pré-requisitos: Node.js 20.19+ ou 22.12+ e npm.

```bash
npm ci
npm run dev
```

Para executar o desktop durante o desenvolvimento, instale também Rust, WebView2 e os pré-requisitos do Tauri 2:

```bash
npm run tauri dev
```

No Windows, o instalador e a versão portátil são produzidos pelo GitHub Actions. Consulte o [guia de instalação](docs/INSTALACAO-WINDOWS.md) e o [guia de validação prática](docs/GUIA-VALIDACAO-WINDOWS.md), que orienta a primeira importação dos CSVs M1/M2 do Profit e a conferência do replay. Consulte também o [tutorial humano passo a passo](docs/VALIDACAO-HUMANA-PASSO-A-PASSO.md) e os [critérios objetivos de aceite](docs/CRITERIOS-DE-ACEITE-V1.md).

## Dados e privacidade

Os arquivos de mercado, o catálogo e o banco de operações são processados localmente no aplicativo. O arquivo bruto do Profit permanece intacto; os replays compactos são gravados como arquivos derivados na pasta de origem. Faça backups regulares antes de reinstalar ou trocar de computador.

## Aviso

Este software tem finalidade educacional e de treinamento. Não envia ordens reais para corretoras e não constitui recomendação de investimento.

### Preparar pregões e iniciar treinos

1. Em **Pregões e replays**, importe os CSVs M1/M2 do Profit e gere replays catalogados. Use a preparação guiada para identificar e completar o histórico de aquecimento necessário aos indicadores.
2. Em **Sistemas de trading**, configure e selecione a estratégia.
3. Em **Simulador → Selecionar replay disponível**, escolha um pregão pronto. O replay carrega automaticamente. Quando aparecer **Replay pronto para treino**, escolha o modo e inicie a sessão. Caso faltem arquivos do pregão ou do aquecimento, a interface indica as pendências e oferece um atalho para **Pregões e replays**.

### Disciplina psicológica: níveis de stop e placar

O treino em níveis começa ativado no nível 1. Em **Disciplina · processo de execução**, você pode desativá-lo ou ajustar o capital e o nível antes de iniciar a sessão. O simulador guarda a sua escolha.

- **1 — Automático:** fecha no preço configurado do stop, sem medir tempo de reação. Com o stop inicial e tamanho original, a perda bruta é exatamente 1R.
- **2 — Manual com alerta:** o toque mantém a posição aberta; alerta persistente e botão **SAIR AGORA** executam a saída em um clique no preço atual do replay. O preço continua andando, com cronômetro e excesso de perda em R e BRL.
- **3 — Manual discreto:** mesma execução, somente linha do stop alterada e tempo/custo discretos, sem modal ou som.

A promoção é sugerida após 20 trades do nível com pelo menos 80% bons, e depende de confirmação. É possível retornar aos níveis já desbloqueados entre sessões. O placar usa apenas as operações com disciplina registrada; operações antigas não recebem uma classificação retroativa.

**Regras independentes:** risco máximo de 1% do capital informado, stop nunca afastado, saída manual em até 3 segundos reais após toque (níveis 2/3), sem aumentar posição perdedora. O motor atual impede afastamentos e aumento de posição; essas proteções continuam ativas. A verificação independente registra violações caso uma alteração seja introduzida por outra entrada do domínio. Aproximar o stop/trailing continua permitido. Qualquer falha torna o trade mau, inclusive quando há ganho.

1R mantém o risco geométrico original multiplicado pelo valor do ponto do ativo e contratos iniciais. O custo da demora usa perda **bruta** menos perda planejada; custos operacionais ficam na seção financeira separada. No modo de disciplina, a saída usa o preço simulado observado (ou stop exato no nível 1), sem acrescentar slippage de saída; a execução legada mantém as configurações anteriores. A entrada continua obedecendo aos filtros existentes e à OCO obrigatória.

O primeiro toque é capturado no evento revelado pelo replay; no modo demonstrativo por candle, pela mínima da compra ou máxima da venda, sem reutilizar extremos anteriores à entrada. Tempos real e simulado ficam separados. O cronômetro usa `performance.now()` e não reinicia se o preço voltar. Alvo ou fim de sessão após toque sem clique mantêm R3 violada e atraso nulo. Durante posições com disciplina, os controles de pausa/avanço e velocidade ficam bloqueados para preservar o fluxo contínuo.

Ao carregar um replay, o gráfico mostra todos os candles disponíveis do pregão anterior. Durante o treino, use **Ver pregão anterior completo** para consultá-lo e **Voltar ao replay** para acompanhar o mercado atual.

A seção **Resultados** abre na visão **Simplificada**, com disciplina, execução de stops manuais e tentativas bloqueadas. Selecione **Completa** para consultar gráficos, histórico e resultados financeiros. A escolha fica salva neste computador.

O veredito de disciplina aparece antes do resultado financeiro. Placar: taxa total/últimos 20, sequências, matriz, ranking por regra, excesso positivo de perda dos trades com violação e ganhos de BAD_WIN. Mediana/p90 usam cliques após toque; saídas ausentes contam fora do limite. Custo médio mantém o sinal e usa os trades tocados dos últimos 20 do nível.

Os resultados são salvos nos mesmos trades do **SQLite**, com migração aditiva para esquema 14, e acompanham os backups/relatórios JSON. As preferências de ativação/capital/nível permanecem locais neste computador. Não foram adicionados checklist, pausa após stop, limite diário, diário ou outro replay de análise; as funções anteriores permanecem disponíveis.

Testes: `npm test` e `npm run build`. Novos cenários em `src/domain/discipline.test.ts`; teste de roundtrip SQLite/backup em `src-tauri/src/lib.rs`. A compilação Windows continua pelo workflow **Windows packaging (on demand)** deste repositório.
