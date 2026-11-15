# ROADMAP — Simulador de Trade

## Princípios permanentes

- [x] O simulador é educacional e não envia ordens reais.
- [x] Compra e venda dependem de sinal válido ou reentrada autorizada na mesma direção.
- [x] Toda entrada exige uma OCO válida e risco/retorno mínimo de 1:2.
- [x] As regras são aplicadas no motor de domínio, não apenas na interface.
- [x] Dados e histórico do usuário são mantidos localmente.

## Fase 1 — Indicador e motor operacional

- [x] React + TypeScript + Vite, Tauri 2 + Rust e SQLite local.
- [x] WINFUT e WDOFUT.
- [x] Indicador Multi Médias - Nuvem e Sinais: MME 8, MMP 20, MME 52 e VWAP.
- [x] Zonas direcionais e sinais Compra/Venda.
- [x] OCO obrigatória, validação de tick, stop/alvo e risco/retorno mínimo 1:2.
- [x] Custos, slippage, encerramento manual e histórico de operações.
- [x] Backup JSON, restauração transacional e catálogo local de dados.
- [x] CI e geração de instalador NSIS e executável portátil Windows.

## Fase 2 — Fonte OHLCV M2 e replay

A fonte disponível no Profit é o histórico de candles M1 (1 minuto). O aplicativo deve manter os CSVs brutos intactos e agregar pares cronológicos de candles M1 em candles M2 derivados, com uma linha por candle. Não exigir nem presumir que o Profit exporte M2.

- [x] Definir formato canônico OHLCV M2.
- [x] Detectar cabeçalhos OHLCV M1, delimitadores e formatos de data/preço do Profit a partir de amostras reais WIN.
- [x] Validar ativo/contrato, janela horária, grade M1, OHLC, volume e tick do instrumento (testes automatizados e amostras WIN).
- [x] Agregar M1 em M2: abertura do primeiro minuto, máxima/mínima extremas, fechamento do segundo minuto e quantidade negociada somada.
- [x] Definir e validar o alinhamento dos pares M1, rejeição de lacunas internas e descarte de candles M1 incompletos nas bordas.
- [x] Preparar um replay compacto por pregão a partir dos candles M1 agregados, sem manter negócios tick a tick.
- [x] Aquecer o indicador diretamente com candles M2 anteriores, sem desenhá-los.
- [x] Manter compatibilidade de leitura com arquivos legados de negócios individuais.
- [ ] Validar a importação contra amostras reais de CSV M1 exportadas pelo Profit para WIN e WDO.
- [ ] Confirmar o comportamento do timestamp do CSV do Profit (abertura ou fechamento do candle) com amostras reais.
- [ ] Validar o ganho de tamanho dos arquivos M2 derivados em relação aos CSVs M1 de origem.
- [ ] Testar o replay de pregão completo, inclusive pausas, reinício, avanço de segundo e avanço de candle.

### Movimento intrabar sintético

- [x] Gerar até 120 preços por candle M2.
- [x] Começar na abertura, terminar no fechamento e respeitar máxima/mínima.
- [x] Respeitar o tick do WIN e do WDO.
- [x] Usar semente determinística por candle para que o replay seja repetível.
- [x] Testar a recuperação do replay M2 após candle duplicado, preservando o lote válido anterior e retomando no próximo candle correto.
- [x] Distribuir o volume OHLCV ao longo dos segundos simulados.
- [ ] Comparar a sensação visual do percurso com o movimento esperado no gráfico e ajustar a intensidade da aleatoriedade sem extrapolar o OHLC.
- [ ] Validar o efeito da trajetória sintética sobre acionamentos de stop/alvo e relatórios.

**Limite da fonte:** OHLCV M2 não contém a sequência real de preços intrabar. O percurso segundo a segundo é uma hipótese sintética e não representa negócios históricos ou tape reading. Resultados que dependem da ordem de toque de stop e alvo dentro do mesmo candle devem ser interpretados como cenários simulados.

## Fase 3 — Fidelidade e transparência de execução

- [x] Quantidade inteira de contratos e tick por ativo.
- [x] Custos por contrato, slippage e resultado líquido.
- [x] Risco/retorno mínimo obrigatório 1:2.
- [x] Saídas por stop/alvo e stop manual.
- [x] Diferenciar replay OHLCV M2 com movimento sintético de replay legado tick a tick.
- [ ] Revisar e documentar com clareza como a trajetória sintética determina o instante de acionamento de OCO.
- [ ] Separar visualmente resultado de execução sintética de resultado baseado em negócios históricos legados.

## Fase 4 — Treinamento específico de stops

A estrutura e os critérios de avaliação serão definidos com o usuário antes da implementação.

- [ ] Definir os objetivos pedagógicos e os tipos de cenário.
- [ ] Definir o que caracteriza um stop correto, atrasado, antecipado ou movido indevidamente.
- [ ] Definir como a avaliação considera risco inicial, nível de invalidação, volatilidade e gaps.
- [ ] Criar exercícios isolados, sem misturar a nota de disciplina de stop com win rate ou resultado financeiro.
- [ ] Criar relatório específico de aderência ao stop e evolução do aluno.

## Fase 5 — Treinamento geral e prova

- [x] Sessões formais de treino e Modo Prova.
- [x] Ocultar resultados da prova atual até o encerramento.
- [x] Cronômetro opcional, eventos disciplinares e registro de sinais ignorados.
- [x] Notas pós-trade e snapshots do contexto gráfico.
- [x] Distinguir problemas técnicos de erros disciplinares.
- [ ] Integrar os exercícios específicos de stops ao histórico geral sem misturar suas métricas.

## Fase 6 — Métricas e relatórios

- [x] Win rate, payoff, expectativa em R, profit factor e drawdown.
- [x] Resultados por ativo, horário, direção e setup.
- [x] Aderência a sinais utilizados versus ignorados.
- [x] Relatórios por sessão e evolução histórica do aluno.
- [ ] Métricas detalhadas de aderência ao stop.
- [ ] Métricas detalhadas de aderência ao alvo.
- [ ] Relatório separado para o novo treinamento específico de stops.

## Fase 7 — Experiência desktop e distribuição

- [x] Gráfico com leitura OHLC/volume, crosshair e zoom.
- [x] Entrada por clique no gráfico e ajuste de stop/alvo por arraste.
- [x] Áreas Simulador, Configurações e Resultados.
- [x] Backup/restauração local.
- [x] Pipeline Windows x64 com instalador e versão portátil.
- [ ] Assinatura de releases.
- [ ] Atualizador Tauri.
- [ ] Ampliar preferências de configuração.

## Fase 8 — Qualidade e validação contínua

- [x] Testes de regras de execução, replay, calendário e indicador.
- [x] Dependências frontend e Rust travadas no repositório.
- [x] CI para testes, build frontend e verificações Rust.
- [ ] Testes automatizados de importação OHLCV M2 com fixtures WIN e WDO (há cobertura WIN; falta fixture WDO).
- [ ] Testes de replay sintético de uma sessão completa.
- [ ] Testes de repetibilidade após fechar, reiniciar e reabrir a mesma sessão.
- [ ] Validar a performance de memória e CPU com um pregão completo.
