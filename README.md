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

## Estado atual

A Fase 1 cria a fundação funcional do simulador:

- seleção entre WINFUT e WDOFUT;
- gráfico didático em modo de demonstração;
- sinais de demonstração por um `IndicatorAdapter`;
- compra/venda desbloqueadas exclusivamente pelo sinal ativo;
- formulário OCO obrigatório;
- validação de stop e alvo;
- posição única;
- encerramento automático quando stop ou alvo é atingido;
- histórico de operações;
- persistência em SQLite quando executado pelo Tauri;
- fallback para `localStorage` durante desenvolvimento no navegador;
- testes unitários das regras críticas.

> **Importante:** o sinal atualmente incluído é somente um gerador de demonstração. Ele **não reproduz o indicador do TradingView**. Para integrar o indicador real, a lógica Pine Script precisa ser portada para o adaptador TypeScript (ou outra fonte de sinais precisa ser definida).

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
- [ ] Substituir o sinal de demonstração pelo indicador real.

### Fase 2 — Replay histórico
- [ ] Importação de candles históricos por CSV.
- [ ] Reprodução candle a candle.
- [ ] Controle de velocidade, pausa e avanço manual.
- [ ] Ocultação dos candles futuros.
- [ ] Controle de sessão e horários da B3.

### Fase 3 — Fidelidade de execução
- [ ] Quantidade de contratos.
- [ ] Slippage configurável.
- [ ] Custos operacionais configuráveis.
- [ ] Regras de tick específicas de WIN/WDO.
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
