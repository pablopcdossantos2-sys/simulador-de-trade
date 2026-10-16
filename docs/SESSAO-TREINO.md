# Sessão formal de treinamento

## Objetivo

O replay histórico e a sessão de treinamento são estados diferentes.

Um arquivo pode estar carregado e pronto sem que o desempenho do trader esteja sendo avaliado. A coleta de métricas começa somente quando o usuário seleciona **Iniciar treino**.

## Fluxo

~~~text
Plano de simulação
        ↓
dados completos no catálogo
        ↓
replay carregado + aquecimento oculto
        ↓
Iniciar treino
        ↓
registro disciplinar ativo
        ↓
replay negócio a negócio / candle a candle
        ↓
Encerrar treino ou fim da janela
        ↓
resumo da sessão
~~~

## Eventos registrados

A primeira versão registra:

- início da sessão;
- operação válida aberta;
- operação encerrada por stop ou alvo;
- tentativa de operação bloqueada;
- sinal que terminou sem ser utilizado;
- encerramento da sessão.

Esses eventos são persistidos localmente.

No Tauri, ficam no SQLite. Durante desenvolvimento web, existe fallback para localStorage.

## Tentativa bloqueada

Uma tentativa bloqueada é uma ação efetiva do trader que infringiria as regras.

Exemplos:

- tentar comprar sem sinal;
- tentar vender em uma zona de compra;
- tentar comprar em uma zona de venda;
- enviar OCO inválida;
- tentar abrir uma segunda posição.

A operação continua não sendo executada e o pop-up **Fora do operacional** permanece sendo exibido.

Se a sessão formal estiver ativa, essa tentativa também entra na linha do tempo disciplinar.

## Sinal ignorado

Um sinal ignorado é registrado quando uma autorização do indicador termina sem que nenhuma operação tenha sido aberta utilizando aquele sinal.

Isso **não é classificado automaticamente como erro**.

O trader pode deliberadamente decidir não operar um sinal válido.

Por isso, “sinais ignorados” é uma informação comportamental separada da aderência ao operacional.

## Aderência operacional

A primeira métrica implementada considera somente tentativas reais de operação.

Fórmula:

~~~text
aderência =
operações válidas abertas
────────────────────────────────────
operações válidas + tentativas bloqueadas
~~~

Exemplo:

~~~text
3 entradas válidas
1 tentativa bloqueada

aderência = 3 / 4 = 75%
~~~

Sinais ignorados não entram no denominador.

## Início do treino

Ao iniciar:

1. o replay volta ao início da janela;
2. os candles visíveis são limpos;
3. o aquecimento oculto permanece carregado;
4. posições e OCO anteriores são descartadas;
5. o histórico disciplinar da nova sessão começa vazio;
6. o evento SESSION_STARTED é persistido.

A partir desse ponto os controles de reprodução ficam habilitados.

## Controles do replay

Durante uma sessão ativa existem três formas principais de avançar:

### Reprodução

Avança os negócios sequencialmente no ritmo visual selecionado.

### +1 negócio

Revela exatamente o próximo negócio.

### +1 candle

Processa todos os negócios restantes do candle M2 atual e para na fronteira do candle.

O primeiro negócio do candle seguinte permanece oculto.

Se o candle atual já estiver completo, o comando revela o próximo candle completo.

## Encerramento

A sessão pode ser encerrada manualmente quando não existe posição aberta.

Quando o replay chega naturalmente ao final e não há posição aberta, a sessão é encerrada automaticamente.

Se o replay terminar com posição aberta, o sistema não inventa uma saída. A sessão permanece ativa e mostra um aviso. A política definitiva para posição aberta no fim da janela ainda precisa ser definida.

## Linha do tempo disciplinar

O painel da sessão mostra os eventos mais recentes, incluindo:

- horário de mercado;
- tipo do evento;
- direção da operação/sinal quando aplicável;
- motivo de uma tentativa bloqueada;
- stop/alvo no encerramento.

## Persistência

O SQLite contém agora:

~~~text
training_sessions
training_events
~~~

Uma sessão possui:

- ativo;
- data do pregão;
- horário inicial/final;
- timeframe;
- quantidade de candles de aquecimento;
- início e fim da sessão;
- status.

Cada evento possui vínculo com a sessão e pode, quando aplicável, referenciar sinal, direção e trade.

## Próximas evoluções

- separar erros de disciplina de problemas técnicos;
- adicionar notas pós-trade;
- salvar imagem/contexto do gráfico na entrada;
- criar modo prova;
- ocultar resultado durante a sessão no modo prova;
- histórico navegável de sessões concluídas;
- relatório completo por sessão;
- expectativa, payoff, drawdown e métricas em R.
