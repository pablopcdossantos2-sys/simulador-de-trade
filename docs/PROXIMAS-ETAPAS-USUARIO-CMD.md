# Próximas etapas do usuário — Windows usando CMD

Este tutorial separa as etapas que dependem do usuário das etapas que podem continuar sendo desenvolvidas diretamente no repositório.

## Regra para este tutorial

Os comandos abaixo foram escritos para o **Prompt de Comando do Windows (CMD)**.

Não é necessário alterar a política de execução do PowerShell.

Se o PowerShell do computador bloquear scripts, simplesmente feche-o e use:

~~~text
Prompt de Comando
cmd.exe
~~~

Sempre que houver um caminho com espaços, coloque o caminho entre aspas.

Exemplo:

~~~bat
cd /d "C:\Users\SEU_USUARIO\Documents\simulador-de-trade"
~~~

---

# O que depende do usuário agora

As duas validações mais importantes que dependem do usuário são:

1. testar o executável no próprio Windows;
2. fornecer dados reais do Profit Ultra para validar o replay de WINFUT e WDOFUT.

Uma terceira validação, muito importante para a qualidade, é comparar o indicador do simulador com o TradingView usando o mesmo pregão.

Assinatura digital, atualizador Tauri e publicação automática de releases podem ser deixados para uma etapa posterior.

---

# ETAPA 1 — Testar o aplicativo no Windows

## Opção A — Instalador

Use:

~~~text
Simulador-de-Trade-setup.exe
~~~

Passos:

1. baixe/extrate o pacote Windows gerado pelo projeto;
2. dê dois cliques em `Simulador-de-Trade-setup.exe`;
3. conclua a instalação;
4. abra o aplicativo pelo Windows;
5. confirme se a janela principal abre normalmente.

Nenhum terminal é necessário.

## Opção B — Portátil

Use:

~~~text
Simulador-de-Trade-portable.exe
~~~

Passos:

1. crie uma pasta, por exemplo:

~~~text
C:\Programas Portateis\Simulador de Trade
~~~

2. copie o executável portátil para essa pasta;
3. dê dois cliques no arquivo;
4. confirme se o programa abre normalmente.

Se o portátil reclamar de WebView2, use o instalador.

---

# ETAPA 2 — Fazer um teste funcional simples

Antes de importar dados reais, confirme a interface.

1. abra o aplicativo;
2. verifique se a tela de planejamento aparece;
3. teste alternar entre WINFUT e WDOFUT;
4. altere entre M2 e M5;
5. confira o horário inicial e final;
6. abra a tela de configurações;
7. confirme se custos, slippage e política intrabar podem ser alterados;
8. abra Backup e restauração;
9. teste Exportar backup;
10. escolha uma pasta temporária;
11. confirme se um arquivo JSON foi criado.

Se alguma tela não aparecer, anote:

- o que você clicou;
- o que esperava que acontecesse;
- o que aconteceu;
- mensagem de erro, se houver.

Uma captura de tela ajuda muito.

---

# ETAPA 3 — Planejar a primeira simulação real

Não comece exportando arquivos aleatoriamente do Profit.

Primeiro configure a simulação dentro do aplicativo.

Exemplo:

~~~text
Ativo: WINFUT
Pregão: 14/10/2026
Timeframe: M2
Início visível: 09:00
Final visível: 12:00
Aquecimento: Padrão
~~~

O sistema deve informar os pregões anteriores necessários para aquecer o indicador.

## Exemplo M2

Para 14/10/2026, M2, 09:00–12:00, aquecimento padrão:

Se você possuir o pregão anterior completo 09:00–18:00:

~~~text
13/10/2026 — aquecimento
14/10/2026 — simulação visível
~~~

Se você possuir apenas 09:00–12:00 dos pregões anteriores:

~~~text
08/10/2026
09/10/2026
13/10/2026
14/10/2026 — simulação visível
~~~

O sistema pula automaticamente 12/10/2026 por não ter sido pregão normal.

## Exemplo M5

Em M5, a mesma janela 09:00–12:00 possui somente 36 candles.

Por isso o aquecimento padrão pode exigir mais dias.

Com pregões completos de WIN 09:00–18:00, o exemplo utiliza:

~~~text
08/10/2026
09/10/2026
13/10/2026
14/10/2026 — simulação visível
~~~

Use sempre a lista mostrada pelo próprio planejador como referência principal.

---

# ETAPA 4 — Atenção especial ao contrato em 14/10/2026

O planejamento já avisa que 14/10/2026 está próximo/na regra de vencimento do WIN utilizada pelo projeto.

Para o primeiro teste real, existem duas opções.

## Opção mais simples

Escolher inicialmente um pregão que não esteja em região de vencimento/rolagem.

Isso reduz a chance de misturar contratos diferentes durante a validação inicial.

## Se quiser usar 14/10/2026

Confirme exatamente qual contrato aparece no arquivo exportado do Profit.

Exemplo:

~~~text
WINV26
~~~

Os dados usados para o aquecimento e para o pregão-alvo não devem ser misturados entre contratos diferentes sem uma regra explícita de rolagem.

---

# ETAPA 5 — Exportar os dados do Profit Ultra

O Simulador de Trade precisa do arquivo histórico de negócios/tick a tick.

A ferramenta de tratamento reconhece inicialmente arquivos do Profit contendo, entre outros layouts compatíveis:

~~~text
Ativo
Data
Hora
Agente Comprador
Preço
Quantidade
Agente Vendedor
Agressor
~~~

ou variantes compatíveis já documentadas no projeto.

Não é necessário editar o CSV manualmente.

## Procedimento recomendado

Para cada pregão solicitado pelo planejador:

1. abra o Profit Ultra;
2. exporte o histórico de Trades/Tick-by-Tick do contrato correto;
3. salve o CSV bruto em uma pasta organizada;
4. não altere o arquivo original;
5. repita para cada dia necessário.

Sugestão de organização:

~~~text
C:\Dados Profit\WIN\2026\
~~~

Exemplo:

~~~text
C:\Dados Profit\WIN\2026\WINV26_2026-10-13.csv
C:\Dados Profit\WIN\2026\WINV26_2026-10-14.csv
~~~

Os nomes podem ser diferentes. O importante é conseguir identificar o dia e o contrato.

---

# ETAPA 6 — Tratar os arquivos dentro do Simulador

Não é necessário usar CMD para isso.

1. abra o Simulador de Trade;
2. configure primeiro o plano;
3. vá à ferramenta de preparação dos dados do Profit;
4. selecione o CSV bruto;
5. confirme o intervalo horário sugerido pelo plano;
6. inicie o tratamento;
7. acompanhe o percentual de progresso;
8. aguarde a confirmação de conclusão.

O arquivo bruto original não é sobrescrito.

O sistema cria arquivos derivados semelhantes a:

~~~text
WINV26_20261014_0900-1200.replay.csv
WINV26_20261014_0900-1200.replay.meta.json
~~~

Para aquecimento, uma janela maior pode ser utilizada, por exemplo:

~~~text
09:00–18:00
~~~

---

# ETAPA 7 — Conferir o catálogo

Depois de tratar os arquivos:

1. abra/atualize o catálogo de dados preparados;
2. confira as datas disponíveis;
3. confira se o contrato é compatível;
4. confira se ainda existe alguma data marcada como ausente;
5. só prossiga quando o plano informar que os dados necessários estão disponíveis.

---

# ETAPA 8 — Executar a simulação real

1. carregue o plano desejado;
2. deixe o sistema selecionar o replay compatível no catálogo;
3. confirme ativo, data, timeframe e horário;
4. inicie a sessão;
5. use Reprodução, Pausa, +1 negócio ou +1 candle;
6. confira se o gráfico começa somente na janela visível;
7. confirme que os candles de aquecimento não aparecem;
8. observe os sinais COMPRA/VENDA;
9. tente propositalmente uma operação sem sinal;
10. confirme que o sistema bloqueia a tentativa;
11. execute pelo menos uma operação válida com OCO;
12. confirme o fechamento automático por Stop ou Alvo;
13. finalize a sessão;
14. abra o relatório;
15. teste as notas pós-trade;
16. teste Exportar relatório JSON;
17. teste Exportar trades CSV.

---

# ETAPA 9 — Validar o indicador contra o TradingView

Esta etapa depende do usuário porque o objetivo é comparar o simulador com uma referência externa conhecida.

Use exatamente:

- mesmo ativo/contrato;
- mesma data;
- mesmo timeframe;
- mesma janela;
- mesmos parâmetros do indicador.

Para cada ponto importante, compare:

- MME 8;
- MMP 20;
- MME 52;
- VWAP;
- início/fim da nuvem;
- candle em que apareceu COMPRA;
- candle em que apareceu VENDA.

Se houver divergência, registre:

~~~text
Ativo:
Contrato:
Data:
Timeframe:
Horário:
Valor no TradingView:
Valor no Simulador:
Sinal esperado:
Sinal exibido:
~~~

Se possível, tire uma captura de tela do TradingView e outra do Simulador no mesmo momento.

Essa comparação será usada para criar/ajustar fixtures de regressão.

---

# ETAPA 10 — Repetir para WDOFUT

Depois que WINFUT estiver validado:

1. repita o mesmo processo com WDOFUT;
2. escolha uma data conhecida;
3. deixe o planejador informar o aquecimento;
4. exporte os CSVs necessários;
5. trate os arquivos;
6. execute a sessão;
7. compare com o TradingView.

Somente depois dessa validação prática faz sentido considerar os itens do ROADMAP:

~~~text
Importar histórico de WIN
Importar histórico de WDO
~~~

como plenamente validados com dados reais do usuário.

---

# CMD — somente se for necessário executar o projeto pelo código

Para usar o aplicativo já compilado, não é necessário terminal.

Se você precisar rodar o código-fonte localmente, use CMD.

## 1. Abrir o CMD

Pressione:

~~~text
Win + R
~~~

Digite:

~~~text
cmd
~~~

Pressione Enter.

## 2. Entrar na pasta do projeto

Exemplo:

~~~bat
cd /d "C:\Users\SEU_USUARIO\Documents\simulador-de-trade"
~~~

O parâmetro `/d` também permite trocar de unidade.

## 3. Conferir Node e npm

~~~bat
node --version
npm --version
~~~

Se o comando `npm` não funcionar, tente:

~~~bat
npm.cmd --version
~~~

## 4. Instalar exatamente as dependências validadas

~~~bat
npm ci
~~~

Se houver alguma associação estranha do Windows com o comando npm:

~~~bat
npm.cmd ci
~~~

## 5. Executar no navegador para desenvolvimento

~~~bat
npm run dev
~~~

ou:

~~~bat
npm.cmd run dev
~~~

## 6. Executar em Tauri

~~~bat
npm run tauri dev
~~~

ou:

~~~bat
npm.cmd run tauri dev
~~~

## 7. Compilar

~~~bat
npm run tauri build
~~~

ou:

~~~bat
npm.cmd run tauri build
~~~

Não execute esses comandos no PowerShell se a política local estiver bloqueando scripts.

---

# O que NÃO precisa ser feito agora

Não é necessário, neste momento:

- alterar ExecutionPolicy do PowerShell;
- instalar Git apenas para testar o executável;
- gerar uma tag;
- configurar assinatura digital;
- criar chaves do atualizador;
- publicar uma release oficial;
- compilar localmente se o instalador/portátil já abrir.

Esses itens pertencem à etapa de distribuição oficial.

---

# O que o desenvolvimento pode continuar sem o usuário

Enquanto os testes práticos são realizados, o desenvolvimento pode continuar no repositório em itens como:

- resultado por tipo de sinal/setup;
- expansão das preferências do aplicativo;
- calendário B3 para outros anos;
- refinamento da política de rolagem/contratos;
- indexador temporal M1;
- seek direto no CSV bruto;
- preparação da arquitetura de release/updater;
- mais testes automatizados.

---

# Checklist mínimo que o usuário deve devolver

Após os testes, basta informar:

~~~text
[ ] Instalador abriu
[ ] Portátil abriu
[ ] Backup exportou
[ ] Plano real foi criado
[ ] CSV WIN foi tratado
[ ] Replay WIN abriu
[ ] Aquecimento ficou oculto
[ ] M2 funcionou
[ ] M5 funcionou
[ ] Bloqueio sem sinal funcionou
[ ] OCO funcionou
[ ] Relatório abriu
[ ] JSON foi exportado
[ ] CSV foi exportado
[ ] Comparação com TradingView foi feita
[ ] Teste WDO foi feito
~~~

Se algum item falhar, envie a mensagem de erro e, se possível, uma captura de tela.
