# Estratégia 02 — MMs MTF + Angulação (beta)

## Finalidade

Estratégia de **autorização direcional**, não de execução automatizada. O usuário decide manualmente o instante e o preço da entrada; o aplicativo bloqueia operações contrárias à confluência e continua exigindo OCO e relação de risco/retorno mínima 1:2. Coexiste com o Sistema 01 sem sobrepor suas linhas, seus sinais ou sua regra de reentrada pela MME 52.

**Referência de fórmula e configuração:** arquivo Pine Script do usuário **`Indicador_v13_alinhamento_total.txt`**, mantido fora do repositório público por conter código fornecido pelo usuário. A implementação reproduz os **parâmetros padrão** e os critérios básicos de votação, não todas as opções de configuração/estilo oferecidas pelo indicador original.

## Configuração padrão implementada

| Componente | Configuração | Participa do fundo |
|---|---|---|
| MME 8 em M15 | EMA de fechamento, limiar de inclinação 2 graus | Sim |
| MME 20 em M15 | EMA de fechamento, limiar de inclinação 1 grau | Sim |
| MME 50 em M15 | EMA de fechamento, limiar de inclinação 1,5 grau | Sim |
| MME 200 em M15 | EMA de fechamento, limiar de inclinação 1 grau | **Não** (apenas linha) |
| ATR M15 | 14 períodos; normaliza variação por candle | Auxiliar |
| VWAP M15 | HLC3 × quantidade, âncora diária, inclinação 3 barras, mínimo 1 grau, ignorar três primeiras barras após reinício | Sim |
| TPV M15 | Financeiro: quantidade × fechamento × variação porcentual de fechamento; acumulação ao longo das barras, média e desvio padrão 50, zona neutra em até 0,45 desvio | Sim |

Angulação em graus: `atan(((valor atual − valor N candles atrás) / N) / ATR) × 180/π`, com ATR de Wilder. Todos os critérios participantes precisam indicar o mesmo sentido. A ordem estrita entre as médias usadas no fundo deve ser MME8 > MME20 > MME50 para compras e a ordem inversa para vendas. Quando essa trava de alinhamento não está satisfeita, não há fundo, nem cinza. Alinhamento satisfeito sem concordância total resulta em fundo cinza e **bloqueio de novas entradas**.

O TPV só participa quando existe sua janela de 50 períodos M15. O plano de simulação para a estratégia 02 exige **450 M2 prévios**, equivalentes aproximadamente a 60 M15, normalmente dois pregões; o Sistema 01 mantém os 260 M2 anteriores.

## Fluxo de execução

- Selecione o Sistema 02 na página **Sistemas de trading** ou na caixa **Estratégia de treinamento** no Simulador; aplique um novo plano e carregue os dados requeridos.
- O gráfico desenha apenas as médias M15 e VWAP dessa estratégia, além do preço e volume. A coloração usa informações dos candles M2 **já fechados**.
- Verde autoriza compra manual; vermelho autoriza venda manual; cinza ou ausência de fundo bloqueia novas ordens.
- A direção autorizada é validada de forma independente da reentrada MME52 do Sistema 01. Nenhuma posição é aberta automaticamente.
- A estratégia fica registrada na sessão, no banco SQLite, nos backups, nas listagens e no CSV de operações. Histórico anterior sem identificador é interpretado como Sistema 01.
- Trocar a estratégia exige não haver sessão nem posição aberta. A troca descarta o plano e descarrega o replay antigo **sem apagar os arquivos preparados**, porque as exigências de aquecimento diferem.

## Limitações científicas relevantes

1. **M2 não divide M15:** não é possível repartir um candle M2 entre dois candles M15 em fronteiras ímpares sem M1 ou ticks. O M2 é atribuído integralmente ao intervalo de início. Assim, valores de M15, TPV e VWAP podem diferir daqueles do TradingView com dados originais em M15. A simulação permanece causal: os candles futuros não entram no cálculo.
2. **Fidelidade numérica pendente:** a CI verifica consistência, tendência, bloqueio sem dados, ausência de lookahead, persistência e integração, mas ainda falta comparação manual valor a valor com o Pine v13 na mesma série/contrato.
3. **Parâmetros do original:** nesta versão beta, os parâmetros acima estão fixados nos defaults do Pine. O Pine possui ainda vários outros tipos de médias, escolhas de timeframe e toggles; essas preferências ainda não são expostas na interface. Não declarar que essas funcionalidades estão implementadas.
4. **Intrabar sintético:** os eventos por segundo são produzidos a partir de OHLCV. Stop/alvo e posição intrabar representam cenário educacional, não execução histórica real.

## Aceitação humana da beta

Siga a seção **Novo teste dirigido — escolha de estratégias e confluência M15 (beta)** do [tutorial passo a passo](VALIDACAO-HUMANA-PASSO-A-PASSO.md), comparando fundo e valores M15 com o Pine original. Em caso de divergência, informe horário, ativo, série, valores, capturas e candles utilizados para aquecimento.


## Períodos personalizáveis — novembro de 2026

A tela **Simulador → Configurar médias da estratégia** agora permite modificar os **quatro períodos M15**. Os padrões são 8/20/50/200. São permitidos inteiros de 2 a 300 em ordem crescente. Os três primeiros participam da autorização; o quarto é uma referência visual, não um voto.

A mudança modifica as MMEs M15 e suas angulações calculadas, e o planejador pede histórico anterior proporcional à maior média **participante**, mantendo um mínimo de 60 barras M15. Salvar requer encerrar a sessão e descarregar o replay/planejamento anterior. ATR, VWAP, TPV, limiares de ângulo e métodos das médias ainda seguem os padrões fixos definidos nesta versão; a fidelidade ao Pine personalizado requer validação separada.

Os períodos usados em cada sessão nova ficam preservados no registro `strategyAverages` e nos backups. O gráfico exibe os valores personalizados na legenda e no painel M15.
