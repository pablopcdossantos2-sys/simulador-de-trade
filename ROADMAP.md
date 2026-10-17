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
- [x] Implementar ReplayTrade em streaming a partir do `.replay.csv`.
- [x] Implementar agregador incremental de candles M2.
- [x] Avaliar OCO em cada negócio, não apenas no OHLC fechado.
- [x] Recalcular o indicador no candle M2 aberto a cada negócio.
- [x] Definir formato canônico de candle M2 incremental.
- [x] Criar ferramenta desktop para tratar CSV bruto do Profit.
- [x] Permitir escolher horário inicial/final no tratamento.
- [x] Validar layout, colunas e timestamps no tratamento inicial.
- [x] Interromper o tratamento com diagnóstico da linha inválida.
- [x] Tratamento em lote dos pregões exigidos pelo plano.
- [x] Catálogo local de arquivos preparados e detecção de datas faltantes.
- [x] Aquecimento automático e invisível antes da janela visível.
- [ ] Importar histórico de WIN.
- [ ] Importar histórico de WDO.
- [x] Não revelar candles futuros.
- [x] Play / pause.
- [x] Avanço de um candle sem revelar o primeiro negócio do candle seguinte.
- [x] Avanço manual de um negócio.
- [x] Velocidades de reprodução visual 1× / 2× / 5× / 10×.
- [x] Seleção de timeframe M2/M5 integrada ao planejamento, aquecimento, replay e avanço por candle.
- [x] Planejamento prévio por ativo, data, timeframe e janela horária.
- [x] Cálculo automático de aquecimento do indicador.
- [x] Aviso dos pregões anteriores necessários no calendário B3 2026.
- [x] Aviso inicial de vencimento do WIN para evitar mistura indevida de contratos.
- [x] Sincronizar a janela do plano com o tratamento dos dados.
- [x] Validar a janela do arquivo carregado contra o plano ativo.
- [x] Seleção automática do pregão-alvo compatível no catálogo local.
- [x] Reiniciar sessão sem apagar histórico.
- [x] Indicador calculado apenas com dados já revelados.

## Fase 3 — Motor de execução

- [x] Quantidade inteira de contratos.
- [x] Tick size por ativo.
- [x] Rejeição de preços fora do incremento mínimo permitido.
- [x] Arredondamento automático para o tick válido mais próximo, mantendo validação no domínio.
- [x] Custos operacionais configuráveis por contrato/round trip.
- [x] Slippage configurável em ticks por lado.
- [x] Resultado em pontos.
- [x] Resultado financeiro bruto em R$ por ativo/quantidade.
- [x] Resultado financeiro líquido após custos e slippage.
- [x] Risco inicial em pontos derivado da OCO e múltiplos de R no relatório.
- [x] Política intrabar configurável para candles OHLC ambíguos, com STOP_FIRST conservador por padrão e TARGET_FIRST opcional; replay negócio a negócio mantém a sequência real.
- [x] Suporte a dados negócio a negócio tratados do Profit.
- [x] Validade inicial: autorização permanece enquanto a zona correspondente estiver ativa.
- [x] Definir política: cada sinal autoriza no máximo uma entrada.
- [x] Impedir reutilização do mesmo sinal após a primeira entrada.

## Fase 4 — Treino

- [x] Modo treino livre dentro das regras com sessão formal.
- [x] Modo prova persistido por sessão.
- [x] Ocultar resultados da prova atual até o encerramento.
- [x] Cronômetro real opcional da sessão.
- [x] Feedback disciplinar inicial com linha do tempo e aderência.
- [x] Registrar sinais ignorados sem classificá-los automaticamente como erro.
- [x] Registrar tentativas bloqueadas.
- [x] Distinguir problema técnico de erro disciplinar/execução.
- [x] Notas pós-trade persistidas por operação.
- [x] Captura estruturada e reconstruível do contexto gráfico no momento da entrada, sem candles futuros.

## Fase 5 — Métricas

- [x] Win rate por sessão.
- [x] Payoff por sessão.
- [x] Expectativa realizada em R por sessão.
- [x] Profit factor por sessão.
- [x] Drawdown máximo em pontos por sessão.
- [x] Resultado agregado por ativo (WINFUT/WDOFUT).
- [x] Resultado por horário de entrada.
- [x] Resultado por direção (Compra/Venda).
- [ ] Resultado por tipo de sinal/setup.
- [x] Aderência aos sinais utilizados versus ignorados.
- [ ] Aderência ao stop.
- [ ] Aderência ao alvo.
- [x] Relatório completo por sessão com exportação JSON versionada e CSV dos trades.
- [x] Relatório pós-sessão inicial navegável.
- [x] Resumo disciplinar da sessão atual.
- [x] Evolução do aluno ao longo do tempo com série por sessão encerrada.

## Fase 6 — Experiência desktop

- [x] Tela inicial de configurações de execução (custos/slippage).
- [ ] Ampliar tela de configurações para demais preferências.
- [x] Banco SQLite com backup JSON versionado e restauração transacional.
- [x] Exportação/importação do histórico por diálogos nativos, com mesclagem por ID.
- [x] Instalador Windows NSIS gerado e validado no GitHub Actions.
- [x] Build portátil Windows gerado e validado como executável independente do instalador.
- [x] Pipeline de build Windows x64 com instalador + portátil como artefato.
- [ ] Assinatura de releases.
- [ ] Atualizador Tauri.
- [ ] Pipeline de release no GitHub Actions.

## Fase 7 — Qualidade

- [x] Testes adicionais para SELL, incluindo slippage, stop e alvo.
- [x] Testes iniciais de importação/tratamento.
- [x] Testes iniciais de replay, catálogo e aquecimento.
- [x] Teste inicial do esquema de persistência SQLite.
- [x] Golden test de regressão do indicador v1.0.0.
- [x] Fixture de sessão conhecida com métricas esperadas.
- [x] Política explícita de versionamento do algoritmo do indicador e gravação da versão nos snapshots de entrada.
- [x] Dependências frontend travadas em `package-lock.json` e pipelines usando `npm ci`.
- [x] Dependências Rust/Tauri travadas em `src-tauri/Cargo.lock` e CI validando com `--locked`.
