# Resultado por setup/sinal

## Objetivo

O relatório de sessão agrupa operações pelo contexto real capturado no momento da entrada.

A classificação não é inferida posteriormente a partir do resultado do trade.

## Chave de classificação

Para operações com snapshot de entrada, a chave é formada por:

~~~text
<versão do indicador> · <rótulo do sinal>
~~~

Exemplo:

~~~text
multi-medias-nuvem-v1.0.0 · Compra
multi-medias-nuvem-v1.0.0 · Venda
~~~

Isso permite que uma futura mudança de algoritmo não misture silenciosamente trades produzidos por versões diferentes.

## Trades antigos

Operações criadas antes da captura estruturada do contexto não recebem uma classificação inventada.

Elas aparecem como:

~~~text
Legado / sem classificação
~~~

## Métricas por grupo

O relatório apresenta:

- quantidade de trades;
- win rate;
- resultado em pontos;
- resultado líquido em reais.

## Exportação

O relatório JSON passou para o schema v2 e inclui `setupPerformance`.

O CSV de trades também inclui a coluna `setup`.

O snapshot completo de entrada continua presente no trade, preservando a possibilidade de análises futuras mais detalhadas.
