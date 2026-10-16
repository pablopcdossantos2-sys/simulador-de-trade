# Modo Prova

## Objetivo

O Modo Prova usa o mesmo replay, indicador e regras do treino livre, mas reduz o feedback de desempenho durante a sessão.

O objetivo é evitar que o trader altere o comportamento com base no resultado acumulado enquanto o exercício ainda está em andamento.

## Como iniciar

Antes de iniciar a sessão, o usuário escolhe:

- **Treino livre**;
- **Modo prova**.

O modo escolhido é salvo na própria sessão.

Sessões antigas, criadas antes deste recurso, são migradas automaticamente como `FREE`.

## O que permanece visível

Durante a prova continuam disponíveis:

- gráfico já revelado;
- sinal/zone do indicador;
- preço atual;
- boleta OCO;
- posição aberta;
- stop e alvo;
- controles de replay;
- pop-up de operação bloqueada;
- eventos técnicos necessários à execução.

As regras continuam exatamente iguais ao treino livre.

## O que fica oculto

Enquanto a sessão `EXAM` estiver ativa, o sistema não mostra os resultados quantitativos da prova atual.

São ocultados:

- pontos realizados;
- resultado bruto;
- custos;
- resultado líquido;
- resumo de aderência;
- relatório pós-sessão da prova ativa;
- operações da prova na lista global de operações;
- painel agregado por ativo.

O encerramento de uma operação é informado sem revelar o valor do resultado.

Na linha do tempo, uma saída aparece como:

~~~text
Operação encerrada · resultado oculto até o fim
~~~

## Encerramento

Quando a prova é encerrada, o bloqueio é removido e os dados passam a aparecer normalmente:

- relatório completo da sessão;
- notas pós-trade;
- win rate;
- payoff;
- R;
- custos;
- líquido;
- demais métricas já implementadas.

## Persistência e reinicialização

O modo `EXAM` é persistido no SQLite.

Se o aplicativo for reiniciado com uma prova ainda marcada como ativa, o histórico reconhece que a sessão é uma prova e mantém o relatório bloqueado.

Isso impede usar o histórico como atalho para visualizar o resultado antecipadamente.

## Cronômetro

O cronômetro é opcional.

Ele mede o tempo real transcorrido desde o início formal da sessão, e não o relógio do replay histórico.

O trader pode mostrar ou ocultar o cronômetro sem alterar:

- velocidade do replay;
- timestamp de mercado;
- candles;
- resultado;
- eventos da sessão.

## Uma entrada por sinal

O Modo Prova e o Treino Livre usam a mesma política:

~~~text
1 gatilho do indicador = no máximo 1 entrada
~~~

Depois que um sinal é consumido, a autorização daquele gatilho não pode ser reutilizada, mesmo que a nuvem continue ativa.

É necessário aguardar um novo sinal do indicador.
