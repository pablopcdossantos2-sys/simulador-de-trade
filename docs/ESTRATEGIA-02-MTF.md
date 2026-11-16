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
| TPV M15 | Financeiro: quantidade × fechamento × variação porcentual de fechamento; acumulação ao longo das barras, média simples de 50; acima = compra, abaixo = venda, igual = neutro (sem desvio) | Sim |

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
3. **Parâmetros do original:** os períodos das quatro MMEs, a exibição das linhas, seus limiares de angulação e os interruptores de confluência são configuráveis. ATR, limite angular da VWAP, períodos do TPV, tipos de média e timeframes ainda usam os valores padrão. A remoção do desvio-padrão do TPV modifica deliberadamente o comportamento da referência Pine v13.
4. **Intrabar sintético:** os eventos por segundo são produzidos a partir de OHLCV. Stop/alvo e posição intrabar representam cenário educacional, não execução histórica real.

## Aceitação humana da beta

Siga a seção **Novo teste dirigido — escolha de estratégias e confluência M15 (beta)** do [tutorial passo a passo](VALIDACAO-HUMANA-PASSO-A-PASSO.md), comparando fundo e valores M15 com o Pine original. Em caso de divergência, informe horário, ativo, série, valores, capturas e candles utilizados para aquecimento.


## Períodos personalizáveis — novembro de 2026

A tela **Simulador → Configurar médias da estratégia** agora permite modificar os **quatro períodos M15**. Os padrões são 8/20/50/200. São permitidos inteiros de 2 a 300 em ordem crescente. Os três primeiros participam da autorização por padrão; o quarto é uma referência visual até que seja habilitado em **Usar no fundo**.

A mudança modifica as MMEs M15 e suas angulações calculadas, e o planejador pede histórico anterior proporcional à maior média **participante**, mantendo um mínimo de 60 barras M15. Se o usuário habilitar a quarta MME, seu período também passa a compor o cálculo do aquecimento. Salvar requer encerrar a sessão e descarregar o replay/planejamento anterior. ATR, VWAP, TPV e métodos das médias ainda seguem parâmetros fixos; os limiares angulares das MMEs podem ser editados individualmente; a fidelidade ao Pine personalizado requer validação separada.

Os períodos usados em cada sessão nova ficam preservados no registro `strategyAverages` e nos backups. O gráfico exibe os valores personalizados na legenda e no painel M15.


## Interruptores de confluência — novembro de 2026

Foi implementada a seleção de critérios conforme o Pine v13:

- **Usar angulação no fundo** (ligado por padrão): as médias escolhidas votam individualmente por suas inclinações normalizadas pelo ATR 14; a VWAP diária vota se estiver habilitada.
- **Usar alinhamento das médias** (ligado por padrão): a ordem das médias selecionadas é uma trava direcional (com pelo menos duas médias). Se a angulação global estiver desligada, o alinhamento vira **um único voto** das médias participantes.
- **Usar MME N no fundo**, individualmente para as quatro médias. Padrão: 1, 2 e 3 ligadas; 4 desligada. Desligar o voto não remove a linha do gráfico.
- **Usar VWAP diária no fundo** (ligado por padrão): vota pela inclinação de 1° somente quando a angulação global estiver ligada.
- **Usar TPV no fundo** (ligado por padrão): compara o TPV com sua média simples de 50 M15; acima indica alta, abaixo indica baixa, igualdade indica neutralidade. Não calcula desvio-padrão nem zona de proximidade. Ao desligar, o TPV deixa de exigir aquecimento para votar; sua leitura continua disponível.
- Todos os votos participantes devem concordar para autorizar verde/vermelho. **Nenhum voto ativo = nenhuma autorização.** A ausência de dado num critério participante também bloqueia a cor direcional.

O **ATR 14 não é um voto separado**, mas normaliza a angulação de médias e VWAP. Os limiares padrão são 2°/1°/1,5°/1° para as quatro médias e 1° na VWAP. Os quatro limiares das médias são editáveis de 0,1° a 89°; o da VWAP permanece fixo.

As opções ficam na mesma seção da personalização das MMEs e são persistidas no perfil local e no snapshot das sessões. O replay/planejamento é descarregado quando elas mudam; os CSVs preparados são preservados.

## Cronômetro do gráfico e ausência de deslocamento ao passar o mouse

O gráfico do replay mostra **Fechamento M2**, contado pelo último horário de negócio revelado. Quando pausado, o valor não continua a correr com o relógio do Windows. O cronômetro e a leitura de preço/horário do cursor ficam em dois painéis **abaixo do gráfico**, sem cobrir os candles ou indicadores.

A leitura do M15 passou a usar um bloco de grade fixa logo abaixo do OHLCV: valores variáveis no hover não podem quebrar linhas e alterar a altura do gráfico.

## Angulações editáveis, exibição independente e TPV sem desvio — novembro de 2026

- Em **Configurar médias da estratégia**, cada MME M15 possui três ajustes independentes: **Exibir no gráfico**, **Angulação mínima (°)** e **Usar no fundo**. Uma média pode continuar desenhada sem votar, ou participar da confluência mesmo sem a sua linha visível.
- Os limiares personalizados são persistidos e entram no cálculo de voto de sua respectiva MME quando a opção global **Usar angulação no fundo** está ativa. O período, as médias calculadas e os demais filtros permanecem independentes desse limite. Faixa válida: 0,1° a 89°.
- O TPV continua acumulado, usando a média aritmética das últimas 50 barras M15 para determinar o sentido: acima (1), abaixo (-1) ou igual (0). Desvio-padrão, fator de proximidade e banda de tolerância foram removidos, alterando os sinais históricos da beta em relação à implementação anterior. A exigência de aquecimento de 50 barras, quando TPV participa, permanece.
- Perfis antigos e snapshots sem os novos campos recebem limiares 2°/1°/1,5°/1° e todas as quatro MMEs visíveis, sem perder os votos salvos. A configuração permanece congelada durante a sessão ativa.

## Localização dos editores e backup — novembro de 2026

Os editores das estratégias foram reunidos em **Sistemas de trading**. Escolha e configure os indicadores e filtros nesse local, salve, então selecione o sistema para acessar o **Simulador**, que apenas consome os parâmetros salvos. O backup JSON desktop inclui as preferências de ambas as estratégias como `strategySettings`; a importação no modo `Mesclar` mantém as preferências locais, enquanto `Substituir tudo` as restaura quando presentes. Backups sem essa chave continuam compatíveis.

## Preparação de pregões fora do Simulador — novembro de 2026

A seção **Pregões e replays** reúne a importação direta de CSVs M1/M2 do Profit, a criação dos arquivos de replay, a verificação dos pregões necessários ao aquecimento de uma estratégia e a lista de arquivos catalogados. A preparação guiada usa a estratégia atualmente selecionada para estimar os dias anteriores necessários.

O **Simulador** apresenta somente replays catalogados. O usuário pode escolher um ativo/dia da lista ou consultar uma data. Se não houver replay válido para o alvo ou se faltarem pregões de aquecimento (incluindo incompatibilidade de contrato), o início do treino fica bloqueado e a interface oferece acesso a **Pregões e replays** para completar os arquivos necessários. Nenhum candle é inventado para preencher lacunas dos arquivos.
