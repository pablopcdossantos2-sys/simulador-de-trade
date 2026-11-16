# Tutorial de validação humana — Simulador de Trading (WINFUT e WDOFUT)

**Objetivo:** conferir o aplicativo **na prática**, no Windows e no Profit Ultra, sem repetir os testes automáticos já concluídos. Não é necessário instalar Git, Node.js ou Rust nem abrir um terminal.

**Importante:** os CSVs foram exportados do Profit Ultra, fonte de dados de mercado. Não altere nenhum CSV original. Um pregão pode ter seu primeiro negócio depois da abertura programada ou não possuir registros em algum minuto; **não crie candles para preencher esses períodos**. A proveniência do CSV, por si só, não comprova se o Profit chama o timestamp de abertura ou de fechamento do candle: essa convenção precisa de uma única conferência visual.

## Etapa 1 — Separar os arquivos para o teste

1. No computador Windows, crie uma pasta de trabalho, por exemplo `Documentos\Teste Simulador`.
2. Coloque nela **cópias**, não os únicos originais, destes quatro CSVs reais exportados pelo Profit Ultra:
   - `WINFUT_F_0_1min_03-11-2026_03-11-2026.csv` — histórico anterior para aquecimento.
   - `WINFUT_F_0_1min_04-11-2026_04-11-2026.csv` — pregão-alvo com início observado às **09:03** e último M1 às **18:24**.
   - `WDOFUT_F_0_1min_03-11-2026_03-11-2026.csv` — aquecimento.
   - `WDOFUT_F_0_1min_04-11-2026_04-11-2026.csv` — pregão-alvo de **09:00** até **18:29** no M1.
3. Se os arquivos estão na Biblioteca do ChatGPT, salve cópias no Windows antes de iniciar. Não é necessário compartilhá-los publicamente.
4. **Não edite** horários, ordenação, vírgulas/pontos de valores ou quantidade de contratos.

## Etapa 2 — Obter uma versão de teste para Windows

A criação de executáveis é **sob demanda**, não acontece a cada commit.

1. Entre em https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions .
2. Selecione o workflow **Windows packaging (on demand)**.
3. Caso ainda não exista um artefato de teste da `main` atual, clique em **Run workflow** → selecione **main** → **Run workflow**. A página do GitHub exibirá a situação da execução.
4. Após o status **Success**, abra a execução e procure, no final da página, **Artifacts**.
5. Baixe `simulador-de-trade-windows-x64`, descompacte o ZIP e encontre:
   - `Simulador-de-Trade-Portable.exe`
   - `Simulador-de-Trade-Instalador.exe`
   - `SHA256SUMS.txt` (somas de integridade).
6. Para o primeiro teste, abra o **Portable.exe** com dois cliques. O **Instalador.exe** deve ser testado depois.
7. Se o Windows solicitar confirmação de confiança/SmartScreen por ser binário não assinado, confira primeiro se foi obtido do workflow do repositório correto. Nunca ignore um aviso para arquivos de origem desconhecida.
8. Se aparecer erro do **Microsoft WebView2**, registre a mensagem; o instalador pode ser a alternativa apropriada.

**Não existe necessidade de publicar uma release** só para fazer estes testes.

## Etapa 3 — Importar o WINFUT sem omitir o fechamento oficial

1. Abra o simulador e localize **Planejar simulação**.
2. Selecione **WINFUT**, data **04/11/2026**, timeframe **M2** e clique em **Usar pregão completo**.
3. Confira que o período programado aparece como **09:00–18:25**. É a janela normal da B3 em novembro, não uma promessa de que existam candles em todos os minutos.
4. Em **Dados do pregão**, para o histórico anterior de **03/11**, selecione **M1** e escolha o CSV WIN do dia 03. Clique **Preparar replay**.
5. Repita para o pregão-alvo **04/11**, selecionando **M1** e o CSV WIN do dia 04.
6. Aguarde o tratamento e a atualização do **catálogo**. Para 04/11, a interface deve indicar **Disponível com observação**: início real às **09:03**, não 09:00. Isso **não deve bloquear** o uso.
7. Inicie o replay pelo plano e confirme:
   - o primeiro candle/segundo reproduzido corresponde ao primeiro registro real, não a um 09:00 inventado;
   - o último minuto M1 disponível é o de **18:24**, com observações sintéticas só até **18:24:59** se reproduzido integralmente;
   - o replay M2 pode não ter uma última barra completa de 18:24–18:26, pois faltaria um segundo M1. Isso **não é motivo para inventar dados**;
   - os candles de aquecimento não aparecem na parte visível do gráfico.
8. Anote se algum botão impedir a simulação apenas por causa do início às 09:03.

## Etapa 4 — Repetir com o WDOFUT

1. Em **Planejar simulação**, selecione **WDOFUT** e **04/11/2026**; a janela deverá ser **09:00–18:30**.
2. Use os CSVs WDO de 03 e 04/11, escolhendo **M1** e preparando um de cada vez.
3. Confira o catálogo, carregue o replay, reproduza e verifique se o primeiro M1 é o de **09:00** e o último é o de **18:29**.
4. Alterne para WIN e volte ao WDO: os arquivos já catalogados não precisam ser importados novamente, salvo se mudarem de pasta ou se a janela de preparação for diferente.

## Etapa 5 — Conferir UMA vez a convenção de horário do Profit

Essa verificação **exige avaliação humana**, porque o cabeçalho `Hora` do CSV não informa se representa o instante inicial ou final do candle.

1. Abra **Profit Ultra** no mesmo pregão/ativo e selecione o gráfico **M1**.
2. Localize o candle de **09:03 de 04/11/2026 do WINFUT**; use o cursor/crosshair ou janela de dados para ver o timestamp e OHLC.
3. No CSV original WIN 04/11, procure a linha **04/11/2026;09:03:00** (o formato possui outras colunas na mesma linha).
4. Compare o OHLC e observe se o Profit nomeia aquele candle pelo minuto **em que começa** ou pelo minuto **em que fecha**. Não basta apenas ver o rótulo: verifique, se possível, o período temporal coberto no gráfico ou a orientação oficial da plataforma.
5. Repita a verificação com um horário comum do **WDO** no mesmo dia, como 09:00 ou 09:01.
6. Registre: **Ativo, data, linha do CSV, rótulo no gráfico e indicação “abertura/fechamento/incerto”**. Se não for conclusivo, marque **incerto**: não ajuste timestamps por suposição.
7. Se houver divergência, salve uma captura do gráfico e algumas linhas do CSV para permitir correção do parser.

## Etapa 6 — Conferir os controles e as operações

Para cada ativo:

1. Inicie o replay, dê **Pausa**, avance **+1 segundo** e **+1 candle**, mude a velocidade e volte a reproduzir.
2. Reinicie o replay; verifique se o mesmo período gera a mesma trajetória sintética e não duplica quantidade.
3. Veja se operações **sem sinal** são recusadas; abra uma operação apenas com sinal autorizado e OCO válido, respeitando risco/retorno mínimo 1:2.
4. Verifique encerramento por **stop** e por **alvo**. Se ambos puderem ocorrer dentro do mesmo candle, o resultado é de um **caminho sintético**, não de negociação histórica tick a tick.
5. Confira saldo/resultado líquido, quantidade de contratos, custos, slippage e relatório da sessão.
6. Finalize uma sessão, feche e reabra o aplicativo. Confira se o histórico permanece.
7. Exporte um backup, verifique os arquivos JSON/CSV do relatório e teste a restauração **somente em uma cópia de teste**, sem arriscar seus dados pessoais.

## Etapa 7 — Conferir o indicador com TradingView

1. Abra no TradingView o **mesmo ativo, data e timeframe M2**, com histórico anterior disponível.
2. Use o **Pine Script original** do repositório, `reference/TV-Ind-Nuvem-Multi-Medias.pine`, e parâmetros **MME 8, MMP 20, MME 52, VWAP Session**.
3. Compare pelo menos **3 candles M2 fechados** (no início, no meio e no final do período visível) quanto às médias e aos sinais.
4. Compare o **mesmo contrato/série**; `WINFUT` e `WDOFUT` contínuos não informam o vencimento exato. Alimentadores de dados diferentes também podem produzir OHLCV/VWAP diferentes.
5. Para cada divergência, anote **ativo, data, horário, valor Profit, valor simulador, valor TradingView e capturas**. Não precisa conferir todas as centenas de barras.

## O que enviar para concluir a validação

Anote os resultados neste formato, mesmo que todos sejam aprovados:

| Verificação | WIN | WDO | Observações |
|---|---|---|---|
| Aplicativo abriu no Windows | OK / FALHOU | OK / FALHOU | |
| CSV M1 importou e catálogo liberou | | | |
| Início/fim reais preservados | | | |
| Pausar, avançar, reiniciar | | | |
| Sinais e ordens OCO | | | |
| Indicadores versus TradingView | | | |
| Relatório, backup e reabertura | | | |

Para qualquer **FALHOU**, envie a mensagem de erro exata, a etapa do roteiro e, se possível, uma captura de tela. Não envie dados sensíveis do Windows ou contas de corretoras.

## O que NÃO é necessário solicitar ao usuário

- Repetir a auditoria estrutural dos 18 CSVs ou os testes Rust/TypeScript que já passaram na CI.
- Corrigir manualmente os 09:03 do WIN ou fabricar registros para 09:00.
- Instalar Rust/Node/Git para validar a aplicação desktop.
- Comprar serviços de dados, certificados de assinatura ou publicar na Microsoft Store.

**Fontes sobre a janela WIN:** B3, Ofício Circular 055/2026-VNC de 29/10/2026 (grade em vigor de 03/11/2026) e 005/2026-PRE de 24/02/2026 (grade em vigor de 09/03/2026). O WIN normalmente encerra às 18:25; o contrato vincendo pode encerrar às 18:00 no dia de vencimento.

## Conferência visual rápida após correção do gráfico e do ícone de ajuda

**Somente após atualizar o executável.** Os testes completos anteriores foram informados como aprovados pelo usuário em 15/11/2026; não é necessário repeti-los por causa destas duas correções de interface.

1. Abra a versão atual da `main` no Windows. Se o binário ainda for antigo, gere um novo artefato no workflow **Windows packaging (on demand)** conforme a Etapa 2. Não é necessário criar release.
2. Acesse **Simulador** e carregue qualquer replay WINFUT ou WDOFUT que já esteja preparado (ou o modo de demonstração).
3. Confira a legenda e o gráfico da estratégia **Multi Médias — Nuvem e Sinais**: devem aparecer **somente MMP 20, VWAP, MME 8, MME 52 e Volume**; nenhuma linha, legenda, painel ou readout **M15 MME 8/20/50/200** deve aparecer.
4. Passe o mouse sobre as médias, amplie e reduza o gráfico. O zoom vertical não deve se afastar artificialmente por causa de médias M15 ocultas.
5. Observe os ícones de informação (`i`) do gráfico e dos painéis. O ponto e a haste devem permanecer **centralizados dentro da borda circular**. Abra e feche um deles para verificar que o texto de ajuda continua acessível.
6. Repita a conferência do ícone no **modo claro, modo escuro e gráfico maximizado**.
7. Se houver algum problema, envie somente a captura da tela e indique a etapa desta seção. Não é necessário repetir a auditoria dos CSVs ou a validação de operações/backup já concluída.

**Observação:** o cálculo das médias M15 do futuro Sistema 02 permanece disponível no código e nos testes próprios; ele apenas não é mais executado nem desenhado no gráfico do Sistema 01.


## Novo teste dirigido — escolha de estratégias e confluência M15 (beta)

**Esse roteiro substitui a repetição de toda a validação anterior**: os testes do Sistema 01 informados como aprovados não precisam ser refeitos integralmente.

1. **Atualizar o aplicativo:** acesse https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions ; escolha **Windows packaging (on demand)** e **Run workflow → main**. Essa etapa gera binários atuais sob demanda; um pacote antigo não contém a seleção de estratégias. Ao terminar com sucesso, baixe **Artifacts → simulador-de-trade-windows-x64** e descompacte. Não é necessário instalar Git ou Node.

2. **Escolher sistema 01:** na aba **Simulador**, selecione **01 — Multi Médias · Nuvem e Sinais**. Use um replay já preparado ou volte à demonstração. Observe somente MME 8, MMP 20, MME 52, VWAP e Volume; não devem aparecer curvas M15. As regras de sinal e reentrada MME52 devem permanecer como antes.

3. **Alternar para o sistema 02:** finalize qualquer treino/posição, escolha **02 — MMs MTF + Angulação (beta)**. O simulador deve descarregar o replay anterior e solicitar novo plano, sem apagar os CSVs catalogados. Uma troca durante treino ativo ou posição aberta deve estar indisponível.

4. **Planejar um alvo que possua dois pregões anteriores:** selecione **WDOFUT, 05/11/2026**, período **M2**. O plano deverá apresentar **450 candles de aquecimento**, exigindo os CSVs de **03/11/2026** e **04/11/2026**, além do alvo **05/11/2026**. Selecione **M1** ao preparar os CSVs originais do Profit Ultra; o sistema os converte/agrega sem inventar candles ausentes.

5. **Conferir os gráficos:** inicie o replay com sistema 02. A legenda deve mostrar **M15 MME 8, 20, 50 e 200** mais **VWAP M15**, sem MMP20/MME52 próprias do sistema 01. As linhas e a escala de preços não devem se confundir entre estratégias. O painel M15 mostra VWAP, ATR e estado do TPV.

6. **Observar o fundo e testar uma entrada:** quando o fundo estiver **cinza** (ou não houver alinhamento/dados suficientes), tente comprar ou vender: a entrada deve ser bloqueada. Quando estiver **verde**, apenas compra manual poderá passar; quando **vermelho**, apenas venda manual. O usuário deve posicionar/confirmar a entrada: a estratégia não abre posições automaticamente. Mesmo com autorização, OCO e risco/retorno mínimo 1:2 são exigidos.

7. **Comparar com o Pine original:** no TradingView, aplique **Indicador_v13_alinhamento_total.txt**, M15 para médias/VWAP/TPV, e compare pelo menos 5 instantes após as primeiras 50 barras M15. Registre **data, candle, MME8, MME20, MME50, MME200, VWAP, ATR, TPV e cor do fundo**. Use o mesmo ativo/série e quantidade negociada dos CSVs. Se houver diferenças, anote se são de **fronteira M2→M15**, diferença de histórico inicial ou outra origem. Não assuma equivalência exata.

8. **Conferir persistência:** finalize a sessão, abra **Resultados**, verifique se a estratégia aparece na sessão e no CSV da operação. Faça um backup e confira no JSON que a sessão contém **strategyId: MTF_ANGULACAO**; após reabrir o programa, o sistema anteriormente escolhido deve continuar selecionado. Teste importação/restauração somente com uma cópia de segurança, não no seu histórico principal.

**O que informar em caso de divergência:** etapa, WIN/WDO, data, horário do candle, captura de tela, valor do Pine e valor do simulador. Os arquivos completos de mercado não devem ser publicados no GitHub.
