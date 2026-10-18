# Planejamento de uma simulação

## Por que planejar antes de coletar os dados

Uma simulação não deve começar simplesmente escolhendo um CSV.

Antes da coleta, o usuário informa:

- ativo;
- data do pregão;
- timeframe;
- horário inicial visível;
- horário final visível;
- política de aquecimento do indicador.

A partir disso, o sistema calcula:

1. quais dados serão mostrados ao trader;
2. quantos candles anteriores são necessários para aquecer o indicador;
3. quais pregões anteriores devem ser coletados;
4. quais horários devem ser usados no tratamento;
5. se um arquivo de replay carregado é compatível com o plano.

## Exemplo: WINFUT em 14/10/2026

Configuração:

~~~text
Ativo: WINFUT
Pregão: 14/10/2026
Timeframe: 2 minutos (M2)
Janela visível: 09:00–12:00
Indicador: Multi Médias - Nuvem e Sinais
~~~

A janela visível possui:

~~~text
3 horas = 180 minutos
180 / 2 = 90 candles M2
~~~

## Escolha entre M2 e M5

A interface permite escolher inicialmente:

~~~text
M2 — candles de 2 minutos
M5 — candles de 5 minutos
~~~

A escolha afeta todo o fluxo da simulação, e não apenas a visualização:

- quantidade de candles na janela visível;
- formação OHLC/volume negócio a negócio;
- botão **+1 candle**;
- aquecimento oculto;
- número de pregões anteriores necessários;
- timeframe registrado na sessão de treinamento;
- cálculo do indicador sobre os candles formados.

Para a mesma janela 09:00–12:00:

~~~text
M2: 180 / 2 = 90 candles
M5: 180 / 5 = 36 candles
~~~

O indicador continua exigindo 260 candles no aquecimento padrão. Portanto, no M5:

~~~text
260 × 5 = 1.300 minutos = 21h40
~~~

Se o usuário tiver apenas a faixa 09:00–12:00 dos pregões anteriores:

~~~text
ceil(260 / 36) = 8 pregões anteriores
~~~

Se houver pregões completos de WIN entre 09:00–18:00:

~~~text
540 / 5 = 108 candles M5 por pregão
ceil(260 / 108) = 3 pregões completos
~~~

Para 14/10/2026, o planejador identifica, no exemplo M5, 13/10, 09/10 e 08/10 como os três pregões completos anteriores necessários.

## Qual média determina o aquecimento

O indicador usa:

- MME 8;
- MMP 20;
- MME 52;
- VWAP Session.

A MMP 20 possui memória finita: 20 candles bastam para calculá-la.

A VWAP Session reinicia no próprio pregão e não precisa carregar volume do pregão anterior.

A MME 52 é o componente que exige maior aquecimento. Como a EMA é recursiva, tecnicamente todo o histórico anterior pode exercer alguma influência.

O projeto adota duas políticas práticas:

### Padrão

~~~text
5 × 52 = 260 candles
~~~

No M2:

~~~text
260 × 2 = 520 minutos = 8h40
~~~

### Estrito

~~~text
10 × 52 = 520 candles
~~~

No M2:

~~~text
520 × 2 = 1.040 minutos = 17h20
~~~

O modo estrito reduz ainda mais a influência da inicialização, mas nem ele é apresentado como igualdade matemática absoluta com uma EMA calculada sobre todo o histórico disponível no TradingView.

## Quantos dias são necessários no exemplo

### Se o usuário coletar o pregão anterior completo

Para WINFUT, o planejador 2026 usa conservadoramente 09:00–18:00 como sessão completa para cálculo de capacidade.

Isso produz:

~~~text
9 horas = 540 minutos
540 / 2 = 270 candles M2
~~~

Assim, no modo padrão:

~~~text
260 candles necessários
270 candles disponíveis em 13/10/2026
~~~

Portanto, para simular 14/10/2026, basta:

~~~text
13/10/2026 — histórico oculto de aquecimento
14/10/2026 — pregão-alvo visível 09:00–12:00
~~~

### Se o usuário só coletar 09:00–12:00 nos dias anteriores

Cada pregão fornece apenas:

~~~text
90 candles
~~~

Então:

~~~text
ceil(260 / 90) = 3 pregões anteriores
~~~

Como 12/10/2026 não teve negociação na B3, o planejador retorna:

~~~text
13/10/2026
09/10/2026
08/10/2026
~~~

Além do próprio pregão-alvo de 14/10/2026.

## Dados visíveis x dados de aquecimento

Os dados de aquecimento nunca devem ser revelados ao trader durante o exercício.

Fluxo:

~~~text
pregões anteriores
      ↓
aquecimento oculto do indicador
      ↓
09:00 de 14/10/2026
      ↓
começa a área visível da simulação
      ↓
12:00
      ↓
fim da simulação
~~~

As médias chegam às 09:00 já aquecidas, mas o usuário só vê o período que escolheu treinar.

## Janela de tratamento configurável

A ferramenta de tratamento do Profit não está mais presa a 09:00–12:00.

O usuário pode escolher, por arquivo:

~~~text
Início do período a tratar
Final do período a tratar
~~~

O horário inicial é inclusivo e o final é exclusivo.

Exemplos:

~~~text
09:00–12:00  → pregão-alvo visível
09:00–18:00  → pregão anterior completo para aquecimento do WIN
~~~

O nome do arquivo gerado incorpora a janela escolhida.

Exemplo:

~~~text
WINV26_20261014_0900-1200.replay.csv
~~~

## Validação da janela

O arquivo .replay.meta.json registra a janela tratada.

Quando existe um plano ativo, o player compara esse metadado com a configuração.

Exemplo:

~~~text
Plano: 09:00–12:00
Arquivo: 10:00–13:00
Resultado: REJEITADO
~~~

Isso impede que o usuário execute uma simulação com dados tratados para uma janela diferente da configurada.

## Calendário da B3

A primeira versão do planejador incorpora o calendário de pregões de 2026, incluindo:

- fins de semana;
- feriados sem negociação;
- sessão especial da quarta-feira de Cinzas.

Por isso, ao voltar pregões anteriores a 14/10/2026, o sistema pula automaticamente o feriado de 12/10 e o fim de semana de 10–11/10.

O calendário deverá ser versionado por ano para que o planejador continue correto em simulações de outros anos.

## Atenção a vencimentos de contrato

O planejador também deve detectar datas de vencimento quando a regra é conhecida.

No exemplo de 14/10/2026, a data coincide com a quarta-feira mais próxima do dia 15 de outubro, regra de vencimento do WIN nos meses pares.

Nesses casos o sistema mostra um aviso para que o aquecimento e o pregão-alvo usem a mesma série de contrato, salvo se existir uma política explícita de série contínua/rolagem.

Misturar contratos sem regra definida pode alterar as médias e gerar sinais diferentes.

## Estado atual e próximas evoluções

O tratamento em lote, o catálogo local, a detecção de dados faltantes, o aquecimento invisível e a seleção M2/M5 já estão integrados.

Ainda permanecem como evoluções importantes:

1. ampliar o calendário para outros anos;
2. aprofundar a política de rolagem/série contínua em vencimentos;
3. ampliar os testes de paridade do indicador contra referências externas conhecidas.


## Relógio da reprodução e ritmo visual

A velocidade do replay é calculada a partir dos timestamps dos negócios, e não do número de linhas processadas por segundo. O relógio de mercado virtual avança proporcionalmente ao tempo real decorrido:

| Ritmo | Tempo real para 2 minutos de mercado |
|---|---:|
| 1× | 120 segundos |
| 2× | 60 segundos |
| 5× | 24 segundos |
| 10× | 12 segundos |

O player processa os negócios em ordem histórica e agrupa as atualizações da interface por frame. Isso reduz o custo de renderização sem descartar negócios da fila. A precisão observada ainda depende da resolução dos timestamps presentes no arquivo e da capacidade do computador; se o processamento não acompanhar o relógio, o player pode acumular atraso.

Pausar congela o relógio virtual. Retomar continua a partir do ponto de mercado alcançado, e mudar a velocidade recalibra a âncora sem saltar o tempo de mercado.
