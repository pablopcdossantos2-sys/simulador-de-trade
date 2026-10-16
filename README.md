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
- [ROADMAP detalhado](ROADMAP.md)\n- [Tratamento dos dados do Profit Ultra](docs/TRATAMENTO-DADOS-PROFIT.md)
- [Planejamento da simulação e aquecimento](docs/PLANEJAMENTO-SIMULACAO.md)\n- [Reaproveitamento do Candle Lab](docs/REAPROVEITAMENTO-CANDLE-LAB.md)

## Estado atual

A Fase 1 cria a fundação funcional do simulador:

- seleção entre WINFUT e WDOFUT;
- gráfico didático com o indicador **Multi Médias - Nuvem e Sinais**;
- port do Pine Script para TypeScript por meio do `IndicatorAdapter`;
- MMP/WMA 20, VWAP, MME/EMA 8 e MME/EMA 52 plotadas no gráfico;
- nuvens verde/vermelha e labels COMPRA/VENDA;
- compra/venda condicionadas exclusivamente pelo sinal ativo;\n- tentativa fora das regras bloqueada com pop-up de **Fora do operacional**;\n- modo claro e modo escuro com preferência persistente;
- formulário OCO obrigatório;
- validação de stop e alvo;
- validação do incremento mínimo de preço de WIN/WDO;
- posição única;
- encerramento automático quando stop ou alvo é atingido;
- histórico de operações;
- persistência em SQLite quando executado pelo Tauri;
- fallback para `localStorage` durante desenvolvimento no navegador;
- testes unitários das regras críticas;\n- ferramenta desktop para reduzir CSVs brutos do Profit à faixa horária escolhida e aos campos necessários ao replay;
- planejador prévio de simulação com data, ativo, M2, horário e cálculo de aquecimento;
- aviso dos pregões anteriores necessários antes da coleta dos dados;
- validação para impedir carregar um replay tratado em horário diferente do plano.

> **Importante:** o modo demonstrativo com candles sintéticos continua disponível, mas o aplicativo desktop já possui um player de `.replay.csv` tratado do Profit. Nesse modo, os candles M2 são construídos negócio a negócio e nenhum candle futuro é revelado.

### Regra de autorização do simulador

O Pine gera o label **COMPRA** ou **VENDA** somente no candle que inicia a nuvem. No simulador, esse gatilho cria uma autorização direcional que permanece válida apenas enquanto a própria zona correspondente continuar ativa. Quando o alinhamento que sustenta a nuvem é perdido, a autorização é cancelada e os dois botões voltam a ficar bloqueados.

## Executar em modo web de desenvolvimento

Pré-requisitos: Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite.

## Executar como aplicativo desktop

Além de Node.js/npm, instale os pré-requisitos do Tauri 2 para Windows, incluindo Rust e WebView2.

```bash
npm install
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
- [x] Tratamento do CSV bruto do Profit para 09:00–12:00.
- [x] Arquivo de replay canônico em ordem cronológica.
- [x] Formação M2 negócio a negócio.
- [x] Reprodução, pausa, +1 negócio, reinício e velocidade visual.
- [x] Ocultação dos candles futuros.
- [x] Indicador recalculado durante o candle M2 aberto.
- [x] OCO avaliada negócio a negócio.
- [ ] Seleção explícita de pregão/data.
- [ ] Aquecimento histórico do indicador antes do início do treino.

### Fase 3 — Fidelidade de execução
- [ ] Quantidade de contratos.
- [ ] Slippage configurável.
- [ ] Custos operacionais configuráveis.
- [x] Regras de tick específicas de WIN/WDO.
- [ ] Saída OCO intrabar com política explícita para candles que tocam stop e alvo.

### Fase 4 — Treino e avaliação
- [ ] Métricas por sinal e por sessão.
- [ ] Taxa de respeito ao sinal.
- [ ] Erros evitados pelo bloqueio.
- [ ] R-múltiplos.
- [ ] Relatório pós-sessão.
- [ ] Modo prova sem revelar candles futuros.

### Fase 5 — Distribuição desktop
- [ ] Instalador Windows.
- [ ] Build portátil, se tecnicamente viável.
- [ ] GitHub Actions.
- [ ] Atualizador assinado do Tauri.

## Sobre o OpenTraderWorld

O OpenTraderWorld foi avaliado como referência. Nesta fase não copiamos sua base de código porque ele é uma plataforma ampla, modular e self-hosted via Docker, enquanto este projeto precisa de uma aplicação desktop pequena e focada em replay/execução disciplinada. Essa decisão poderá ser revista se algum módulo específico trouxer ganho claro.

## Aviso

Este software tem finalidade educacional e de treinamento. Não envia ordens reais para corretoras e não constitui recomendação de investimento.
