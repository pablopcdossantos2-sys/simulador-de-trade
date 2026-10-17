# Revisão técnica — relatório de erros de 17/10/2026

Este documento registra as decisões tomadas após comparar o relatório de auditoria
feito sobre o commit `b3afb40` com o estado posterior da branch `main`.

O objetivo não foi aplicar mecanicamente todos os apontamentos, mas verificar quais
problemas ainda existiam e corrigir os que permaneciam relevantes.

## Alta severidade

### 1. Teste de resultado por setup

**Status: corrigido.**

O teste esperava uma ordem diferente da ordenação definida em
`performanceBySetup`. O fixture foi alinhado à regra documentada:

1. maior quantidade de trades;
2. maior resultado em pontos;
3. nome do setup como desempate.

### 2. OCO podia perder toque no meio de um lote do replay

**Status: corrigido.**

A OCO do replay deixou de depender do próximo render do React.

Cada `ReplayTrade` agora:

1. atualiza o candle incremental;
2. consulta a posição por uma referência síncrona;
3. executa `resolveOcoTrade` antes do próximo negócio;
4. persiste o encerramento imediatamente se stop/alvo tiver sido acionado.

Isso também vale para o comando `+1 candle`, que pode processar muitos negócios
antes de um novo render.

### 3. Mistura UTC × horário do mercado

**Status: corrigido.**

Foi introduzida uma camada de horário de mercado que trata os timestamps do Profit
como relógio da sessão, sem deslocá-los automaticamente para UTC.

Isso é usado em:

- formação de candles;
- entrada do trade;
- agrupamento por horário;
- VWAP por sessão/semana/mês/ano;
- CSV;
- snapshots de entrada.

Para históricos anteriores, o relatório prefere
`entryContext.marketTimestamp` quando disponível.

### 4. Vazamento de resultados no Modo Prova

**Status: corrigido.**

A tabela de últimas operações passou a usar `historyTradesForDisplay`, o mesmo
conjunto filtrado que oculta os trades pertencentes à prova ativa.

### 5. Leitor Rust descartava negócios válidos antes de uma linha ruim

**Status: corrigido.**

O leitor agora:

- ignora linhas vazias;
- preserva o lote já lido;
- armazena o erro encontrado;
- devolve esse erro na chamada seguinte;
- incrementa a sequência somente para registros válidos.

### 6. Exceção de replay podia derrubar a interface

**Status: corrigido.**

A agregação de candles não ocorre mais dentro do updater de estado do React.

Também foi adicionado um `AppErrorBoundary` no topo da aplicação para impedir
uma tela branca sem diagnóstico caso uma exceção inesperada alcance o render.

### 7. Alterar o plano podia corromper uma sessão ativa

**Status: corrigido.**

O planejador fica bloqueado durante:

- sessão ativa;
- posição aberta;
- início de sessão em andamento.

Quando não existe sessão/posição, mas existe um replay carregado, o replay é
descarregado antes de o novo plano ser aplicado.

## Média severidade

### Replay termina com posição aberta

**Status: corrigido com decisão explícita do usuário.**

O simulador não inventa uma saída automaticamente.

No fim do replay, se ainda houver posição aberta, aparece:

> Encerrar a mercado no último preço

O encerramento usa `SESSION_END` como motivo próprio.

### Sinal oscila dentro do candle aberto

**Status: comportamento intrabar mantido; efeitos colaterais corrigidos.**

O projeto continuará recalculando o indicador negócio a negócio durante o candle
aberto porque essa é uma característica intencional do treino.

Foram corrigidos:

- duplicação de `SIGNAL_IGNORED` pelo mesmo `signalId`;
- sobrescrita repetida de Stop/Alvo quando o mesmo sinal reaparece;
- reentrada após um sinal já consumido.

### Stop/Alvo sugeridos eram sobrescritos

**Status: corrigido.**

A sugestão automática é associada ao `signal.id`. Depois disso, alterações
manuais do trader são preservadas enquanto não surge um gatilho realmente novo.

### Feedback de encerramento era sobrescrito

**Status: corrigido.**

O feedback de saída recebe prioridade no ciclo imediatamente posterior ao
encerramento.

### Clique duplo em Iniciar treino

**Status: corrigido.**

Existe trava síncrona de início e a sessão não é criada se o reset do replay falhar.

### Corrida entre load/reset e pullOne

**Status: corrigido.**

O player usa uma geração interna. Respostas/chunks de uma geração anterior são
ignorados depois de load, reset, unload ou desmontagem.

### Slippage na saída por alvo

**Status: mantido por decisão de modelagem.**

O slippage é adverso tanto na entrada quanto na saída, inclusive quando o nível
do alvo dispara o encerramento.

Para evitar ambiguidade, a UI usa **“Alvo acionado”** e não afirma que o preço
executado foi exatamente o alvo.

### Preparação do CSV do Profit

**Status: reforçado.**

Foram adicionadas proteções para:

- símbolo vazio;
- preço/quantidade não positivos;
- números não finitos;
- mais de um pregão no mesmo arquivo;
- limpeza do temporário em erro;
- substituição mais segura do replay existente;
- buffer menor no caminho DESCENDING com seeks;
- parsing explícito de ano com 2 ou 4 dígitos.

### Importação de backup

**Status: reforçado.**

O backup agora valida configurações, trades e sessões antes da transação.

Conflitos de IDs na importação não sobrescrevem silenciosamente o registro local
existente, preservando notas e dados mais recentes.

A importação/exportação de backup também exige extensão `.json`.

### Segurança Tauri

**Status: parcialmente reforçado.**

Foi habilitado CSP restritivo em produção e `devCsp` separado para permitir
somente o localhost usado pelo Vite durante o desenvolvimento.

Os comandos continuam recebendo caminhos escolhidos pelo frontend. Uma política
de capability/path-token mais restritiva pode ser estudada numa fase posterior.

### Calendário B3

**Status: corrigido para a fronteira 2025 → 2026.**

O aquecimento de janeiro/2026 agora conhece também os fechamentos relevantes de
2025, inclusive 24, 25 e 31 de dezembro.

O alvo de planejamento continua deliberadamente limitado ao calendário oficial
incorporado de 2026. Suporte a 2027+ deverá usar calendário anual versionado, em
vez de inferir feriados.

### Catálogo local

**Status: corrigido.**

A gravação passou a usar arquivo temporário e recuperação do arquivo anterior.

A listagem de catálogo deixou de regravar o JSON em uma operação apenas de leitura.

## Baixa severidade

### Símbolo R$

**Status: corrigido.**

### CSV

**Status: reforçado.**

O CSV agora usa:

- BOM UTF-8;
- separador `;`;
- vírgula decimal;
- proteção contra formula injection;
- valores numéricos arredondados;
- campos compactos de contexto em vez do snapshot inteiro em uma célula.

O JSON continua sendo a exportação completa.

### Datas com ano de dois dígitos

**Status: corrigido e coberto por teste.**

### normalize_hhmm

**Status: corrigido.**

Usa caracteres em vez de slice por byte.

### Migrações SQLite

**Status: reforçado.**

Migrações que exigem `ALTER + UPDATE` usam `SAVEPOINT`, e o banco recebe
`PRAGMA user_version`.

### Ordenação SQLite

**Status: corrigido.**

Consultas relevantes receberam `id` como desempate determinístico.

### Promises/localStorage

**Status: reforçado.**

Falhas de preferência de tema e persistência assíncrona já não ficam sem tratamento.

### Nome do backup

**Status: corrigido.**

A data do nome usa o calendário local do computador em vez de UTC.

### VWAP Session

**Status: corrigido pela camada de horário de mercado.**

### Progresso de tratamento simultâneo

**Status: corrigido.**

Cada tratamento recebe um `operationId`; o frontend ignora eventos de progresso
de outras operações.

## CI

O workflow de CI foi alterado para validar cada SHA sem cancelar execuções de
commits anteriores. Isso torna mais lento um período com muitos commits, mas evita
que uma validação Rust seja mascarada por um commit posterior.

Durante esta revisão, um teste Rust detectou corretamente que o caminho
DESCENDING não removia o temporário após a substituição atômica. A implementação
foi corrigida para manter o contrato original do teste.

## Complemento após evolução posterior da main

Uma nova comparação com o relatório original foi feita depois das evoluções de
relatório por setup/sinal.

Foram encontrados e corrigidos três resíduos/regressões:

1. **Teste de setup:** o fixture voltou a ser alinhado à ordenação real
   (`trades`, depois pontos líquidos e nome como desempate).
2. **Rótulos em R$:** duas ocorrências de quebra literal no JSX foram removidas.
3. **Calendário futuro:** datas-alvo de anos sem calendário B3 incorporado agora
   são rejeitadas explicitamente, evitando tratar silenciosamente um feriado de
   2027+ como pregão normal.

Também foi concluída a métrica **Resultado por setup/sinal**, usando o snapshot
da entrada. Trades anteriores à captura estruturada permanecem no grupo
**Legado / sem classificação**, sem inferência artificial.

O relatório JSON de sessão passou ao schema v2 com `setupPerformance`, e o CSV
passou a incluir a coluna `setup`.
