# Critérios de aceite — primeira versão estável (1.0)

Este documento separa **o que impede a primeira entrega** do que poderá vir depois. Ser aprovado na CI não significa que o aplicativo Windows e o gráfico estão validados.

**Validação humana informada em 15/11/2026:** o usuário declarou ter executado os testes do [tutorial Windows e Profit Ultra](VALIDACAO-HUMANA-PASSO-A-PASSO.md) e que tudo estava funcionando bem. Trata-se de relato positivo do usuário, e não de observação remota com logs ou capturas. As correções visuais subsequentes (retirada do M15 da estratégia 01 e alinhamento do ícone de informação) precisam apenas de uma verificação visual direcionada; não é necessário repetir as auditorias dos 18 CSVs. A instalação pelo NSIS não foi confirmada separadamente.

## Funcionalidades já implementadas

- Aplicativo desktop Tauri + React; sessão educacional WINFUT/WDOFUT, sem enviar ordens reais.
- CSV Profit M1/M2, metadados, catálogo e aquecimento oculto; replay sintético determinístico, controles de reprodução e seleção do histórico.
- Indicador Multi Médias — MME 8, MMP 20, MME 52, VWAP e sinais conforme Pine de referência.
- OCO, limites de risco/retorno, custos, persistência, relatórios, exportação e backup.
- CI TypeScript/Vite e Rust, incluindo dados reais representativos de WIN/WDO. Não publicar os 18 CSVs do usuário no repositório.

## Condições obrigatórias para a entrega 1.0

- [ ] **Prova real no Windows:** abrir e encerrar o aplicativo, importar pelo menos um pregão WIN e outro WDO e iniciar replay pelo plano e catálogo, sem intervenção no terminal.
- [ ] **Sessão completa:** reproduzir, pausar, avançar 1 segundo/candle, reiniciar, finalizar; verificar gráfico, aquecimento oculto, bloqueio de operações sem sinal e ordens OCO.
- [ ] **Fidelidade do tempo:** confirmar no Profit se o timestamp do M1 indica a abertura ou o fechamento do minuto. Respeitar a janela oficial WIN 09:00–18:25 (novembro de 2026) e os limites observados; ajustar o parser **somente com evidência** e revalidar o alinhamento M2/MTF.
- [ ] **Conferência com TradingView:** mesmo pregão, timeframe, contrato/série e histórico anterior; comparar MME 8, MMP 20, MME 52, VWAP, zonas e sinais em candles fechados. Documentar diferenças justificadas (VWAP OHLCV e execução sintética).
- [ ] **Integridade funcional:** validar resultados e encerramentos OCO em cenários com stop e alvo no mesmo candle, confirmando que o relatório indica a natureza sintética e não apresenta o resultado como execução histórica real.
- [ ] **Dados e restauração:** concluir sessão com trades, conferir relatório/CSV/JSON e validar backup/restauração de histórico após reinício.
- [ ] **Distribuição candidata:** após os itens anteriores, executar o workflow Windows sob demanda; abrir instalador NSIS e executável portátil, verificar inicialização, salvamento e instruções de instalação; sem exigir assinatura digital paga.

## Cobertura automatizada já feita (não repetir sem regressão)

- 18 CSVs M1 reais WIN/WDO de novembro de 2026 foram conferidos independentemente: OHLC, volumes, ticks, sequência e agregação em M2.
- Testes Rust do parser com amostras reais e do replay M1/M2, com conservação da quantidade e determinismo.
- Testes de MMEs e MMP com 104 fechamentos reais derivados de WIN/WDO de 10/11/2026.
- Testes de janela declarada versus os horários observados: diferenças legítimas nas bordas são exibidas como aviso não bloqueante; metadados inválidos continuam bloqueados. O sistema não fabrica candles.
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

Use o [tutorial humano passo a passo](VALIDACAO-HUMANA-PASSO-A-PASSO.md) para os itens de aceitação restantes. Concluir os itens obrigatórios acima, registrar os resultados e então congelar o código para a versão candidata.


## Estratégia 02 — trilha beta separada da aceitação histórica da estratégia 01

A partir de novembro de 2026, há seleção operacional entre duas estratégias. A primeira continua com seu indicador/ordens originais. A segunda já tem MTF M15, ATR, angulação, VWAP, TPV, filtro de alinhamento, autorização direcional manual, gráficos separados, aquecimento adicional e persistência da estratégia por sessão.

- [x] Implementar as quatro MMEs M15 (200 só ilustrativa por padrão), ATR14, VWAP diária, TPV com média/desvio50 e veto por alinhamento conforme parâmetros padrão do Pine v13.
- [x] Manter o gráfico da estratégia 01 sem linhas M15 nem efeitos colaterais da estratégia 02.
- [x] Possibilitar seleção de estratégia; impedir troca durante treino/posição, recalcular plano ao alternar, usar 450 M2 para aquecimento MTF.
- [x] Gravar a estratégia em SQLite, restaurá-la no backup, mostrá-la no histórico/relatório/CSV; sessões antigas são atribuídas ao sistema 01.
- [x] Testar regras de autorização manual M15 sem reaproveitar a reentrada MME 52 como se fosse um sinal do sistema 02.
- [ ] **Aceitação humana do beta:** comparar 5 ou mais candles M15 do simulador com o Pine v13 no TradingView (mesma série, datas e histórico anterior), verificar concordâncias e documentar divergências do M2→M15.
- [ ] **Aceitação humana do beta:** no Windows, conferir alternância das estratégias, fundos verde/vermelho/cinza, operações permitidas/bloqueadas e persistência do sistema no histórico/backup.

A estratégia 02 é disponibilizada como **beta** até as verificações acima. O uso de candles M2 não permite uma reconstrução M15 rigorosamente idêntica em fronteiras temporais ímpares. Não publicar números derivados como equivalência exata com o TradingView.
