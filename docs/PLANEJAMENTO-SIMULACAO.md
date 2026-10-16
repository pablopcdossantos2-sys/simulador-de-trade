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
Timeframe: 2 minutos
Janela visível: 09:00–12:00
Indicador: Multi Médias - Nuvem e Sinais
~~~

A janela visível possui:

~~~text
3 horas = 180 minutos
180 / 2 = 90 candles M2
~~~

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

## Próximas evoluções

Ainda serão implementados:

1. tratamento em lote dos pregões requeridos pelo plano;
2. catálogo local de arquivos já preparados;
3. verificação automática de quais datas estão disponíveis ou faltando;
4. aquecimento automático e invisível antes do replay visível;
5. suporte a mudança/vencimento de contrato sem misturar séries de forma indevida;
6. regressão contra valores do TradingView para definir tolerâncias de paridade.
