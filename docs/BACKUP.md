# Backup, exportação e importação

## Objetivo

O Simulador de Trade possui um backup portátil em JSON para proteger os dados produzidos pelo usuário sem exigir que ele procure manualmente o arquivo SQLite.

No aplicativo desktop, os botões usam os diálogos nativos do sistema operacional para escolher onde salvar ou qual arquivo restaurar.

## O que entra no backup

O backup `schemaVersion: 1` inclui:

- trades encerrados;
- quantidade de contratos;
- custos, slippage, bruto e líquido;
- notas pós-trade;
- snapshots estruturados do contexto da entrada;
- sessões de treinamento;
- modo Treino/Prova;
- eventos disciplinares e técnicos;
- sinais ignorados;
- tentativas bloqueadas;
- configurações de execução.

O arquivo também registra:

- formato do backup;
- versão do schema;
- versão do aplicativo;
- timestamp de exportação.

## O que não entra

O backup não copia:

- CSV bruto do Profit Ultra;
- arquivos `.replay.csv`;
- arquivos `.replay.meta.json`;
- arquivos de mercado muito grandes;
- fontes externas usadas para reconstruir o replay.

Esses arquivos permanecem sob controle do usuário e podem ser tratados/catalogados novamente.

Essa separação evita transformar um backup de histórico em um arquivo de centenas de megabytes ou vários gigabytes.

## Como exportar

No aplicativo desktop:

1. abra **Backup e restauração**;
2. clique em **Exportar backup**;
3. escolha a pasta e o nome do arquivo;
4. salve o arquivo `.json`.

O nome sugerido segue o padrão:

~~~text
simulador-de-trade-backup-AAAA-MM-DD.json
~~~

A exportação fica bloqueada enquanto existir uma sessão formal ativa ou posição aberta.

## Como importar

1. finalize qualquer sessão/posição atual;
2. clique em **Importar backup**;
3. selecione um arquivo JSON criado pelo Simulador de Trade;
4. aguarde a confirmação das quantidades importadas.

A importação valida:

- identificador do formato;
- versão do schema;
- estrutura JSON.

## Política de restauração: mesclagem

A primeira versão não apaga silenciosamente o banco atual.

A importação funciona por ID:

- um ID que não existe é adicionado;
- um ID já existente é atualizado com o conteúdo do backup;
- registros locais com IDs diferentes permanecem no banco.

As configurações de execução presentes no backup passam a ser as configurações atuais.

## Transação

A restauração é executada em uma única transação SQLite.

Se uma etapa falhar, a transação não é confirmada. Isso evita que apenas parte do backup seja aplicada.

## Modo web

Os diálogos nativos de backup estão disponíveis no aplicativo Tauri.

O modo web de desenvolvimento mantém a persistência de teste em `localStorage`, mas a ferramenta de arquivo de backup foi deliberadamente concentrada no desktop, que é o formato final previsto para o projeto.

## Recomendações ao usuário

Crie backups especialmente:

- antes de atualizar o aplicativo;
- antes de importar outro histórico;
- após um conjunto importante de sessões;
- antes de qualquer manutenção no computador.

É recomendável guardar pelo menos uma cópia em outro disco, pasta sincronizada ou mídia externa.
