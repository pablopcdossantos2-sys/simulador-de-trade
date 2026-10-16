# ROADMAP — Simulador de Trade

## Princípios permanentes

- [x] Sem sinal válido, não há entrada.
- [x] Compra só é autorizada por sinal de Compra.
- [x] Venda só é autorizada por sinal de Venda.
- [x] Toda entrada exige stop loss e alvo.
- [x] As restrições existem no motor de domínio, não apenas na interface.
- [ ] O simulador nunca enviará ordens reais para uma corretora sem um projeto separado e uma decisão explícita de escopo.

## Fase 1 — Fundação disciplinar

- [x] React + TypeScript + Vite.
- [x] Tauri 2 + Rust.
- [x] SQLite local.
- [x] WINFUT e WDOFUT.
- [x] Interface inicial com gráfico e boleta.
- [x] `IndicatorAdapter`.
- [x] Indicador sintético temporário usado apenas na fundação inicial.
- [x] Port do indicador Multi Médias - Nuvem e Sinais.
- [x] MMP 20, VWAP, MME 8 e MME 52 no gráfico.
- [x] Estados persistentes de nuvem verde/vermelha.
- [x] Labels COMPRA/VENDA no candle de gatilho.
- [x] Autorização operacional cancelada ao fim da zona.
- [x] Bloqueio de operações sem sinal.
- [x] Bloqueio da direção contrária.
- [x] OCO obrigatória.
- [x] Validação geométrica do stop/alvo.
- [x] Posição única no MVP.
- [x] Resolução automática do OCO.
- [x] Persistência do histórico.
- [x] Testes unitários das invariantes centrais.
- [x] CI para teste/build/check.
- [x] Integrar o indicador Pine Script inicial.

## Fase 2 — Dados e replay histórico

Arquitetura definida a partir dos componentes validados no Candle Lab. Ver [Reaproveitamento do Candle Lab](docs/REAPROVEITAMENTO-CANDLE-LAB.md).

- [x] Definir estratégia de fonte bruta externa + índice local leve.
- [x] Definir índice-base M1 capaz de localizar M2 por linhas/bytes.
- [x] Definir modelo mínimo de evento: timestamp + sequência + preço + quantidade.
- [x] Portar parser Profit inicial do Candle Lab para Rust.
- [ ] Portar indexador temporal M1 para Rust.
- [ ] Implementar seek direto no CSV original por pregão.
- [ ] Implementar ReplayTrade em streaming.
- [ ] Implementar agregador incremental de candles M2.
- [ ] Avaliar OCO em cada negócio, não apenas no OHLC fechado.
- [ ] Recalcular o indicador no candle M2 aberto a cada negócio.
- [ ] Definir formato canônico de candle.
- [x] Criar ferramenta desktop para tratar CSV bruto do Profit.
- [x] Validar layout, colunas e timestamps no tratamento inicial.
- [x] Interromper o tratamento com diagnóstico da linha inválida.
- [ ] Importar histórico de WIN.
- [ ] Importar histórico de WDO.
- [ ] Não revelar candles futuros.
- [ ] Play / pause.
- [ ] Avanço de um candle.
- [ ] Velocidades de reprodução.
- [ ] Seleção de timeframe.
- [ ] Seleção de pregão/data.
- [ ] Reiniciar sessão sem apagar histórico.
- [ ] Indicador calculado apenas com dados já revelados.

## Fase 3 — Motor de execução

- [ ] Quantidade de contratos.
- [x] Tick size por ativo.
- [x] Rejeição de preços fora do incremento mínimo permitido.
- [ ] Arredondamento obrigatório para níveis válidos.
- [ ] Custos operacionais configuráveis.
- [ ] Slippage configurável.
- [ ] Resultado em pontos.
- [ ] Resultado financeiro.
- [ ] Risco inicial e múltiplos de R.
- [ ] Política intrabar configurável.
- [ ] Suporte a dados de tick quando disponíveis.
- [x] Validade inicial: autorização permanece enquanto a zona correspondente estiver ativa.
- [ ] Definir se um mesmo sinal pode autorizar mais de uma operação após a primeira ser encerrada.
- [ ] Impedir reutilização indevida de sinais, conforme a regra definitiva do indicador.

## Fase 4 — Treino

- [ ] Modo treino livre dentro das regras.
- [ ] Modo prova.
- [ ] Ocultar resultado até o encerramento da sessão.
- [ ] Cronômetro opcional.
- [ ] Feedback de disciplina.
- [ ] Registrar sinais ignorados.
- [ ] Registrar tentativas bloqueadas.
- [ ] Distinguir erro técnico de erro de execução.
- [ ] Notas pós-trade.
- [ ] Captura do contexto do gráfico no momento da entrada.

## Fase 5 — Métricas

- [ ] Win rate.
- [ ] Payoff.
- [ ] Expectativa em R.
- [ ] Profit factor.
- [ ] Drawdown.
- [ ] Resultado por ativo.
- [ ] Resultado por horário.
- [ ] Resultado por tipo/direção de sinal.
- [ ] Aderência ao sinal.
- [ ] Aderência ao stop.
- [ ] Aderência ao alvo.
- [ ] Relatório por sessão.
- [ ] Evolução do aluno ao longo do tempo.

## Fase 6 — Experiência desktop

- [ ] Tela de configurações.
- [ ] Banco e backup.
- [ ] Exportação/importação do histórico.
- [ ] Instalador Windows.
- [ ] Avaliar build portátil.
- [ ] Assinatura de releases.
- [ ] Atualizador Tauri.
- [ ] Pipeline de release no GitHub Actions.

## Fase 7 — Qualidade

- [ ] Testes adicionais para SELL.
- [ ] Testes de importação.
- [ ] Testes de replay.
- [ ] Testes de persistência.
- [ ] Testes de regressão do indicador.
- [ ] Fixtures com sessões conhecidas.
- [ ] Política explícita de versionamento do algoritmo do indicador.
