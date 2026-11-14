# Evolução do trader

## Objetivo

A seção **Desenvolvimento do trader** transforma as sessões encerradas em uma série histórica.

Sessões ainda ativas são ignoradas para não distorcer os indicadores.

Durante uma prova ativa, o painel permanece oculto.

## Métricas por sessão

Cada ponto histórico registra:

- data;
- ativo;
- modo Treino/Prova;
- quantidade de trades;
- win rate;
- aderência às tentativas;
- aderência aos sinais;
- resultado em R;
- resultado líquido em reais;
- tentativas bloqueadas;
- problemas técnicos.

## Aderência às tentativas

Mede se o trader tentou operar dentro das regras:

~~~text
entradas válidas
────────────────────────────
entradas válidas + bloqueios
~~~

## Aderência aos sinais

Depois da política `1 sinal = no máximo 1 entrada`, podemos medir o aproveitamento dos sinais sem duplicidade:

~~~text
sinais utilizados
──────────────────────────────
sinais utilizados + ignorados
~~~

Um sinal ignorado continua sendo uma observação, e não automaticamente um erro disciplinar.

## Séries históricas

O painel mostra as últimas sessões com:

- gráfico de aderência às tentativas;
- gráfico de resultado em R;
- tabela cronológica;
- médias históricas;
- R acumulado;
- líquido acumulado.

## Fonte dos dados

A análise usa consultas separadas das listas operacionais da interface.

Isso é importante porque a lista visual de operações recentes possui limites de exibição, enquanto a análise histórica precisa considerar todo o histórico persistido.

O backend disponibiliza consultas específicas para:

- todas as sessões;
- todos os eventos;
- todos os trades.

## Privacidade do Modo Prova

Apenas sessões encerradas entram na série.

Além disso, enquanto uma prova estiver ativa, a própria interface esconde o painel para não fornecer feedback indireto de desempenho durante a avaliação.

## Cruzamento dos desvios com o contexto de mercado

A seção de avaliações também cruza os desvios autorrelatados com as condições registradas no instante da entrada. O objetivo é investigar em quais grupos de operações determinado comportamento aparece com frequência maior que a base geral.

Dimensões utilizadas:

- ativo: WINFUT ou WDOFUT;
- direção: compra ou venda;
- zona do indicador na entrada: verde, vermelha ou sem zona ativa;
- posição do preço em relação à VWAP: acima, abaixo ou próximo (até 2 ticks);
- proporção do corpo do candle de entrada em relação ao seu range: pequeno (menos de 25%), intermediário (25% a menos de 60%) ou dominante (60% ou mais);
- amplitude do candle de entrada em relação à média dos até 10 candles anteriores: expandida (1,5 vez ou mais), comprimida (0,7 vez ou menos) ou próxima da média. Essa dimensão exige pelo menos 5 candles anteriores válidos;
- distância do stop em relação à média dos ranges anteriores: menor que 1 range médio, entre 1 e 2 ou igual/maior que 2. Também exige pelo menos 5 candles anteriores válidos;
- relação risco/retorno planejada, calculada pela distância entre entrada, stop e alvo, em faixas de 2,0 a menos de 2,5, de 2,5 a menos de 3,5, 3,5 ou mais e abaixo de 2,0 (para registros históricos que não sigam a validação atual).

### Como ler as associações

Cada associação mostra a frequência do desvio naquele grupo e a frequência de referência entre as operações que possuem informação para a mesma dimensão. A diferença é apresentada em pontos percentuais.

- Sinal contextual inicial: grupo com pelo menos 3 operações, pelo menos uma ocorrência e frequência ao menos 10 pontos percentuais acima da referência.
- Associação recorrente: grupo com pelo menos 5 operações e pelo menos 2 ocorrências, além da mesma diferença mínima de 10 pontos percentuais.

O painel exibe até 12 associações com maior diferença. Os limites são filtros exploratórios para evitar destacar grupos muito pequenos; não são testes de significância estatística.

### Limitações e integridade dos dados

- O contexto é o snapshot preservado na abertura da operação. Não são usados candles posteriores para reconstruir o cenário de entrada.
- Operações antigas sem snapshot continuam participando dos cruzamentos por ativo e direção, mas não dos cruzamentos que dependem do gráfico.
- A análise descreve associações observadas nas avaliações preenchidas pelo trader. Não prova causalidade, não identifica automaticamente emoções e não afirma que uma condição de mercado provocou o desvio.
- Os percentuais dependem da quantidade e da qualidade das avaliações registradas. Amostras pequenas devem ser interpretadas com cautela.
