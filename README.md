# Simulador de Trade — WINFUT e WDOFUT

Simulador educacional de trading criado para treinar a execução disciplinada de um indicador de **Compra/Venda** em WINFUT e WDOFUT.

## Regra central

O simulador **não permite operações aleatórias**:

- uma compra só pode ser aberta quando existir um sinal ativo de **Compra**;
- uma venda só pode ser aberta quando existir um sinal ativo de **Venda**;
- toda entrada deve nascer como uma ordem **OCO**, com **stop loss e alvo obrigatórios**;
- para compras, o stop deve ficar abaixo da entrada e o alvo acima;
- para vendas, o stop deve ficar acima da entrada e o alvo abaixo;
- só pode existir uma posição aberta por vez na primeira versão.

As regras são aplicadas no motor de domínio, e não apenas escondendo botões na interface.

## Tecnologias

A arquitetura segue o padrão de aplicativo desktop local:

- React + TypeScript;
- Vite;
- Tauri 2 + Rust;
- SQLite via `rusqlite` para persistência local;
- Vitest para testar as regras de execução.

Fluxo principal:

```text
Interface React
  ↓
Motor de regras de trading
  ↓
Adaptador do indicador
  ↓
Tauri / Rust
  ↓
SQLite local
```

## Documentação do projeto

- [Arquitetura](docs/ARQUITETURA.md)
- [ROADMAP detalhado](ROADMAP.md)
- [Tratamento dos dados do Profit Ultra](docs/TRATAMENTO-DADOS-PROFIT.md)
- [Validação do índice M1 e seek direto](docs/VALIDACAO-INDICE-M1.md)
- [Planejamento da simulação e aquecimento](docs/PLANEJAMENTO-SIMULACAO.md)
- [Catálogo local de dados preparados](docs/CATALOGO-DADOS.md)
- [Sessão formal de treinamento](docs/SESSAO-TREINO.md)
- [Relatório pós-sessão e métricas](docs/RELATORIO-SESSAO.md)
- [Exportação do relatório de sessão](docs/EXPORTACAO-SESSAO.md)
- [Quantidade de contratos e resultado financeiro](docs/RESULTADO-FINANCEIRO.md)
- [Custos, slippage e resultado líquido](docs/CUSTOS-SLIPPAGE.md)
- [Notas pós-trade](docs/NOTAS-POS-TRADE.md)
- [Modo Prova](docs/MODO-PROVA.md)
- [Resultado por setup/sinal](docs/RESULTADO-POR-SETUP.md)
- [Revisão do relatório de erros — 17/10/2026](docs/REVISAO-RELATORIO-ERROS-2026-10-17.md)
- [Contexto do gráfico na entrada](docs/CONTEXTO-ENTRADA.md)
- [Evolução do trader](docs/EVOLUCAO-TRADER.md)
- [Backup e restauração](docs/BACKUP.md)
- [Instalação no Windows — instalador e portátil](docs/INSTALACAO-WINDOWS.md)
- [Próximas etapas do usuário — tutorial usando CMD](docs/PROXIMAS-ETAPAS-USUARIO-CMD.md)
- [Reaproveitamento do Candle Lab](docs/REAPROVEITAMENTO-CANDLE-LAB.md)

## Estado atual

A Fase 1 cria a fundação funcional do simulador:

- seleção entre WINFUT e WDOFUT;
- gráfico didático com o indicador **Multi Médias - Nuvem e Sinais**;
- port do Pine Script para TypeScript por meio do `IndicatorAdapter`;
- MMP/WMA 20, VWAP, MME/EMA 8 e MME/EMA 52 plotadas no gráfico;
- nuvens verde/vermelha e labels COMPRA/VENDA;
- compra/venda condicionadas exclusivamente pelo sinal ativo;
- tentativa fora das regras bloqueada com pop-up de **Fora do operacional**;
- modo claro e modo escuro com preferência persistente;
- formulário OCO obrigatório;
- validação de stop e alvo;
- validação do incremento mínimo de preço de WIN/WDO;
- posição única;
- encerramento automático quando stop ou alvo é atingido;
- histórico de operações;
- persistência em SQLite quando executado pelo Tauri;
- fallback para `localStorage` durante desenvolvimento no navegador;
- testes unitários das regras críticas;
- ferramenta desktop para reduzir CSVs brutos do Profit à faixa horária escolhida e aos campos necessários ao replay;
- planejador prévio de simulação com data, ativo, M2/M5, horário e cálculo de aquecimento;
- aviso dos pregões anteriores necessários antes da coleta dos dados;
- validação para impedir carregar um replay tratado em horário diferente do plano;
- sessão formal de treinamento com início/fim e persistência local;
- avanço por negócio e por candle no timeframe escolhido;
- registro de tentativas bloqueadas e sinais ignorados;
- resumo de aderência e linha do tempo disciplinar;
- histórico navegável de sessões persistidas;
- separação entre erro disciplinar e problema técnico;
- relatório pós-sessão com pontos, win rate, payoff, profit factor, R, drawdown e resultado por horário/direção;
- exportação JSON versionada e CSV dos trades para sessões concluídas;
- quantidade inteira de contratos na boleta;
- resultado bruto em reais usando os multiplicadores contratuais de WIN/WDO;
- configuração persistente de custos por contrato, slippage por lado e política intrabar para candles OHLC ambíguos;
- resultado líquido por trade e por sessão;
- arredondamento automático de Stop/Alvo ao tick válido;
- notas pós-trade editáveis no histórico da sessão;
- Modo Prova com ocultação dos resultados até o encerramento;
- cronômetro opcional da sessão;
- política de uma única entrada por sinal;
- painel agregado de resultados por WINFUT/WDOFUT;
- snapshot reconstruível do contexto gráfico no instante da entrada, identificado pela versão do algoritmo do indicador;
- aderência aos sinais utilizados versus ignorados;
- painel de evolução histórica por sessão com aderência, R e resultado líquido;
- diagnóstico dos erros evitados pelo bloqueio, agrupado por regra;
- golden test do indicador v1.0.0 e fixture de sessão conhecida;
- backup JSON versionado com exportação/importação nativa e restauração transacional;
- instalador NSIS e executável portátil Windows gerados pelo GitHub Actions;
- catálogo local que informa automaticamente datas disponíveis, faltantes e contratos incompatíveis;
- tratamento em lote orientado pelos requisitos do plano;
- aquecimento histórico invisível antes do replay visível.

> **Importante:** o modo demonstrativo com candles sintéticos continua disponível, mas o aplicativo desktop já possui um player de `.replay.csv` tratado do Profit. Nesse modo, candles M2 ou M5 são construídos negócio a negócio e nenhum candle futuro é revelado.

### Regra de autorização do simulador

O Pine gera o label **COMPRA** ou **VENDA** somente no candle que inicia a nuvem. No simulador, esse gatilho cria uma autorização direcional que permanece válida apenas enquanto a própria zona correspondente continuar ativa. Quando o alinhamento que sustenta a nuvem é perdido, a autorização é cancelada e os dois botões voltam a ficar bloqueados.

## Executar em modo web de desenvolvimento

Pré-requisitos: Node.js 20+ e npm.

O repositório versiona `package-lock.json` e `src-tauri/Cargo.lock`. Use `npm ci` para instalar exatamente as versões frontend validadas; o CI também verifica o Rust com `cargo --locked`.

```bash
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite.

## Executar como aplicativo desktop

Além de Node.js/npm, instale os pré-requisitos do Tauri 2 para Windows, incluindo Rust e WebView2.

```bash
npm ci
npm run tauri dev
```

## Testes

```bash
npm test
```

## ROADMAP resumido

### Fase 1 — Fundação disciplinar
- [x] Arquitetura React + TypeScript + Tauri 2 + Rust.
- [x] Motor de permissões por sinal.
- [x] OCO obrigatório.
- [x] WINFUT e WDOFUT.
- [x] Persistência local inicial.
- [x] Testes das regras críticas.
- [x] Integrar o indicador inicial Multi Médias - Nuvem e Sinais.

### Fase 2 — Replay histórico
- [x] Tratamento do CSV bruto do Profit para a faixa horária definida no plano.
- [x] Arquivo de replay canônico em ordem cronológica.
- [x] Formação M2/M5 negócio a negócio.
- [x] Reprodução, pausa, +1 negócio, reinício e velocidade visual.
- [x] Ocultação dos candles futuros.
- [x] Indicador recalculado durante o candle M2/M5 aberto.
- [x] OCO avaliada negócio a negócio.
- [x] Planejamento explícito de pregão/data/horário.
- [x] Catálogo local e detecção automática de dados faltantes.
- [x] Tratamento em lote dos arquivos exigidos pelo plano.
- [x] Verificação de contrato entre aquecimento e pregão-alvo.
- [x] Aquecimento histórico invisível a partir dos arquivos preparados.

### Fase 3 — Fidelidade de execução
- [x] Quantidade de contratos.
- [x] Resultado bruto em R$.
- [x] Slippage configurável.
- [x] Custos operacionais configuráveis.
- [x] Resultado líquido em R$.
- [x] Arredondamento automático ao tick válido.
- [x] Regras de tick específicas de WIN/WDO.
- [x] Saída OCO intrabar com política explícita para candles OHLC que tocam stop e alvo; no replay negócio a negócio vale a sequência histórica real.

### Fase 4 — Treino e avaliação
- [x] Sessão formal de treinamento.
- [x] Registro de tentativas bloqueadas.
- [x] Registro de sinais ignorados.
- [x] Resumo inicial de aderência e linha do tempo.
- [x] Métricas iniciais por sessão: win rate, payoff, profit factor, R, drawdown, horário e direção.
- [x] Métricas completas por sinal/setup.
- [x] Aderência aos sinais utilizados versus ignorados.
- [x] Evolução histórica do trader por sessão.
- [ ] Aderência ao stop e ao alvo quando houver edição dinâmica dessas ordens.
- [x] Erros evitados pelo bloqueio, agrupados por regra e direção.
- [x] R-múltiplos.
- [x] Relatório pós-sessão inicial.
- [x] Notas pós-trade.
- [x] Modo prova com resultados ocultos até o encerramento.
- [x] Cronômetro opcional.
- [x] Uma entrada por sinal do indicador.

### Fase 5 — Distribuição desktop
- [x] Instalador Windows NSIS.
- [x] Executável portátil Windows.
- [x] GitHub Actions para build Windows x64 com dependências travadas por `package-lock.json`.
- [ ] Atualizador assinado do Tauri.

## Sobre o OpenTraderWorld

O OpenTraderWorld foi avaliado como referência. Nesta fase não copiamos sua base de código porque ele é uma plataforma ampla, modular e self-hosted via Docker, enquanto este projeto precisa de uma aplicação desktop pequena e focada em replay/execução disciplinada. Essa decisão poderá ser revista se algum módulo específico trouxer ganho claro.

## Aviso

Este software tem finalidade educacional e de treinamento. Não envia ordens reais para corretoras e não constitui recomendação de investimento.
