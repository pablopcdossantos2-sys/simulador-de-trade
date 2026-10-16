# Quantidade de contratos e resultado financeiro

## Quantidade

A boleta aceita uma quantidade inteira de contratos maior ou igual a 1.

A quantidade é validada pelo motor de domínio. Portanto, alterar o HTML não permite enviar uma ordem com quantidade zero, fracionária ou negativa.

## Valores monetários usados

### WINFUT

O Mini Ibovespa possui:

- tick mínimo de 5 pontos;
- valor de R$ 0,20 por ponto por contrato.

Consequentemente:

~~~text
5 pontos × R$ 0,20 = R$ 1,00 por tick por contrato
~~~

### WDOFUT

O Mini Dólar possui:

- tick mínimo de 0,5 ponto;
- contrato de USD 10.000;
- cotação em BRL por USD 1.000.

A variação de 1 ponto corresponde a R$ 10 por contrato:

~~~text
0,5 ponto × R$ 10 = R$ 5,00 por tick por contrato
~~~

## Fórmula atual

O resultado financeiro apresentado nesta fase é **bruto**:

~~~text
resultado bruto =
resultado em pontos
× valor de 1 ponto do ativo
× quantidade de contratos
~~~

Exemplo WIN:

~~~text
resultado = +150 pontos
contratos = 2

150 × R$ 0,20 × 2 = R$ 60,00 bruto
~~~

Exemplo WDO:

~~~text
resultado = +1,5 ponto
contratos = 3

1,5 × R$ 10 × 3 = R$ 45,00 bruto
~~~

## O que ainda não é descontado

Ainda não entram no resultado:

- corretagem;
- emolumentos;
- tarifas;
- custos por contrato;
- slippage;
- outras despesas configuráveis.

Por isso a interface deve usar a expressão **Bruto (R$)**.

O resultado líquido será implementado somente depois que os custos forem configuráveis.

## Persistência

Trades novos salvam:

- quantidade de contratos;
- resultado em pontos;
- resultado bruto em reais.

O banco SQLite possui uma migração retrocompatível.

Históricos antigos recebem inicialmente:

~~~text
contracts = 1
~~~

e o resultado bruto é reconstruído a partir de:

- ativo;
- resultado em pontos;
- multiplicador monetário do contrato.

Nenhum trade antigo precisa ser apagado.

O fallback localStorage também normaliza registros antigos da mesma maneira.

## Referências de contrato

As especificações monetárias foram baseadas nas informações contratuais da B3 para WIN e WDO.

- WIN: cada ponto do Mini Ibovespa corresponde a R$ 0,20.
- WDO: tamanho USD 10.000 e cotação BRL por USD 1.000, resultando em R$ 10 por ponto por contrato.
