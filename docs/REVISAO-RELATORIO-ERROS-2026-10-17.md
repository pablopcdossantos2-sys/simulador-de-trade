# Revisão do relatório de erros — 17/10/2026

Este documento registra a confrontação do relatório externo com o estado atual da branch `main`.

O relatório analisado foi produzido sobre um commit anterior. Por isso, vários itens descritos como falhas já haviam sido corrigidos quando esta revisão foi executada.

## Alta severidade

### 1. Teste de ordenação por setup

**Status: corrigido nesta rodada.**

O teste esperava `Legado / sem classificação` antes do setup positivo, enquanto `performanceBySetup` ordena primeiro por quantidade de trades e depois por pontos líquidos.

A expectativa foi alinhada à regra efetiva de ordenação.

### 2. OCO do replay podia perder toques dentro de um lote

**Status: já corrigido na main antes desta revisão.**

A OCO do replay é resolvida sincronamente no callback de cada `ReplayTrade`, usando `positionRef`. Ela não depende mais de um render React para verificar Stop/Alvo.

Assim, o avanço `+1 candle` continua processando cada negócio individualmente antes de seguir para o próximo.

### 3. Mistura UTC × horário cru de mercado

**Status: já corrigido na main antes desta revisão.**

No replay:

- `openedAt` usa diretamente o timestamp do negócio de mercado;
- `closedAt` usa o timestamp do negócio que encerra a OCO;
- agrupamentos de candle usam utilitários de `marketTime.ts`;
- testes garantem que 09:00 BRT não vire 12:00 no relatório.

O objetivo é tratar os timestamps do Profit como relógio de mercado, sem conversão implícita pelo fuso do computador.

### 4. Modo Prova mostrava operações na lista global

**Status: já corrigido na main antes desta revisão.**

A tabela de últimas operações usa `historyTradesForDisplay`, que remove trades pertencentes à prova ativa.

Painéis agregados e relatórios da prova ativa também permanecem bloqueados até o encerramento.

### 5. Erro em uma linha do replay descartava o lote já lido

**Status: já corrigido; teste de regressão acrescentado nesta rodada.**

O backend mantém `pending_error`.

Comportamento esperado:

1. negócios válidos acumulados antes da linha ruim são devolvidos normalmente;
2. o erro é entregue na próxima chamada;
3. os negócios posteriores continuam com sequência consistente se a leitura prosseguir.

Foi acrescentado teste Rust específico para esse fluxo.

### 6. Exceção de replay podia derrubar toda a interface

**Status: já corrigido na main antes desta revisão.**

O cálculo de replay não ocorre mais dentro de um updater React que possa explodir durante render.

Além disso, a aplicação já possui `AppErrorBoundary` envolvendo `App`.

### 7. Troca de plano durante treino corrompia o estado

**Status: já corrigido na main antes desta revisão.**

O planejador fica bloqueado enquanto houver:

- sessão ativa;
- posição aberta;
- início de sessão em andamento.

Ao trocar o plano fora dessas condições, um replay carregado é descarregado antes da troca de ativo/plano.

## Média severidade

### Replay termina com posição aberta

**Status: corrigido.**

Existe ação explícita **Encerrar a mercado no último preço** quando o replay termina com posição aberta.

O sistema não inventa uma saída automática sem ação do usuário.

### Sinais em candle em formação

**Status: mantido por decisão atual de produto.**

O projeto foi desenhado para recalcular indicador e autorização negócio a negócio no candle M2/M5 aberto.

Eventos de sinal ignorado são deduplicados por `signalId`.

Não foi alterado para candle fechado nesta revisão porque isso mudaria uma decisão funcional já adotada para o replay.

### Stop/Alvo sobrescritos a cada candle

**Status: já corrigido.**

A sugestão automática é executada somente quando aparece um novo `signal.id`.

### Feedback de Stop/Alvo sobrescrito

**Status: já corrigido.**

Existe proteção para preservar o feedback de encerramento antes que efeitos automáticos de sinal atualizem a mensagem.

### Clique duplo em Iniciar treino

**Status: já corrigido.**

`startingTrainingRef` e `startingTraining` impedem início concorrente, e falha no reset impede a criação da sessão.

### Corrida load/reset/pullOne

**Status: já corrigido.**

`generationRef` invalida respostas/chunks de gerações anteriores.

### Slippage na saída por alvo

**Status: mantido como política de modelagem.**

O rótulo da interface usa **Alvo acionado**, não presume execução exatamente no nível do alvo.

O slippage configurado é adverso na entrada e na saída.

Essa política poderá ser revista futuramente se o projeto separar semanticamente ordem limite de alvo e ordem a mercado/stop.

### Preparação de CSV

**Status: já corrigido.**

A preparação atual:

- rejeita símbolo vazio;
- rejeita preço/quantidade não finitos ou <= 0;
- rejeita arquivo contendo mais de um pregão;
- usa arquivo temporário com limpeza automática;
- substitui o replay existente com estratégia de backup/rename;
- reduziu o buffer do modo descendente para evitar reler blocos muito grandes;
- identifica operações de progresso por `operationId`.

### Importação de backup

**Status: já corrigido.**

A importação:

- exige JSON;
- valida parâmetros críticos;
- é transacional;
- usa `ON CONFLICT DO NOTHING` para sessões/trades/eventos, preservando registros locais existentes.

### Segurança Tauri

**Status: já corrigido em parte relevante.**

A aplicação possui CSP explícito e restritivo em `tauri.conf.json`.

Exportação/importação de backup valida extensão `.json`.

### Calendário B3

**Status: limitação conhecida, não alterada nesta revisão.**

O alvo de simulação continua deliberadamente restrito ao calendário incorporado de 2026.

Aquecimento anterior possui suporte auxiliar a 2025.

Expansão para 2027 deve ser feita com calendário B3 verificado, e não por inferência automática.

### Catálogo JSON

**Status: já corrigido.**

A escrita usa arquivo temporário + rename + backup de recuperação.

A listagem não regrava o catálogo a cada consulta.

## Baixa severidade

### R$ renderizado incorretamente

**Status: já corrigido.**

Os rótulos atuais usam `R$` de forma explícita.

### CSV para Excel

**Status: já corrigido.**

A exportação atual:

- usa BOM UTF-8;
- usa `;` como separador;
- usa vírgula decimal;
- limita ruído de ponto flutuante;
- protege contra formula injection;
- não despeja mais todo o snapshot de candles em uma única célula.

### Ano com dois dígitos

**Status: já corrigido.**

`parse_date` decide entre `%y` e `%Y` pela quantidade de dígitos do ano.

### normalize_hhmm multibyte

**Status: já corrigido e testado.**

A função usa `.chars().take(5)` em vez de slice de bytes.

### Ordenação SQLite

**Status: ajustado nesta rodada.**

Foram removidos desempates duplicados e acrescentado `id ASC` onde ainda faltava.

### Migração SQLite sem user_version

**Status: permanece como melhoria futura.**

O esquema atual faz migrações incrementais por presença de coluna.

Adicionar versionamento formal de esquema é desejável, mas foi mantido fora desta rodada para não transformar uma revisão corretiva em uma migração estrutural extensa.

### Comandos Tauri síncronos

**Status: parcialmente mitigado.**

Operações de alto custo já usam caminhos específicos/assíncronos onde necessário, e o backup libera o mutex antes de escrever o arquivo.

Uma auditoria completa de comandos bloqueantes continua válida como melhoria de arquitetura.

## Testes de regressão importantes existentes

A suíte atual cobre, entre outros:

- relógio de mercado sem deslocamento por fuso;
- agrupamento M2/M5;
- OCO negócio a negócio;
- timestamp de abertura do replay preservado;
- replay fora de ordem;
- SELL;
- slippage;
- política intrabar;
- encerramento a mercado no fim do replay;
- setup por versão do indicador;
- exportações;
- migrações SQLite.

Esta revisão adicionou cobertura explícita para o comportamento de lote válido seguido por linha inválida no backend Rust.
