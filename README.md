# Simulador de Trade

Aplicativo desktop educacional para treinar execução disciplinada em WINFUT e WDOFUT, com replay histórico, **seleção de duas estratégias**, ordens OCO e análise dos resultados. A estratégia 01 está consolidada; a segunda está liberada como **beta para validação com o Pine original**.

## Testar a versão atual no Windows

**Não confunda CI aprovada com executável atualizado.** O workflow de instalação é manual; por isso, o [pacote Windows da execução 43781902065](https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions/runs/43781902065) foi compilado do commit **`7446a18`**, anterior à escolha das estratégias e às correções recentes da interface.

Para testar a versão atual, abra [Windows packaging (on demand)](https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions/workflows/windows-build.yml), selecione **Run workflow → Branch: main → Run workflow** e baixe o **artefato dessa nova execução** (não de uma execução antiga).

O pacote atualizado inclui `BUILD-INFO.txt` com o commit completo e o link da compilação. O programa também mostra **Compilação: <sete caracteres>** abaixo do título. Confira que os sete caracteres coincidem com o início do commit registrado no `BUILD-INFO.txt`. Consulte o [guia de instalação](docs/INSTALACAO-WINDOWS.md) para o procedimento ilustrado em texto.

## Como funciona

O simulador recebe **candles M1 (1 minuto, formato recomendado) ou M2 (2 minutos)** exportados do Profit, sem exigir negócios tick a tick. Ao importar M1, preserva um replay M1 e gera um segundo arquivo M2 agregado; ambos podem ser selecionados automaticamente pelo catálogo. Os candles originais contêm OHLCV: abertura, máxima, mínima, fechamento e quantidade negociada.

Durante a reprodução, um algoritmo cria uma trajetória sintética para os **60 segundos de cada M1** ou **120 segundos de cada M2**. O percurso:

- começa na abertura e termina no fechamento;
- permanece entre a mínima e a máxima do candle de origem;
- visita a máxima e a mínima em instantes variáveis;
- usa uma semente determinística por candle, portanto o mesmo arquivo gera o mesmo percurso sempre que a sessão é reiniciada;
- distribui a quantidade total de forma determinística entre os 120 segundos. Quando a quantidade de origem é inteira, cada segundo recebe uma quantidade inteira de contratos; alguns segundos podem receber zero quando o volume é baixo.

**Importante:** os preços e a distribuição de volume segundo a segundo são sintéticos. Eles não são negócios históricos, não reconstituem a ordem real dos negócios nem o perfil intrabar de volume. Por isso, a VWAP enquanto um candle está em formação também é uma aproximação de treinamento. Quando Stop e Alvo poderiam ter sido atingidos dentro do mesmo candle, o resultado depende do percurso simulado. Os relatórios representam um cenário de treinamento, não uma reprodução tick a tick do mercado.

Arquivos legados de negócios individuais continuam aceitos para compatibilidade, mas o fluxo recomendado é **CSV M1 com o timeframe declarado corretamente**.

## Exportar os dados do Profit

Exporte um CSV de candles M1 (preferencial) ou M2 do Profit, informando o timeframe correspondente ao importar. O arquivo deve conter:

- Ativo ou contrato;
- Data/Hora do candle (ou Data com data e hora juntas, ou Data e Hora separadas);
- Abertura;
- Máxima;
- Mínima;
- Fechamento;
- Volume Quantidade/Quantidade (contratos). Quando o Profit exportar Volume Financeiro e Volume Quantidade, o simulador utiliza Volume Quantidade.

O simulador interpreta o timestamp como **abertura do candle**. Essa convenção ainda precisa de confirmação operacional no Profit; não desloque os horários sem evidência. Use o mesmo contrato/série contínua no aquecimento e no pregão-alvo, observando que a identificação genérica WINFUT/WDOFUT não comprova o vencimento.

No simulador, defina ativo, data e janela horária. Importe os CSVs M1/M2 solicitados para o aquecimento oculto e para o pregão-alvo. O programa valida o conteúdo, seleciona a janela, ordena os candles e cria um arquivo compacto de replay. O CSV bruto do Profit não é alterado.

## Funcionalidades

- Replay M1 ou M2 com movimento sintético segundo a segundo, controles de velocidade, pausa, avanço de segundo e avanço de candle;
- aquecimento histórico oculto do indicador antes do início do período visível;
- **sistema 01 — Multi Médias · Nuvem e Sinais:** MME 8, MMP 20, MME 52, VWAP e sinais de entrada;
- **sistema 02 — MMs MTF + Angulação (beta):** quatro MMEs M15 (8, 20, 50, 200), ATR 14, VWAP M15 e TPV 50 com autorização direcional verde/vermelha/cinza, sem disparar entradas automáticas;
- seleção da estratégia antes do plano; o sistema 02 requer 450 candles M2 anteriores (normalmente dois pregões), e o sistema 01 mantém 260;
- entradas direcionais condicionadas por sinal e reentrada autorizada pela MME 52;
- ordem OCO obrigatória, risco/retorno mínimo de 1:2, custos e slippage configuráveis;
- stop manual, histórico persistente, notas pós-trade, relatórios e evolução dos resultados; a estratégia selecionada acompanha a sessão e aparece nos relatórios e backups;
- modo claro/escuro, configurações locais e backup/restauração.

## Escolher com qual estratégia treinar

1. No **Simulador**, escolha o sistema 01 ou 02 em **Estratégia de treinamento**, ou escolha diretamente na página **Sistemas de trading**.
2. Selecione o ativo e a data e aplique o plano. **O sistema 02 pede mais histórico** para aquecer TPV e médias M15.
3. Prepare os CSVs indicados e inicie o replay. **Verde** autoriza apenas compra manual, **vermelho** apenas venda manual e **cinza** bloqueia novas entradas no sistema 02. O OCO e a razão mínima 1:2 continuam obrigatórios.
4. Não é possível trocar de sistema com treino ou posição aberta. Ao alternar, o replay carregado é descarregado e o plano precisa ser reaplicado; os CSVs catalogados são preservados.

A segunda estratégia não reproduz M15 exato a partir de M2, nem reconstitui negócios intrabar; veja [especificação e limitações](docs/ESTRATEGIA-02-MTF.md). A comparação TradingView/Profit precisa de [validação humana](docs/VALIDACAO-HUMANA-PASSO-A-PASSO.md) antes de declarar sua fidelidade numérica concluída.

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

No Windows, o instalador e a versão portátil são produzidos pelo GitHub Actions. Consulte o [guia de instalação](docs/INSTALACAO-WINDOWS.md) e o [guia de validação prática](docs/GUIA-VALIDACAO-WINDOWS.md), que orienta a primeira importação dos CSVs M1/M2 do Profit e a conferência do replay. Consulte também o [tutorial humano passo a passo](docs/VALIDACAO-HUMANA-PASSO-A-PASSO.md) e os [critérios objetivos de aceite](docs/CRITERIOS-DE-ACEITE-V1.md).

## Dados e privacidade

Os arquivos de mercado, o catálogo e o banco de operações são processados localmente no aplicativo. O arquivo bruto do Profit permanece intacto; os replays compactos são gravados como arquivos derivados na pasta de origem. Faça backups regulares antes de reinstalar ou trocar de computador.

## Aviso

Este software tem finalidade educacional e de treinamento. Não envia ordens reais para corretoras e não constitui recomendação de investimento.
