# Exportação do relatório de sessão

## Objetivo

Sessões concluídas podem ser exportadas diretamente pelo relatório pós-sessão do aplicativo desktop.

A primeira versão oferece dois formatos com objetivos diferentes:

- **Relatório JSON** — preserva a estrutura completa da sessão;
- **Trades CSV** — facilita análise tabular em Excel, LibreOffice, Python, R ou outras ferramentas.

## Relatório JSON

O botão **Exportar relatório JSON** gera um arquivo versionado com:

- identificador e configuração da sessão;
- ativo, data, timeframe e modo Treino/Prova;
- métricas completas calculadas para a sessão;
- resultado por horário;
- tentativas bloqueadas agrupadas por motivo;
- eventos disciplinares, técnicos e de execução;
- todos os trades da sessão;
- custos, slippage, política intrabar e resultado líquido;
- notas pós-trade;
- snapshots do contexto gráfico da entrada.

O formato possui:

~~~text
format: simulador-de-trade-session-report
schemaVersion: 1
~~~

Isso permite evoluir o formato futuramente sem reinterpretar silenciosamente arquivos antigos.

## Trades CSV

O botão **Exportar trades CSV** gera uma linha por trade encerrado.

Entre as colunas estão:

- sessão;
- data;
- ativo;
- timeframe;
- modo;
- direção;
- sinal;
- entrada solicitada e executada;
- stop;
- alvo;
- contratos;
- abertura/fechamento;
- motivo da saída;
- resultado em pontos;
- bruto, custos e líquido em reais;
- slippage;
- política intrabar;
- nota pós-trade;
- contexto da entrada serializado.

O CSV usa escaping para textos com vírgulas, aspas ou quebras de linha.

## Quando os botões ficam disponíveis

A exportação é liberada somente para sessões encerradas.

Isso evita produzir um arquivo chamado de relatório completo enquanto a sessão ainda está recebendo operações ou eventos.

No Modo Prova, o relatório continua bloqueado enquanto a prova estiver ativa.

## Onde os arquivos são salvos

No desktop Tauri, o sistema abre o diálogo nativo do Windows para o usuário escolher a pasta e o nome.

Sugestões automáticas de nome:

~~~text
AAAA-MM-DD-WINFUT-relatorio.json
AAAA-MM-DD-WINFUT-trades.csv
~~~

ou equivalentes para WDOFUT.

## Segurança

A escrita do arquivo é executada pelo backend Tauri.

O backend:

- aceita apenas JSON ou CSV;
- valida a extensão escolhida;
- acrescenta a extensão quando ela foi omitida;
- rejeita extensão incompatível;
- limita uma exportação individual a 100 MB.

## Diferença para o backup

A exportação de sessão e o backup têm objetivos diferentes.

**Backup** protege o banco completo do usuário para restauração.

**Exportação de sessão** produz um pacote de análise de uma sessão específica e pode ser compartilhado ou processado por ferramentas externas.

Os arquivos brutos do Profit e os arquivos de replay não são copiados para o relatório.
