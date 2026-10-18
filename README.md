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

O aplicativo já reúne as seguintes funcionalidades:

- seleção entre WINFUT e WDOFUT;
- gráfico didático com o indicador **Multi Médias - Nuvem e Sinais**;
- port do Pine Script para TypeScript por meio do `IndicatorAdapter`;
- MMP/WMA 20, VWAP, MME/EMA 8 e MME/EMA 52 plotadas no gráfico;
- nuvens verde/vermelha e labels COMPRA/VENDA;
- compra/venda condicionadas por sinal ativo; reentrada pela MME 52 permitida somente na mesma direção, após toque em candle fechado e por até três candles;
- tentativa fora das regras bloqueada com pop-up de **Fora do operacional**;
- modo claro e modo escuro com preferência persistente;
- formulário OCO obrigatório;
- validação de stop e alvo;
- risco/retorno mínimo nominal de 1:2, revalidado com slippage e custos estimados;
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
- golden test do indicador v1.1.0 (EMA inicializada por SMA) e fixture de sessão conhecida;
- backup JSON versionado com importação por mesclagem ou substituição total, restauração transacional e exportação protegida contra arquivo truncado;
- instalador NSIS e executável portátil Windows gerados pelo GitHub Actions;
- catálogo local que informa automaticamente datas disponíveis, faltantes e contratos incompatíveis;
- tratamento em lote orientado pelos requisitos do plano;
- aquecimento histórico invisível antes do replay visível.

> **Importante:** o modo demonstrativo com candles sintéticos continua disponível, mas o aplicativo desktop já possui um player de `.replay.csv` tratado do Profit. Nesse modo, candles M2 ou M5 são construídos negócio a negócio e nenhum candle futuro é revelado.

### Regra de autorização do simulador

O Pine gera o label **COMPRA** ou **VENDA** somente no candle que inicia a nuvem. No replay histórico, os sinais são avaliados apenas em candles fechados; quando um novo sinal válido surge, a reprodução pausa para que a decisão não dependa da velocidade escolhida. A autorização direcional permanece válida enquanto a zona correspondente continuar ativa. Quando o alinhamento é perdido, os botões voltam a ficar bloqueados. Após encerrar uma operação, a reentrada na mesma direção só é autorizada por toque em candle fechado na MME 52, zona ainda alinhada e expiração de três candles.

## Executar em modo web de desenvolvimento

Pré-requisitos: Node.js 20.19+ (linha 20) ou 22.12+ e npm.

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

## Roadmap

O plano completo e o estado de cada etapa ficam centralizados em [`ROADMAP.md`](ROADMAP.md), evitando manter duas listas de fases que possam divergir.

## Sobre o OpenTraderWorld

O OpenTraderWorld foi avaliado como referência. Nesta fase não copiamos sua base de código porque ele é uma plataforma ampla, modular e self-hosted via Docker, enquanto este projeto precisa de uma aplicação desktop pequena e focada em replay/execução disciplinada. Essa decisão poderá ser revista se algum módulo específico trouxer ganho claro.

## Aviso

Este software tem finalidade educacional e de treinamento. Não envia ordens reais para corretoras e não constitui recomendação de investimento.
