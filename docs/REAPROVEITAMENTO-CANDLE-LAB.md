# Reaproveitamento do Candle Lab no Simulador de Trade

## Conclusão

O repositório `candle-lab` contém uma base técnica altamente reaproveitável para construir o replay histórico do Simulador de Trade.

O reaproveitamento recomendado não é incluir o projeto Python como dependência. O Simulador de Trade já usa React + TypeScript + Tauri 2 + Rust, então os algoritmos relevantes devem ser portados para Rust/TypeScript, preservando fixtures, regras e testes do Candle Lab.

## O que precisamos do Profit

Para o simulador não precisamos de:

- agente comprador;
- agente vendedor;
- lado agressor;
- RLP;
- análise de agressão;
- métricas de microestrutura do Candle Lab.

O conjunto mínimo necessário por negócio é:

- ativo/contrato;
- data/hora;
- preço;
- quantidade;
- ordem relativa na fonte;
- número do negócio, quando estiver disponível.

A quantidade continua necessária porque o indicador inicial contém VWAP e, portanto, depende de volume.

## Componentes do Candle Lab que devem ser portados

### 1. Reconhecimento do CSV do Profit

Fonte conceitual:

- `src/candle_lab/importers.py`
- `src/candle_lab/slice.py`

O Candle Lab já reconhece:

- export sem cabeçalho de 8 colunas;
- export sem cabeçalho de 9 colunas com Número do Negócio;
- export com cabeçalho e aliases;
- codificações UTF-8, CP1252 e Latin-1;
- delimitadores diferentes;
- preço brasileiro com ponto de milhar e vírgula decimal;
- arquivo em ordem ascendente ou descendente.

Para o simulador, a estrutura pode ser simplificada para descartar as colunas de agressão e instituições depois da leitura.

### 2. Índice temporal M1 por linhas e bytes

Fonte:

- `src/candle_lab/time_index.py`

Essa é uma das partes mais valiosas para o simulador.

Na primeira utilização de um CSV grande, o arquivo é varrido uma única vez e é criado um índice leve contendo, minuto a minuto:

- primeiro e último timestamp;
- primeira e última linha física;
- byte inicial e final;
- quantidade de negócios;
- ordem física da fonte;
- fingerprint e SHA-256.

Depois disso, um intervalo pode ser localizado sem reler centenas de MB anteriores.

O índice M1 já suporta a composição exata de M2 porque `locate_candles(..., interval_seconds=120)` agrega os dois minutos envolvidos.

### 3. Recorte seletivo usando seek

Fonte:

- `src/candle_lab/slice.py`

Depois de localizar os offsets no índice, o Candle Lab usa seek diretamente no CSV original e lê somente a região necessária.

No simulador, podemos melhorar esse conceito: para um replay de pregão completo, não precisamos necessariamente criar outro CSV. O backend Rust pode abrir o arquivo original, fazer seek no início do pregão e alimentar diretamente o motor de replay até o byte final da sessão.

Isso evita:

- copiar arquivos de centenas de MB;
- manter duas bibliotecas de Tick by Tick;
- carregar o pregão inteiro na memória.

Um cache local de pregões pode ser opcional.

### 4. Ordem cronológica determinística

Fonte:

- `src/candle_lab/candles.py`
- `src/candle_lab/bulk.py`

O Candle Lab ordena cada negócio por:

1. timestamp;
2. `sequence_no`;
3. trade ID, quando necessário.

Nos exports reais validados, o Profit pode gerar o arquivo do mais recente para o mais antigo. O Candle Lab corrige isso sem precisar inverter centenas de MB em memória.

Essa regra é indispensável para que abertura, fechamento e trajetória intrabar sejam reconstruídos corretamente.

### 5. Construção dos candles

Fonte:

- `src/candle_lab/candles.py`

Cada negócio é atribuído ao intervalo:

```text
candle_start <= timestamp < candle_end
```

Para M2:

```text
09:00:00 <= negócio < 09:02:00
09:02:00 <= negócio < 09:04:00
...
```

Abertura é o primeiro negócio cronológico; máxima e mínima são calculadas sobre todos os negócios; fechamento é o último negócio cronológico.

No simulador, o candle não será construído somente no final: ele será atualizado progressivamente a cada negócio recebido pelo motor de replay.

### 6. Timeline negócio a negócio

Fonte:

- `src/candle_lab/services.py`

O Candle Lab já produz uma timeline ordenada com, entre outros campos:

- índice;
- sequence_no;
- timestamp;
- preço;
- quantidade;
- máxima corrente;
- mínima corrente;
- fechamento corrente;
- volume acumulado.

Para o simulador, basta uma versão muito menor:

```text
ReplayTrade
  timestamp
  sequence
  price
  quantity
```

O estado do candle aberto é atualizado a cada evento.

### 7. Validação contra candle exportado pelo Profit

O Candle Lab já possui mecanismo de reconciliação entre candles reconstruídos a partir dos trades e candles OHLC independentes exportados pelo Profit.

Essa estratégia deve ser mantida no simulador como ferramenta de auditoria.

Antes de considerar um importador compatível com Profit como estável, devemos verificar que os candles M2 reconstruídos possuem:

- abertura correta;
- máxima correta;
- mínima correta;
- fechamento correto;
- quantidade/volume correto.

## O que NÃO deve ser portado

Não precisamos trazer para o Simulador de Trade:

- `aggression.py`;
- `aggression_waves.py`;
- `flow_efficiency.py`;
- `paradox.py`;
- `interpretation.py`;
- análises por instituição;
- volume agressor por lado;
- rankings de agentes;
- hipóteses de absorção/exaustão;
- famílias de trajetória;
- pesquisa de candles semelhantes.

Essas funções pertencem ao objetivo analítico do Candle Lab e aumentariam desnecessariamente a complexidade do simulador.

## Arquitetura recomendada do replay

```text
CSV Trades/Tick by Tick do Profit
              ↓
     Indexador Rust (uma vez)
              ↓
 índice local M1: linhas + bytes
              ↓
 usuário escolhe pregão de treino
              ↓
 seek direto no CSV original
              ↓
 parser streaming em ordem cronológica
              ↓
           ReplayTrade
              ↓
         Replay Engine
       ┌──────┴────────┐
       ↓               ↓
 candle M2       indicador Pine portado
 em formação     recalculado por atualização
       ↓               ↓
 gráfico         COMPRA / VENDA / zona
       └──────┬────────┘
              ↓
     motor de ordens/OCO
```

## Comportamento tick a tick

No contexto deste projeto, “tick a tick” deve significar que cada negócio presente na exportação do Profit é processado sequencialmente.

A cada negócio:

1. o preço atual muda para o preço daquele negócio;
2. o candle M2 aberto atualiza close;
3. high/low são atualizados quando necessário;
4. o volume acumulado recebe a quantidade do negócio;
5. WMA/EMA/VWAP e o indicador são recalculados usando o estado atual do candle;
6. o estado COMPRA/VENDA pode mudar;
7. stop/alvo de uma posição aberta são avaliados contra o preço do negócio;
8. a tela é atualizada.

O motor deve processar todos os eventos, mesmo quando a interface agrupar várias atualizações em um único frame para manter desempenho gráfico.

## Limitação temporal do export validado

A amostra real já validada pelo Candle Lab possuía timestamps com precisão de 1 segundo.

Isso significa que conseguimos preservar:

- todos os negócios;
- seus preços;
- suas quantidades;
- a ordem relativa em que aparecem na fonte dentro do mesmo segundo.

Mas não podemos reconstruir:

- o milissegundo real de cada negócio;
- o intervalo exato entre dois negócios que compartilham o mesmo segundo.

Por isso serão oferecidos dois conceitos distintos:

### Fidelidade de sequência

Reproduz cada negócio exatamente na ordem conhecida. É o modo principal para formação do preço e execução das ordens.

### Ritmo visual

Controla quanto tempo o usuário leva para assistir ao replay. Pode usar 1x, 2x, 5x etc., mas nunca será apresentado como reconstrução de milissegundos que não existem na fonte.

## TradingView e indicador intrabar

Indicadores Pine são recalculados em cada atualização do feed enquanto o candle em tempo real está aberto.

Para aproximar esse comportamento, o simulador deverá recalcular o indicador após cada ReplayTrade usando:

- candles anteriores já confirmados;
- candle M2 atual ainda não confirmado;
- open/high/low/close/volume acumulados até aquele negócio.

O estado definitivo do candle só é consolidado quando o intervalo de dois minutos termina.

## Estratégia de armazenamento

### Fonte bruta

O CSV original continua no local escolhido pelo usuário.

### Índice

Pequeno arquivo local associado à fonte, contendo offsets por minuto.

### Sessões

O simulador guarda apenas metadados da sessão e resultados de treinamento.

### Cache opcional

Um pregão pode ser convertido para um formato binário/SQLite compacto para replays repetidos, mas isso será uma otimização, não uma exigência.

## Próxima implementação

A primeira entrega dessa arquitetura deverá conter:

1. parser Rust para o layout Profit;
2. indexador temporal M1;
3. localização de sessões/M2;
4. leitor streaming usando seek;
5. modelo `ReplayTrade`;
6. agregador incremental de candles M2;
7. replay play/pause/step/velocidade;
8. recálculo intrabar do indicador;
9. OCO avaliada por negócio;
10. testes portados do Candle Lab para ordem descendente, linhas idênticas, M2 e offsets.
