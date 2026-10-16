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

A configuração **Custo por contrato · round trip (R$)** representa o custo financeiro total da operação completa por contrato.

Exemplo:

~~~text
Custo configurado: R$ 1,00
Quantidade: 10 contratos
Custos totais: R$ 10,00
~~~

O padrão é zero.

O projeto não pressupõe automaticamente corretagem, emolumentos ou qualquer outro valor.

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
