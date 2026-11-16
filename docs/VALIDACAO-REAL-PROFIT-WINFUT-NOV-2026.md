# Validação dos dados reais do Profit — WINFUT M1

**Período analisado:** 09 a 13/11/2026  
**Origem:** cinco exportações CSV do Profit, ativo WINFUT, periodicidade de 1 minuto.  
**Objetivo:** conferir a integridade dos arquivos e a regra de agregação M1 → M2 usada pelo simulador.

## Resultado da conferência

| Pregão | Linhas M1 | Candles M2 completos | M1 descartados na borda | Quantidade negociada |
|---|---:|---:|---:|---:|
| 09/11/2026 | 563 | 281 | 1 | 20.199.481 |
| 10/11/2026 | 565 | 282 | 1 | 21.326.651 |
| 11/11/2026 | 563 | 281 | 1 | 17.073.819 |
| 12/11/2026 | 563 | 281 | 1 | 20.687.120 |
| 13/11/2026 | 565 | 282 | 1 | 17.394.930 |
| **Total** | **2.819** | **1.407** | **5** | **96.682.001** |

## Verificações realizadas

- Os cinco arquivos foram lidos com separador ponto e vírgula (`;`) e a codificação Latin-1.
- Os arquivos estão em ordem cronológica decrescente na origem; a conferência os ordenou cronologicamente antes de validar a sequência.
- Não foram encontrados timestamps duplicados nem lacunas entre minutos consecutivos dentro dos arquivos.
- Todos os preços OHLC respeitam o tick de 5 pontos do WIN.
- Todos os candles M1 respeitam as relações de máxima, mínima, abertura e fechamento.
- Cada pregão possui um único M1 isolado no final, às 18:24. Esse registro não forma um par M2 e foi descartado.
- Não foram encontrados pares M1 internos incompletos.
- A quantidade negociada foi somada a partir da coluna `Quantidade`; a coluna `Volume` financeiro não foi usada como quantidade.

## Regra M1 → M2 conferida

Para cada par de minutos consecutivos alinhado à fronteira de dois minutos:

- Abertura: abertura do primeiro M1.
- Máxima: maior máxima dos dois M1.
- Mínima: menor mínima dos dois M1.
- Fechamento: fechamento do segundo M1.
- Quantidade: soma das quantidades dos dois M1.
- Timestamp: início do bucket M2 (por exemplo, 09:00 para o par 09:00 + 09:01).

O resultado independente da conferência foi de **1.407 candles M2 completos** para os cinco pregões.

## Limitação ainda pendente

Esta conferência confirma a consistência estrutural e aritmética dos arquivos e da regra de agregação. Ela **não determina se o timestamp exportado pelo Profit representa a abertura ou o fechamento do minuto**. O simulador mantém essa semântica como questão pendente; não se deve deslocar os horários nem afirmar equivalência com o relógio de execução antes de obter evidência específica.

Também não constitui validação de dados WDO: os arquivos examinados são exclusivamente WINFUT.
