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
