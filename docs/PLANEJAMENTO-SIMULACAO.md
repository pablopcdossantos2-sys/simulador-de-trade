# Planejamento de uma simulação

## Antes de importar os dados

Defina o ativo, o pregão, a janela visível e a política de aquecimento. O simulador usa candles M2 como fonte principal; nesta versão, o timeframe da sessão também é M2.

Exemplo:

```text
Ativo: WINFUT
Pregão: 14/10/2026
Timeframe: 2 minutos (M2)
Janela visível: 09:00–12:00
```

Três horas de pregão correspondem a 90 candles M2.

## Aquecimento das médias

O indicador usa MME 8, MMP 20, MME 52 e VWAP Session. A MME 52 é o componente que exige maior histórico porque a EMA é recursiva.

O planejador oferece duas políticas:

- **Padrão:** 260 candles M2 (5 × 52), equivalentes a 8h40;
- **Estrito:** 520 candles M2 (10 × 52), equivalentes a 17h20.

No modo padrão, um pregão completo anterior de WIN entre 09:00 e 18:00 fornece até 270 candles de dois minutos. Em uma janela menor, pode ser necessário usar mais de um pregão anterior. O calendário incorporado determina quais dias são pregões; não se deve contar fins de semana ou feriados como dados disponíveis.

O aquecimento nunca é desenhado no gráfico. Ele só prepara o estado inicial do indicador para que a primeira barra visível já tenha histórico.

## Arquivos necessários

Para cada data indicada pelo planejador, importe o CSV do gráfico M2 exportado pelo Profit. O arquivo precisa conter Ativo/Contrato, Data/Hora, Abertura, Máxima, Mínima, Fechamento e Volume.

O sistema prepara um replay compacto por data e janela. A data é confirmada a partir do conteúdo, e não apenas pelo nome do arquivo. O pregão-alvo precisa corresponder exatamente à janela do plano; o aquecimento pode cobrir uma faixa maior, desde que inclua integralmente o período necessário.

Use o mesmo contrato no aquecimento e no pregão-alvo. Misturar vencimentos pode criar diferenças artificiais nas médias e nos sinais.

## O que acontece durante a reprodução

Cada candle M2 de origem é expandido em até 120 preços sintéticos, um por segundo. O percurso fica dentro da máxima e da mínima reais e termina no fechamento. A trajetória é determinística para cada candle, portanto o replay pode ser reiniciado com o mesmo resultado.

**Esses preços não são ticks históricos.** O OHLCV não contém a ordem intrabar verdadeira. Portanto, a sequência sintética não deve ser usada para afirmar em que segundo ocorreu uma negociação real ou qual nível teria sido atingido primeiro no mercado.

O controle de velocidade altera o relógio de reprodução: em 10×, dois minutos simulados correspondem a cerca de 12 segundos reais. Pausar congela o relógio e mudar a velocidade não salta o tempo de mercado.

## Validações

O programa rejeita, entre outras situações:

- timeframe que não seja M2;
- candles com horários fora da grade de dois minutos;
- data incompatível com o requisito;
- contrato de família diferente do ativo selecionado;
- preços fora do tick ou OHLC incoerente;
- candles duplicados;
- janela de tratamento diferente da definida no plano.
