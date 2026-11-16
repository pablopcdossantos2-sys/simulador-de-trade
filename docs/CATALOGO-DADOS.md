# Catálogo de replays e comparação com o plano

O catálogo local registra caminho, metadados, ativo, símbolo, data, **janela solicitada**, **primeiro e último registros reais**, modalidade M1/M2/negócios e tamanho do arquivo. O CSV bruto do Profit não é modificado.

## Estados

- **Disponível**: arquivo existente, ativo/data/contrato compatíveis e candles presentes desde o início até o fim da janela programada.
- **Disponível com observação**: arquivo válido, mas o primeiro ou o último candle ocorre em horário diferente do planejado. O plano **pode ser iniciado**, reproduzindo apenas os registros presentes.
- **Metadados inválidos**: timestamps ausentes, invertidos, de data diferente ou sem interseção com a janela; requer correção/repreparação.
- **Contrato incompatível**: o aquecimento e o pregão-alvo usam símbolos diferentes; exige uniformidade ou política de rolagem que não foi implementada.
- **Faltando**: não há arquivo catalogado para a data/janela requerida.

**Exemplo real:** WINFUT 04/11/2026, janela programada **09:00–18:25**, registros **09:03–18:24**. O catálogo exibe `Disponível com observação`; o replay M1 inicia às 09:03, **não fabrica** candles 09:00–09:02.

A janela **declarada** deve ainda ser compatível: o pregão-alvo exige exatamente a janela do plano; arquivos de aquecimento podem ter uma janela declarada mais ampla. Horários observados menores **não indicam automaticamente erro**.

O replay M1 contém candles originais de um minuto; o M2 é derivado de pares cronológicos completos. O M1 isolado às 18:24 do WIN não deve virar um M2 com OHLCV inventado. O aquecimento do indicador é processado sem mostrar os candles anteriores na área visível.

O catálogo usa o símbolo do alvo como referência para aquecimento. Dados contínuos com `WINFUT`/`WDOFUT` não comprovam qual contrato de vencimento está presente. O aplicativo distingue os modos de replay, mas nenhum movimento sintético corresponde a negócios históricos reais.

Veja o [tutorial prático de validação no Windows](VALIDACAO-HUMANA-PASSO-A-PASSO.md).
