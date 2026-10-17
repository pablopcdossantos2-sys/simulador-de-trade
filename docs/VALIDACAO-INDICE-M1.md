# Tutorial — validar índice M1 e seek direto com um CSV real do Profit

Este teste é a etapa que depende de um arquivo real existente no computador do usuário. Não é necessário usar terminal.

## Objetivo

Confirmar que:

1. o Simulador de Trade consegue indexar um CSV bruto do Profit minuto a minuto;
2. o índice fica associado ao arquivo original;
3. o tratamento de uma janela horária usa seek direto quando o índice está válido;
4. o replay gerado continua correto e utilizável.

## 1. Obter a versão mais recente do aplicativo

No GitHub do projeto:

1. abra a aba **Actions**;
2. abra **Windows desktop build**;
3. escolha a execução mais recente da branch `main` que esteja concluída com sucesso;
4. na parte inferior da execução, localize **Artifacts**;
5. baixe **simulador-de-trade-windows-x64**;
6. extraia o arquivo ZIP;
7. para testar sem instalar, abra **Simulador-de-Trade-portable.exe**.

O mesmo artefato também contém o instalador **Simulador-de-Trade-setup.exe**.

## 2. Criar um plano de simulação

Na seção **Planejar simulação**:

1. escolha o ativo correto, por exemplo `WINFUT`;
2. informe a data correspondente ao CSV real;
3. escolha M2 ou M5;
4. informe o horário visível, por exemplo `09:00–12:00`;
5. mantenha **Aquecimento padrão** para o primeiro teste;
6. clique em **Usar estes horários no tratamento**.

O sistema mostrará quais pregões são necessários para o alvo e para o aquecimento.

## 3. Informar o CSV bruto

Na seção **Tratar dados necessários**:

1. localize a linha correspondente à data do CSV;
2. no campo de caminho, informe o caminho completo do arquivo.

Exemplo:

```text
C:\Dados\Profit\WINV26_2026-10-14.csv
```

O CSV original não será sobrescrito.

## 4. Criar o índice M1

Com o caminho preenchido:

1. clique em **Indexar M1**;
2. acompanhe a barra de progresso;
3. ao final, a tela deverá informar quantos minutos e quantos negócios foram indexados.

Ao lado do CSV original deverá aparecer um arquivo semelhante a:

```text
WINV26_2026-10-14.m1-index.json
```

Esse arquivo é pequeno em comparação com o CSV e contém offsets de linhas e bytes por minuto.

### Importante

Se o CSV bruto for alterado posteriormente, o índice será considerado desatualizado. Nesse caso, use **Reindexar M1**.

## 5. Gerar o arquivo de replay usando o índice

Depois que a indexação terminar:

1. clique em **Tratar** na mesma linha;
2. acompanhe o progresso;
3. aguarde a confirmação de que o arquivo foi catalogado.

Quando há um índice válido, o backend não precisa começar a leitura no primeiro negócio do CSV. Ele localiza a janela desejada e faz seek diretamente até a região necessária.

## 6. Confirmar que o seek direto foi realmente usado

Na mesma pasta do CSV, abra o arquivo de metadados criado pelo tratamento, semelhante a:

```text
WINV26_2026-10-14_0900-1200.replay.meta.json
```

Pode ser aberto com o Bloco de Notas.

Procure por:

```json
"selectionMode": "M1_INDEX_SEEK"
```

Se esse valor estiver presente, o recorte foi produzido pelo novo caminho de índice + seek.

O arquivo também registra:

- `indexPath`;
- `indexedMinutes`;
- `indexedTrades`;
- `sourceByteRange`;
- `sourceLineRange`.

## 7. Testar o replay

Depois que todas as exigências do plano estiverem marcadas como disponíveis:

1. carregue o replay;
2. inicie uma sessão de treino;
3. teste **+1 negócio**;
4. teste **+1 candle**;
5. teste reprodução e pausa;
6. verifique se o gráfico começa exatamente no horário planejado;
7. confirme que nenhum candle futuro aparece;
8. faça ao menos uma operação quando houver sinal válido e confirme que Stop/Alvo continuam sendo avaliados normalmente.

## 8. Teste recomendado de reutilização

Para comprovar a utilidade do índice:

1. mantenha o mesmo CSV bruto;
2. crie outro plano ou outro recorte horário compatível com o mesmo pregão;
3. não reindexe;
4. clique apenas em **Tratar**.

O índice existente deverá ser reutilizado automaticamente.

## Se aparecer um erro

Guarde:

- a mensagem completa exibida pelo aplicativo;
- a data e o ativo do CSV;
- se o arquivo estava em ordem ascendente ou descendente, caso saiba;
- uma captura de tela da seção em que o erro apareceu.

Não é necessário enviar o arquivo bruto inteiro de imediato. Em muitos casos, a mensagem e algumas linhas de exemplo já são suficientes para diagnosticar o layout.
