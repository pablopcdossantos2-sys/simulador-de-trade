# Custos, slippage e resultado líquido

## Objetivo

O simulador separa três efeitos distintos:

1. movimento do mercado;
2. slippage de execução;
3. custos financeiros da operação.

Isso evita descontar o mesmo efeito duas vezes.

## Slippage

O usuário configura **slippage por lado em ticks**.

Exemplo WIN:

~~~text
Tick = 5 pontos
Slippage = 1 tick por lado
~~~

Compra solicitada em:

~~~text
130.000
~~~

Preço de entrada simulado:

~~~text
130.005
~~~

Se o alvo for acionado em:

~~~text
130.150
~~~

a venda de encerramento é simulada em:

~~~text
130.145
~~~

Assim, o resultado realizado em pontos já contém a perda provocada pelo slippage:

~~~text
130.145 - 130.005 = 140 pontos
~~~

O slippage não é descontado novamente como custo financeiro.

## Custos operacionais

A configuração é separada por ativo e representa o custo financeiro estimado da operação completa (entrada e saída) por contrato:

- **WINFUT:** R$ 0,50 por contrato, como valor inicial de referência;
- **WDOFUT:** R$ 2,12 por contrato, como valor inicial de referência.

Os valores foram baseados na tabela educacional publicada pelo portal Bora Investir, da B3, em 22/10/2025, que informa custos máximos de emolumentos e tarifas B3 para mini-índice e minidólar. São estimativas de referência, não tarifas garantidas. O custo efetivo depende da tabela vigente, do perfil/volume negociado e da corretora; corretagem e outros encargos podem não estar incluídos. Confirme sua nota de corretagem e edite os campos no aplicativo.

Fontes consultadas:

- [B3 — Conheça as características dos principais produtos de day trade](https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/day-trade/conheca-as-caracteristicas-dos-principais-produtos-de-day-trade/)
- [B3 — Tarifas de Ibovespa e Índice Brasil 50](https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/listados-a-vista-e-derivativos/renda-variavel/tarifas-de-ibovespa-e-indice-brasil-50/futuros-e-estruturadas/)
- [B3 — Tarifas de Dólar dos Estados Unidos](https://b3.com.br/main.jsp?doui_processActionId=setLocaleProcessAction&locale=pt_BR&lumA=1&lumII=8A80CB816340383D4F50DA&lumPageId=8A68812D556EB21301556F5951D27D3C)

Exemplo:

~~~text
Custo configurado: R$ 0,50 por contrato
Quantidade: 10 contratos WIN
Custos totais: R$ 5,00
~~~

## Resultado

Cada trade salva:

- preço solicitado;
- preço executado;
- contratos;
- slippage em ticks por lado;
- custo por contrato no round trip;
- resultado em pontos;
- resultado bruto em reais;
- custos operacionais;
- resultado líquido.

Fórmula:

~~~text
líquido = bruto - custos operacionais
~~~

O bruto já incorpora o efeito do slippage porque ele é calculado a partir dos preços executados.

## Snapshot

As configurações são copiadas para a operação no momento da entrada.

Isso significa que alterar os custos ou o slippage depois de abrir uma posição não modifica aquela operação nem trades históricos.

## Política intrabar para candles agregados

Quando o simulador possui dados negócio a negócio, Stop e Alvo são avaliados na sequência real dos negócios e não existe ambiguidade sobre qual nível foi atingido primeiro.

Em modos baseados apenas em OHLC, porém, um único candle pode apresentar:

~~~text
mínima <= Stop
máxima >= Alvo
~~~

sem revelar qual evento aconteceu primeiro.

A configuração **Ambiguidade intrabar (OHLC)** oferece duas políticas:

### STOP_FIRST

~~~text
Stop primeiro
~~~

É a opção padrão e conservadora, além de preservar o comportamento das versões anteriores.

### TARGET_FIRST

~~~text
Alvo primeiro
~~~

É uma hipótese otimista, útil para estudos comparativos.

A política é capturada no momento da entrada e preservada no trade. Ela não interfere no replay real negócio a negócio.

## Persistência

No aplicativo Tauri, as configurações ficam no SQLite.

No modo web de desenvolvimento, existe fallback em localStorage.

A migração do banco mantém trades antigos e assume para eles:

~~~text
slippage = 0
custo = 0
resultado líquido = resultado bruto
~~~

## Tick válido

Ao sair dos campos Stop Loss ou Alvo, a interface arredonda automaticamente o valor para o tick válido mais próximo.

O motor de domínio continua validando os preços. Portanto, a proteção não depende apenas da interface.

- WIN: múltiplos de 5 pontos;
- WDO: múltiplos de 0,5 ponto.
