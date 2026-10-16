# Relatório pós-sessão

## Escopo

O relatório usa somente os trades ligados à sessão selecionada.

O vínculo é feito pelos eventos persistidos de encerramento da operação. Assim, uma operação de outro exercício não entra acidentalmente nas métricas da sessão aberta no histórico.

## Separação de eventos

Os eventos são classificados em grupos diferentes.

### Disciplina

Ações do trader que tentariam infringir as regras:

- operação sem sinal;
- direção contrária ao sinal;
- segunda posição simultânea;
- OCO inválida;
- preços incompatíveis com o tick mínimo.

Esses eventos são `BLOCKED_ATTEMPT` e reduzem a métrica de aderência às tentativas.

### Execução

- operação aberta;
- operação encerrada.

### Observação

- sinal ignorado.

Ignorar um sinal não é considerado automaticamente um erro.

### Técnico

- falha de replay;
- exceção inesperada do aplicativo;
- falha de persistência detectada durante uma sessão.

Problemas técnicos são contabilizados separadamente e não reduzem a aderência do trader.

## Métricas

### Resultado líquido em pontos

~~~text
resultado líquido = soma dos resultados de todos os trades da sessão
~~~

### Win rate

~~~text
trades vencedores
────────────────── × 100
 total de trades
~~~

### Payoff

~~~text
média dos ganhos
────────────────
média das perdas absolutas
~~~

Se existirem ganhos mas nenhuma perda, a interface apresenta razão infinita.

### Profit factor

~~~text
soma dos ganhos
───────────────
soma absoluta das perdas
~~~

### R por trade

Como toda entrada possui stop obrigatório, o risco inicial em pontos é conhecido:

~~~text
risco inicial = | entrada − stop inicial |
~~~

Então:

~~~text
R do trade = resultado em pontos / risco inicial
~~~

Exemplo:

~~~text
Entrada: 130.000
Stop:    129.900
Risco:   100 pontos

Saída:   130.150
Resultado: +150 pontos

R = +1,50
~~~

### Resultado total em R

~~~text
total R = soma dos R-múltiplos de todos os trades
~~~

### Expectativa em R

Na primeira versão:

~~~text
expectativa R = média dos R-múltiplos realizados
~~~

Essa medida é equivalente à média empírica de R por operação na sessão.

### Drawdown máximo em pontos

Os trades são considerados na ordem de encerramento.

O sistema constrói o resultado acumulado e mede a maior queda entre um pico anterior e o saldo acumulado posterior.

### Resultado por direção

O relatório apresenta separadamente:

- quantidade de compras;
- quantidade de vendas;
- pontos líquidos nas compras;
- pontos líquidos nas vendas.

### Resultado por horário

Os trades são agrupados pela hora da entrada, por exemplo:

~~~text
09:00 · 3 trades · +250 pts
10:00 · 2 trades · -100 pts
11:00 · 1 trade  · +150 pts
~~~

## Aderência

A aderência inicial continua baseada apenas em tentativas efetivas:

~~~text
entradas válidas
──────────────────────────────────
entradas válidas + bloqueios
~~~

Problemas técnicos e sinais ignorados não entram no denominador.

## Histórico

A seção de histórico recupera as sessões persistidas do SQLite.

Para cada sessão selecionada, o frontend carrega:

1. metadados da sessão;
2. eventos da sessão;
3. trades encerrados vinculados aos eventos daquela sessão;
4. métricas calculadas localmente a partir desse conjunto.

Sessões que permaneceram ativas após uma interrupção também são exibidas, em vez de serem ocultadas.

## Limitações atuais

Ainda não entram no relatório:

- resultado financeiro em reais;
- quantidade de contratos;
- custos;
- slippage;
- notas pós-trade;
- imagem/contexto gráfico da entrada;
- métricas agregadas de evolução entre muitas sessões.

Esses pontos permanecem no ROADMAP.
