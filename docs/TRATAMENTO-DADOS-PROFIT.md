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

Nesta primeira etapa, o arquivo tratado preserva a ordem física da fonte.

O metadado informa se a fonte foi detectada como:

- `ASCENDING`;
- `DESCENDING`;
- `UNKNOWN`.

O próximo estágio do replay usará `timestamp + source_row + sourceOrder` para reconstruir a ordem cronológica determinística, inclusive dentro de um mesmo segundo.

## Segurança dos dados

A ferramenta nunca sobrescreve o CSV bruto.

O tratamento cria novos arquivos derivados. Isso permite:

- refazer o tratamento quando necessário;
- auditar a origem;
- comparar o derivado com a fonte;
- atualizar o algoritmo sem perder o dado original.

## Próxima etapa

O próximo componente deverá consumir diretamente o `.replay.csv` para:

1. reconstruir a sequência cronológica;
2. formar candles M2 incrementalmente;
3. atualizar preço/volume negócio a negócio;
4. recalcular o indicador durante o candle aberto;
5. avaliar stop e alvo em cada negócio.
