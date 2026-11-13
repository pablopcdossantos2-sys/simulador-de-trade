# Preparar dados do Profit para o replay

## Fonte recomendada: candles M2

O fluxo principal usa um CSV exportado do gráfico de **2 minutos (M2)** do Profit. Não é necessário exportar negócios tick a tick.

O CSV precisa ter um cabeçalho que identifique:

- ativo/contrato;
- data e hora do candle (ou uma coluna única de timestamp);
- abertura;
- máxima;
- mínima;
- fechamento;
- volume.

São reconhecidos nomes comuns em português e inglês, como `Ativo`, `Contrato`, `Data`, `Hora`, `Timestamp`, `Abertura/Open`, `Máxima/High`, `Mínima/Low`, `Fechamento/Close` e `Volume`. São aceitos delimitadores vírgula, ponto e vírgula ou tabulação e codificações UTF-8/Windows-1252.

O timestamp deve marcar a **abertura** do candle e respeitar a grade M2 (minuto par, segundo zero). Use um arquivo por pregão. Não misture contratos.

## O que o aplicativo valida

Antes de preparar o replay, o programa confere:

- se o ativo pertence à família WIN ou WDO selecionada;
- se as datas pertencem a um único pregão;
- se os candles estão em intervalos M2 válidos;
- se abertura, máxima, mínima e fechamento são coerentes;
- se os preços respeitam o tick do ativo (WIN: 5 pontos; WDO: 0,5 ponto);
- se o volume é não negativo;
- se há timestamps duplicados;
- se existe conteúdo na janela solicitada.

A janela usa início inclusivo e final exclusivo. Por exemplo, 09:00–12:00 inclui candles cuja abertura ocorre desde 09:00 até 11:58. O candle de 12:00 já fica fora da seleção.

## Arquivo compacto gerado

O simulador cria um replay derivado com as colunas:

```text
symbol,timestamp,source_row,open,high,low,close,volume
```

O arquivo contém um registro por candle, e não milhares de linhas por segundo. Os metadados registram contrato, janela, timezone, formato, quantidade de candles e tamanho do arquivo.

O CSV original do Profit nunca é sobrescrito. O replay e os metadados são gravados ao lado da fonte.

## Movimento segundo a segundo

Durante a reprodução, o backend gera até 120 preços para cada candle M2. O percurso é determinístico para aquele candle e:

1. começa no preço de abertura;
2. alcança máxima e mínima em uma ordem e em segundos escolhidos pelo gerador;
3. mantém todos os preços dentro da faixa OHLC;
4. termina no fechamento;
5. distribui o volume total ao longo dos 120 segundos.

O algoritmo usa o ativo, timestamp e OHLCV como semente. Reiniciar a mesma sessão, portanto, não muda aleatoriamente o caminho.

### Limite importante da fonte OHLC

Um candle M2 não informa a sequência real dos preços entre abertura, máxima, mínima e fechamento. Não existe algoritmo capaz de recuperar essa sequência verdadeira apenas a partir dos quatro preços agregados.

Por isso, o percurso sintético é uma hipótese visual e de execução. Ele dá movimento ao gráfico e permite treinar reações a variações de preço, mas não é um substituto de tape reading histórico. Quando stop e alvo cabem na mesma faixa M2, a ordem simulada em que os níveis são tocados pode alterar o resultado.

O aplicativo identifica o replay como **movimento simulado** para não confundi-lo com dados tick a tick históricos.

## Aquecimento do indicador

Os arquivos dos pregões anteriores são lidos como candles M2 e usados para calcular o histórico necessário das médias. Esses candles ficam ocultos no gráfico. O usuário começa a ver o mercado apenas no início da janela selecionada para o pregão-alvo.

Para o aquecimento padrão, o planejador considera 260 candles (cinco vezes o período da MME 52). O modo estrito considera 520 candles.

## Compatibilidade

O aplicativo ainda reconhece arquivos legados `.replay.csv` criados a partir de negócios individuais. Essa opção existe para abrir estudos e dados já preparados; novos arquivos devem usar o formato M2 para reduzir espaço e simplificar a importação.
