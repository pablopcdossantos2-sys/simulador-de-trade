# Notas pós-trade

## Objetivo

Depois de uma operação encerrada, o trader pode registrar uma análise qualitativa sem alterar os dados objetivos da execução.

A nota é vinculada ao trade.

## Exemplos de uso

O campo pode registrar:

- por que a operação foi executada;
- se houve hesitação;
- se houve antecipação;
- se a entrada respeitou o processo;
- estado emocional;
- leitura que funcionou ou falhou;
- aprendizado para sessões futuras.

## Persistência

A nota é salva junto ao trade no histórico local.

Trades antigos recebem nota vazia durante a migração:

~~~text
postTradeNote = ""
~~~

Nenhum histórico anterior precisa ser apagado.

## Relatório da sessão

Na seção **Notas pós-trade**, cada operação encerrada possui:

- direção;
- resultado em pontos;
- quantidade de contratos;
- resultado líquido;
- área de texto editável;
- botão Salvar nota.

A nota não altera win rate, payoff, R, aderência ou qualquer outra métrica quantitativa.
