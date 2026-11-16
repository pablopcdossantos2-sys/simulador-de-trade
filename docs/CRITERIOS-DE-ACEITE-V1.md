# Critérios de aceite — primeira versão estável (1.0)

Este documento separa **o que impede a primeira entrega** do que poderá vir depois. Ser aprovado na CI não significa que o aplicativo Windows e o gráfico estão validados.

## Funcionalidades já implementadas

- Aplicativo desktop Tauri + React; sessão educacional WINFUT/WDOFUT, sem enviar ordens reais.
- CSV Profit M1/M2, metadados, catálogo e aquecimento oculto; replay sintético determinístico, controles de reprodução e seleção do histórico.
- Indicador Multi Médias — MME 8, MMP 20, MME 52, VWAP e sinais conforme Pine de referência.
- OCO, limites de risco/retorno, custos, persistência, relatórios, exportação e backup.
- CI TypeScript/Vite e Rust, incluindo dados reais representativos de WIN/WDO. Não publicar os 18 CSVs do usuário no repositório.

## Condições obrigatórias para a entrega 1.0

- [ ] **Prova real no Windows:** abrir e encerrar o aplicativo, importar pelo menos um pregão WIN e outro WDO e iniciar replay pelo plano e catálogo, sem intervenção no terminal.
- [ ] **Sessão completa:** reproduzir, pausar, avançar 1 segundo/candle, reiniciar, finalizar; verificar gráfico, aquecimento oculto, bloqueio de operações sem sinal e ordens OCO.
- [ ] **Fidelidade do tempo:** confirmar no Profit se o timestamp do M1 indica a abertura ou o fechamento do minuto. Ajustar o parser **somente com evidência** e revalidar o alinhamento M2/MTF.
- [ ] **Conferência com TradingView:** mesmo pregão, timeframe, contrato/série e histórico anterior; comparar MME 8, MMP 20, MME 52, VWAP, zonas e sinais em candles fechados. Documentar diferenças justificadas (VWAP OHLCV e execução sintética).
- [ ] **Integridade funcional:** validar resultados e encerramentos OCO em cenários com stop e alvo no mesmo candle, confirmando que o relatório indica a natureza sintética e não apresenta o resultado como execução histórica real.
- [ ] **Dados e restauração:** concluir sessão com trades, conferir relatório/CSV/JSON e validar backup/restauração de histórico após reinício.
- [ ] **Distribuição candidata:** após os itens anteriores, executar o workflow Windows sob demanda; abrir instalador NSIS e executável portátil, verificar inicialização, salvamento e instruções de instalação; sem exigir assinatura digital paga.

## Cobertura automatizada já feita (não repetir sem regressão)

- 18 CSVs M1 reais WIN/WDO de novembro de 2026 foram conferidos independentemente: OHLC, volumes, ticks, sequência e agregação em M2.
- Testes Rust do parser com amostras reais e do replay M1/M2, com conservação da quantidade e determinismo.
- Testes de MMEs e MMP com 104 fechamentos reais derivados de WIN/WDO de 10/11/2026.
- Testes de janela declarada versus os horários reais: arquivos M1/M2 com bordas ausentes não podem completar artificialmente o plano.
- Teste Rust de pregão inteiro gerado (570 M1 WDO, 34.200 observações), **não confundir com teste do executável Windows**.

## Conhecimentos/limitações que devem aparecer na entrega

- O OHLCV não revela o caminho verdadeiro intrabar nem o momento real de toque em stop/alvo. O replay simula um cenário educacional.
- Dados com rótulo WINFUT/WDOFUT de série contínua não provam a identidade do contrato de vencimento.
- A VWAP de candles usa HLC3 × quantidade; não é equivalente à VWAP tick a tick.
- A verificação das extremidades do período no catálogo não comprova, isoladamente, a ausência de lacunas internas; o tratamento também precisa ser validado.
- A assinatura digital não está incluída na versão gratuita inicial. O Windows pode emitir aviso do SmartScreen.

## Fora do escopo obrigatório da 1.0

- Plataforma completa e separada de treinamento psicológico de stops e suas métricas (Fase 4): definir como trabalho futuro com critérios pedagógicos próprios.
- Atualizador automático Tauri, assinatura digital paga, novas preferências e publicação em lojas.
- Reconstrução de negócios tick a tick a partir de OHLCV (tecnicamente impossível sem dados adicionais).

Concluir os itens obrigatórios acima, registrar os resultados e então congelar o código para a versão candidata.
