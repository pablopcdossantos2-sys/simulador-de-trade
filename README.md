# Simulador de Trade

Aplicativo desktop educacional para treinar execução disciplinada em WINFUT e WDOFUT, com replay histórico, indicador Multi Médias - Nuvem e Sinais, ordens OCO e análise dos resultados.

## Como funciona

O simulador usa candles históricos de **2 minutos (M2)** exportados do Profit. Em vez de exigir um CSV gigantesco de negócios tick a tick, o aplicativo armazena somente OHLCV: abertura, máxima, mínima, fechamento e volume.

Durante a reprodução, um algoritmo cria uma trajetória de preço para os 120 segundos de cada candle. O percurso:

- começa na abertura e termina no fechamento;
- permanece entre a mínima e a máxima do candle de origem;
- visita a máxima e a mínima em instantes variáveis;
- usa uma semente determinística por candle, portanto o mesmo arquivo gera o mesmo percurso sempre que a sessão é reiniciada;
- distribui uniformemente o volume do candle ao longo dos segundos para animar a visualização.

**Importante:** os preços e a distribuição de volume segundo a segundo são sintéticos. Eles não são negócios históricos, não reconstituem a ordem real dos negócios nem o perfil intrabar de volume. Por isso, a VWAP enquanto o candle M2 está em formação também é uma aproximação de treinamento. Quando Stop e Alvo poderiam ter sido atingidos dentro do mesmo candle M2, o resultado depende do percurso simulado. Os relatórios representam um cenário de treinamento, não uma reprodução tick a tick do mercado.

Arquivos legados de negócios individuais continuam aceitos para compatibilidade, mas o fluxo recomendado é o CSV M2.

## Exportar os dados do Profit

Exporte um arquivo CSV do ativo e do pregão desejados, usando o gráfico de 2 minutos. O arquivo deve conter:

- Ativo ou contrato;
- Data/Hora do candle (ou Data com data e hora juntas, ou Data e Hora separadas);
- Abertura;
- Máxima;
- Mínima;
- Fechamento;
- Volume Quantidade/Quantidade (contratos). Quando o Profit exportar Volume Financeiro e Volume Quantidade, o simulador utiliza Volume Quantidade.

O timestamp deve identificar a abertura do candle M2. Use um arquivo por pregão e mantenha o contrato do aquecimento compatível com o contrato do pregão-alvo.

No simulador, defina ativo, data e janela horária. Importe os CSVs M2 solicitados para o aquecimento oculto e para o pregão-alvo. O programa valida o conteúdo, seleciona a janela, ordena os candles e cria um arquivo compacto de replay. O CSV bruto do Profit não é alterado.

## Funcionalidades

- Replay M2 com movimento sintético segundo a segundo, controles de velocidade, pausa, avanço de segundo e avanço de candle;
- aquecimento histórico oculto do indicador antes do início do período visível;
- indicador Multi Médias - Nuvem e Sinais com MME 8, MMP 20, MME 52 e VWAP;
- entradas direcionais condicionadas por sinal e reentrada autorizada pela MME 52;
- ordem OCO obrigatória, risco/retorno mínimo de 1:2, custos e slippage configuráveis;
- stop manual, histórico persistente, notas pós-trade, relatórios e evolução dos resultados;
- modo claro/escuro, configurações locais e backup/restauração.

## Executar em desenvolvimento

Pré-requisitos: Node.js 20.19+ ou 22.12+ e npm.

```bash
npm ci
npm run dev
```

Para executar o desktop durante o desenvolvimento, instale também Rust, WebView2 e os pré-requisitos do Tauri 2:

```bash
npm run tauri dev
```

No Windows, o instalador e a versão portátil são produzidos pelo GitHub Actions. Consulte o [guia de instalação](docs/INSTALACAO-WINDOWS.md).

## Dados e privacidade

Os arquivos de mercado, o catálogo e o banco de operações são processados localmente no aplicativo. O arquivo bruto do Profit permanece intacto; os replays compactos são gravados como arquivos derivados na pasta de origem. Faça backups regulares antes de reinstalar ou trocar de computador.

## Aviso

Este software tem finalidade educacional e de treinamento. Não envia ordens reais para corretoras e não constitui recomendação de investimento.
