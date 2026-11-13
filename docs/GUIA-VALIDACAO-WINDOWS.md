# Guia de validação prática no Windows — Simulador de Trade

Este guia reúne as etapas que dependem do usuário para validar o aplicativo no Windows, com prioridade para a primeira importação de candles M2 do Profit.

## O que precisa ser validado na prática

As principais validações são:

1. abrir o instalador e a versão portátil no Windows;
2. importar CSVs M2 reais do Profit para WINFUT e WDOFUT;
3. confirmar se a data/hora exportada pelo Profit representa a abertura de cada candle M2;
4. comparar o indicador com o TradingView usando o mesmo contrato, pregão e parâmetros.

A validação do timestamp de origem é especialmente importante: o simulador interpreta o timestamp como a **abertura** do candle de dois minutos. Uma amostra real de CSV do Profit permite confirmar essa convenção e ajustar o parser, se necessário.

Assinatura digital, atualizador Tauri e publicação automatizada de releases podem ficar para uma etapa posterior.

## 1. Testar o aplicativo no Windows

### Instalador

Use o instalador Windows disponibilizado nos artefatos do GitHub Actions. Baixe o pacote do workflow mais recente, extraia o conteúdo e execute o arquivo `Simulador-de-Trade-setup.exe`.

Conclua a instalação e confirme se a janela principal abre normalmente. Nenhum terminal é necessário.

### Versão portátil

Use `Simulador-de-Trade-portable.exe`.

1. Crie uma pasta para o aplicativo, por exemplo `C:\Programas Portateis\Simulador de Trade`.
2. Copie o executável portátil para essa pasta.
3. Dê dois cliques no arquivo.
4. Confirme se o programa abre normalmente.

Se a versão portátil indicar ausência do WebView2, teste o instalador.

## 2. Fazer um teste funcional inicial

Antes de importar dados reais:

1. Abra o aplicativo e confirme que a tela de planejamento aparece.
2. Alterne entre WINFUT e WDOFUT.
3. Confira se o timeframe apresentado é M2.
4. Ajuste a data, o horário inicial e o horário final.
5. Abra Configurações e confira custos, slippage e política intrabar.
6. Abra Segurança dos dados e teste a exportação de backup JSON.
7. Confirme se o arquivo de backup foi criado na pasta escolhida.

Se alguma etapa falhar, registre o que foi clicado, o resultado esperado, o que aconteceu e a mensagem de erro. Uma captura de tela ajuda na análise.

## 3. Planejar a primeira simulação

Não comece exportando arquivos aleatoriamente do Profit. Primeiro, configure a simulação no aplicativo.

Exemplo:

```text
Ativo: WINFUT
Pregão: 14/10/2026
Timeframe: M2
Início visível: 09:00
Final visível: 12:00
Aquecimento: Padrão
```

A janela 09:00–12:00 contém 90 candles M2. O aquecimento padrão considera 260 candles anteriores para inicializar adequadamente a MME 52; o modo estrito considera 520.

O planejador informa quais pregões anteriores são necessários. Use essa lista como referência principal, pois ela considera o calendário de pregões incorporado.

## 4. Conferir os contratos

Confira o contrato efetivamente exibido no Profit e mantenha o mesmo contrato nos arquivos usados para aquecimento e no pregão-alvo.

Exemplo:

```text
WINV26
```

Não misture séries diferentes sem uma regra explícita de rolagem. Uma combinação de contratos distintos pode alterar as médias e os sinais.

## 5. Exportar candles M2 no Profit Ultra

O fluxo recomendado não exige negócios tick a tick. Exporte o histórico do gráfico de **2 minutos (M2)**.

O CSV deve conter um cabeçalho que permita identificar:

- Ativo ou Contrato;
- Data/Hora, Timestamp, uma coluna Data que já inclua data e hora, ou Data e Hora em colunas separadas;
- Abertura;
- Máxima;
- Mínima;
- Fechamento;
- Volume Quantidade/Quantidade (contratos).

Exemplo de cabeçalho aceito:

```text
Ativo;Data;Abertura;Máxima;Mínima;Fechamento;Volume Financeiro;Volume Quantidade
```

O sistema também reconhece aliases em inglês, como `Symbol`, `Timestamp`, `Open`, `High`, `Low`, `Close`, `Volume Quantity` e `Quantity`, além de delimitadores vírgula, ponto e vírgula ou tabulação. Quando o arquivo trouxer `Volume Financeiro` e `Volume Quantidade`, o parser escolhe `Volume Quantidade` para alimentar a VWAP.

### Atenção ao horário do candle

O programa espera que o timestamp identifique o início do candle. Por exemplo, o candle que cobre 09:00–09:02 deve ser identificado por 09:00:00. O timestamp precisa estar alinhado à grade M2: minuto par e segundo zero.

Ainda precisamos confirmar essa convenção com um CSV real exportado do Profit na instalação do usuário. Não altere manualmente os horários antes de fazer essa verificação.

### Organização sugerida

Salve um arquivo por pregão e contrato, sem editar o CSV original.

```text
C:\Dados Profit\WIN\2026\
    WINV26_2026-10-13_M2.csv
    WINV26_2026-10-14_M2.csv
```

Os nomes podem ser diferentes; o conteúdo é que determina a data e o contrato.

## 6. Tratar os arquivos dentro do Simulador

Não é necessário usar CMD para importar os arquivos.

1. Abra o Simulador de Trade.
2. Configure o plano.
3. Na área de dados necessários, selecione o CSV M2 da data solicitada.
4. Confirme que o intervalo horário corresponde ao requisito indicado pelo planejador.
5. Clique em Preparar M2 e acompanhe o progresso.
6. Repita para todas as datas exigidas pelo aquecimento e pelo pregão-alvo.

O arquivo bruto do Profit permanece intacto. O simulador cria um replay derivado compacto com uma linha OHLCV por candle.

Exemplo de arquivo preparado:

```text
WINV26_20261014_0900-1200.replay.csv
WINV26_20261014_0900-1200.replay.meta.json
```

Para aquecimento, pode ser necessária uma janela maior, por exemplo 09:00–18:00, conforme o que o planejador solicitar.

## 7. Conferir o catálogo de dados

Depois de preparar os arquivos:

1. Atualize o catálogo.
2. Confira as datas disponíveis.
3. Confira se o contrato é compatível.
4. Verifique se ainda existem dados ausentes.
5. Prossiga somente quando o plano estiver completo.

O arquivo de aquecimento é usado para calcular o estado inicial do indicador, mas seus candles não são desenhados no gráfico. A simulação visível começa apenas na janela do pregão-alvo.

## 8. Executar a simulação

1. Carregue o plano desejado.
2. Selecione o replay compatível no catálogo.
3. Confirme ativo, data, timeframe M2 e horário.
4. Inicie a sessão de treino.
5. Use Reprodução, Pausa, +1 segundo ou +1 candle.
6. Confirme que o gráfico começa apenas no período visível e não mostra os candles de aquecimento.
7. Observe os sinais COMPRA/VENDA.
8. Teste uma tentativa de operação sem sinal e confirme que o sistema bloqueia a entrada.
9. Faça uma operação autorizada com OCO e confirme a lógica de stop/alvo.
10. Ao terminar, confira o relatório, as notas pós-trade e as exportações JSON/CSV.

### Como interpretar o movimento do gráfico

Cada candle M2 histórico é expandido em até 120 preços sintéticos, um por segundo simulado. O percurso começa na abertura, termina no fechamento, permanece entre a mínima e a máxima e é repetível quando a sessão é reiniciada.

**Esses preços não são negócios históricos.** O OHLCV não informa a sequência verdadeira entre abertura, máxima, mínima e fechamento. Portanto, o caminho intrabar é uma hipótese de treinamento; não deve ser usado para afirmar o instante real de um toque de preço.

O volume do candle também é distribuído uniformemente entre os segundos. Assim, a VWAP enquanto o candle está em formação é aproximada e não reproduz a distribuição real de negócios.

Quando stop e alvo estão dentro da faixa do mesmo candle M2, a ordem em que os níveis são tocados depende da trajetória sintética. Interprete esses resultados como cenário de simulação, não como reprodução histórica tick a tick.

## 9. Comparar o indicador com o TradingView

Esta validação depende de uma referência externa conhecida. Use o mesmo ativo/contrato, data, timeframe M2, janela e parâmetros do indicador.

Compare, de preferência em candles fechados:

- MME 8;
- MMP 20;
- MME 52;
- VWAP;
- início e fim das zonas/nuvens;
- candles em que aparecem COMPRA e VENDA.

Se encontrar divergência, registre:

```text
Ativo:
Contrato:
Data:
Horário:
Valor no TradingView:
Valor no Simulador:
Sinal esperado:
Sinal exibido:
```

Se possível, envie capturas dos dois gráficos no mesmo ponto. A comparação poderá gerar fixtures de regressão para o indicador.

## 10. Repetir o teste para WDOFUT

Depois de validar WINFUT:

1. repita o planejamento com WDOFUT;
2. exporte os candles M2 das datas indicadas;
3. use o mesmo contrato nos arquivos de aquecimento e no pregão-alvo;
4. prepare os replays;
5. execute a simulação;
6. compare o indicador com o TradingView.

A importação real de WIN e WDO só deve ser considerada plenamente validada depois desses testes com CSVs da instalação do usuário.

## 11. CMD — somente para executar o código-fonte

Para usar o instalador ou o executável portátil, não é necessário terminal. Se precisar executar o código localmente, use o Prompt de Comando (CMD), não é necessário alterar a política do PowerShell.

### Abrir o CMD

Pressione `Win + R`, digite `cmd` e pressione Enter.

### Entrar na pasta do projeto

```bat
cd /d "C:\Users\SEU_USUARIO\Documents\simulador-de-trade"
```

### Conferir Node e npm

```bat
node --version
npm --version
```

Se `npm` não funcionar:

```bat
npm.cmd --version
```

### Instalar dependências e executar em desenvolvimento

```bat
npm ci
npm run dev
```

Para abrir a versão desktop pelo Tauri, com os pré-requisitos Rust, WebView2 e Tauri instalados:

```bat
npm run tauri dev
```

### Compilar localmente

```bat
npm run tauri build
```

Se o CMD exigir explicitamente os arquivos `.cmd`, use `npm.cmd ci`, `npm.cmd run dev`, `npm.cmd run tauri dev` ou `npm.cmd run tauri build`.

## 12. O que não precisa ser feito agora

Não é necessário:

- alterar ExecutionPolicy do PowerShell;
- instalar Git apenas para testar o executável;
- criar tags ou releases manualmente;
- configurar assinatura digital ou chaves do atualizador;
- compilar localmente se o instalador/portátil já abrir.

## 13. Checklist de validação prática

```text
[ ] Instalador abriu
[ ] Portátil abriu
[ ] Backup JSON foi exportado
[ ] Plano M2 foi criado
[ ] CSV M2 WIN foi preparado
[ ] Replay WIN abriu
[ ] Aquecimento ficou oculto
[ ] Movimento segundo a segundo funcionou
[ ] Bloqueio sem sinal funcionou
[ ] OCO funcionou
[ ] Relatório abriu
[ ] JSON e CSV foram exportados
[ ] Comparação com TradingView foi feita
[ ] Teste M2 de WDO foi feito
[ ] Timestamp do CSV do Profit foi confirmado como abertura do candle
```

Se algum item falhar, envie a mensagem de erro e, se possível, uma captura de tela. Para validar o parser do Profit, envie também uma amostra curta do CSV M2 com o cabeçalho e algumas linhas, ocultando qualquer dado pessoal que não seja necessário.
