# Tratamento dos dados do Profit Ultra

## Objetivo

O Simulador de Trade não precisa armazenar toda a exportação bruta do Profit Ultra.

A ferramenta de preparação cria um arquivo derivado focado exclusivamente no replay de WIN/WDO entre **09:00 e 12:00**, preservando o arquivo bruto original.

## Janela de treino

A regra temporal adotada é:

```text
09:00:00 <= negócio < 12:00:00
```

Assim, em M2, o último candle completo da janela é:

```text
11:58:00 <= negócio < 12:00:00
```

Negócios anteriores a 09:00 ou a partir de 12:00 são descartados do arquivo tratado.

## Campos preservados

Cada linha do arquivo de replay contém somente:

```text
symbol,timestamp,source_row,price,quantity
```

### symbol

Contrato presente no arquivo original, por exemplo `WINV26` ou `WDOV26`.

### timestamp

Data/hora do negócio em formato canônico.

### source_row

Linha física do CSV original.

Esse campo é importante porque algumas exportações do Profit aparecem em ordem cronológica descendente e vários negócios podem compartilhar exatamente o mesmo segundo.

### price

Preço negociado, normalizado para ponto decimal.

Exemplos:

```text
205.935  -> 205935
5.321,5  -> 5321.5
```

### quantity

Quantidade negociada.

A quantidade é mantida porque o indicador inicial possui VWAP e precisa de informação de volume.

## Dados descartados

O arquivo tratado não mantém:

- agente comprador;
- agente vendedor;
- lado agressor;
- RLP;
- métricas de agressão;
- qualquer outra coluna que não seja necessária para reconstruir preço e volume.

Essas informações continuam existindo apenas no CSV bruto original.

## Compatibilidade inicial

O parser Rust foi baseado nas regras validadas no Candle Lab e reconhece inicialmente:

- layout Profit sem cabeçalho de 8 colunas;
- layout Profit sem cabeçalho de 9 colunas;
- arquivos com cabeçalho contendo aliases conhecidos;
- UTF-8;
- Windows-1252/CP1252;
- delimitadores vírgula, ponto e vírgula ou tab;
- data com ano de dois ou quatro dígitos;
- horário com ou sem fração de segundo;
- arquivos em ordem ascendente ou descendente.

## Processamento streaming

O arquivo não é carregado inteiro na memória.

Fluxo:

```text
CSV bruto
   ↓
leitura linha a linha
   ↓
detecção de layout
   ↓
normalização de data/preço/quantidade
   ↓
filtro 09:00–12:00
   ↓
remoção de colunas irrelevantes
   ↓
arquivo .replay.csv
```

O frontend recebe eventos periódicos de progresso com:

- bytes processados;
- tamanho total;
- linhas lidas;
- negócios preservados;
- percentual concluído.

## Arquivos gerados

Para uma fonte como:

```text
WINV26_TRADES.csv
```

o sistema cria, na mesma pasta:

```text
WINV26_TRADES_0900-1200.replay.csv
WINV26_TRADES_0900-1200.replay.meta.json
```

O arquivo `.meta.json` registra:

- versão do formato;
- timezone de referência;
- janela de horário;
- campos preservados;
- ordem detectada na fonte;
- quantidade de linhas;
- tamanho original;
- tamanho tratado;
- percentual de redução;
- primeiro/último timestamp preservado.

## Ordem cronológica

O tratamento registra a ordem física detectada na fonte como:

- `ASCENDING`;
- `DESCENDING`;
- `UNKNOWN`.

Se a fonte for descendente, o processador usa offsets leves das linhas preservadas e grava o arquivo final `.replay.csv` já em **ordem cronológica ascendente**. Os registros completos não precisam ser mantidos em memória.

O campo `source_row` continua preservando a posição física no CSV bruto para auditoria. O metadado registra também `canonicalOrder: "ASCENDING"`.

Se o arquivo bruto alternar entre trechos ascendentes e descendentes, o tratamento é interrompido em vez de produzir uma sequência ambígua.

## Segurança dos dados

A ferramenta nunca sobrescreve o CSV bruto.

O tratamento cria novos arquivos derivados. Isso permite:

- refazer o tratamento quando necessário;
- auditar a origem;
- comparar o derivado com a fonte;
- atualizar o algoritmo sem perder o dado original.

## Player de replay já integrado

O aplicativo desktop já consegue abrir o `.replay.csv` como uma sessão de streaming. O backend Rust entrega os eventos em blocos para reduzir o custo de comunicação com o frontend, mas o motor processa cada negócio individualmente.

A cada negócio revelado:

1. o candle M2 aberto é criado ou atualizado;
2. preço e volume mudam;
3. o indicador é recalculado somente com o histórico já revelado;
4. a autorização Compra/Venda é atualizada;
5. uma OCO aberta é testada contra aquele negócio exato.

A interface oferece Reprodução, Pausa, +1 negócio, Reiniciar e ritmos visuais 1×, 2×, 5× e 10×.

A próxima etapa de dados será a seleção explícita de pregão/data e o mecanismo de aquecimento do indicador antes das 09:00 lógicas do treino.
