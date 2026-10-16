# Contexto do gráfico na entrada

## Objetivo

Cada trade novo pode preservar exatamente o contexto que estava visível quando a entrada foi executada.

O sistema não reconstrói esse contexto usando candles posteriores. Em vez disso, cria um snapshot imutável no instante da entrada.

## O que é capturado

Por padrão, o snapshot guarda até 48 candles visíveis imediatamente antes/incluindo o candle da entrada.

Também são armazenados:

- ativo;
- timestamp de mercado;
- timestamp da captura;
- índice do candle atual;
- preço corrente;
- zona do indicador;
- sinal autorizador;
- sinais visíveis no recorte;
- MMP/WMA 20;
- VWAP;
- MME/EMA 8;
- MME/EMA 52.

## Por que usar dados estruturados e não apenas uma imagem

Uma imagem é útil visualmente, mas não permite validar os valores que geraram o gráfico.

O snapshot estruturado permite:

1. reconstruir o gráfico posteriormente;
2. conferir os valores do indicador;
3. auditar se havia realmente um sinal válido;
4. impedir que candles futuros contaminem a revisão;
5. evoluir a visualização sem perder o dado original.

O relatório da sessão reconstrói um mini-gráfico a partir do snapshot e mostra também as linhas de Entrada, Stop e Alvo.

## Regra contra look-ahead

A captura recebe apenas `visibleCandles`.

No replay, `visibleCandles` contém exclusivamente candles já revelados ao trader.

Os candles de aquecimento usados internamente pelo indicador não entram no gráfico capturado, e candles futuros não existem no snapshot.

## Persistência

O snapshot é salvo junto ao trade no SQLite como JSON.

A migração é retrocompatível:

- trades novos: `entryContext` contém o snapshot;
- trades antigos: `entryContext = null`.

Trades antigos continuam visíveis normalmente e apenas informam que o contexto gráfico não estava disponível.

## Limite atual

A primeira versão captura os dados necessários para reconstrução do gráfico, não uma imagem PNG.

Uma exportação opcional da visualização para imagem pode ser adicionada futuramente sem substituir o snapshot estruturado.
