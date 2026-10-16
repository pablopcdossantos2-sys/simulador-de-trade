# Catálogo local de dados preparados

## Objetivo

O catálogo elimina a necessidade de o usuário lembrar manualmente quais arquivos já foram tratados.

Sempre que um arquivo `.replay.csv` é gerado pela ferramenta de tratamento, ele pode ser registrado na biblioteca local com:

- caminho do replay;
- caminho do `.meta.json`;
- contrato;
- família WINFUT/WDOFUT;
- data do pregão;
- horário inicial;
- horário final;
- primeiro/último timestamp;
- tamanho do arquivo.

O catálogo é persistido no diretório local do aplicativo.

## Comparação com o plano

Depois que o usuário aplica um plano, cada requisito recebe um estado:

- **Disponível** — existe arquivo compatível;
- **Faltando** — nenhuma fonte preparada cobre a data/janela;
- **Contrato incompatível** — existe dado da mesma família, mas de outro contrato.

Exemplo:

~~~text
Aquecimento 13/10/2026 09:00–18:00  ✓ Disponível
Alvo        14/10/2026 09:00–12:00  ✓ Disponível
~~~

ou:

~~~text
Aquecimento 13/10/2026 09:00–18:00  ⚠ WINQ26
Alvo        14/10/2026 09:00–12:00  ✓ WINV26
~~~

No segundo caso, a simulação não é considerada pronta.

## Cobertura de horário

Um arquivo pode atender a uma janela menor quando cobre todo o requisito.

Exemplo:

~~~text
Requisito: 09:00–12:00
Arquivo:   09:00–18:00
Resultado: compatível
~~~

Mas:

~~~text
Requisito: 09:00–18:00
Arquivo:   09:00–12:00
Resultado: insuficiente
~~~

## Tratamento orientado pelo plano

A seção **Tratar dados necessários** mostra apenas o que o plano exige.

Para cada requisito ainda não atendido, o usuário informa o CSV bruto do Profit. O sistema aplica automaticamente o horário correto daquela linha.

Exemplo:

~~~text
13/10/2026 · Aquecimento · 09:00–18:00
14/10/2026 · Pregão-alvo · 09:00–12:00
~~~

É possível processar individualmente ou usar **Tratar todos os caminhos informados**.

Após o tratamento, o arquivo é registrado no catálogo automaticamente.

## Verificação da data

O sistema não confia apenas no nome do arquivo bruto.

Depois de tratar o CSV, a data é extraída do conteúdo. Se o usuário associar por engano o CSV de 13/10 à linha de 14/10, o sistema informa a divergência.

## Aquecimento invisível

Quando todos os requisitos estão disponíveis:

1. os arquivos de aquecimento são ordenados cronologicamente;
2. o backend Rust lê seus negócios;
3. esses negócios são agregados diretamente em candles M2;
4. somente os últimos candles definidos pela política de aquecimento são mantidos;
5. esses candles alimentam o indicador;
6. eles **não são desenhados no gráfico**;
7. o replay visual começa apenas no pregão-alvo.

Assim o gráfico do usuário continua começando no horário definido no plano, enquanto as médias já possuem histórico anterior.

## Contrato

O catálogo usa o contrato do pregão-alvo como referência.

Se o alvo for `WINV26`, o aquecimento precisa usar `WINV26` também na política atual.

Uma futura política de série contínua/rolagem poderá permitir combinações diferentes, mas isso será explicitamente configurável em vez de ocorrer silenciosamente.

## Arquivos ausentes

O catálogo verifica se o replay e o metadado continuam existindo.

Se o usuário mover ou apagar arquivos, eles deixam de atender ao plano. A opção **Atualizar catálogo** remove as referências que não existem mais.
