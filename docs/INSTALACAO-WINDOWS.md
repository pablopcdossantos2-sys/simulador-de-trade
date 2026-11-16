# Instalação no Windows

Este tutorial é destinado a usuários que não trabalham habitualmente com terminal, Rust, Node.js ou compilação de programas.

## Primeiro: obter um pacote que realmente corresponde à main

O pacote Windows não é recompilado a cada alteração de código. **O artefato da execução [43781902065](https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions/runs/43781902065) contém o commit `7446a18`** e é anterior ao seletor das duas estratégias, à revisão do ícone de informação e ao novo layout de importação.

1. Acesse [Windows packaging (on demand)](https://github.com/pablopcdossantos2-sys/simulador-de-trade/actions/workflows/windows-build.yml).
2. Clique em **Run workflow** (no canto superior direito da lista). Selecione **Branch: main** e clique em **Run workflow** novamente.
3. Abra **a execução que acabou de iniciar**. Após aparecer a marca **Success**, procure **Artifacts**, na parte inferior da página.
4. Baixe `simulador-de-trade-windows-x64` **dessa execução**; descompacte o ZIP em uma nova pasta. Não use um ZIP baixado anteriormente.
5. Confira `BUILD-INFO.txt`: a linha **Commit:** identifica a revisão efetivamente compilada e **Build:** aponta para a execução exata do GitHub.
6. Execute `Simulador-de-Trade-Portable.exe` e observe o texto discreto **Compilação: XXXXXXX** abaixo de “Simulador de Trade”. Os sete caracteres devem coincidir com os sete primeiros caracteres da linha **Commit:**. Se o texto não existir, o executável é anterior a esse recurso.

Nenhuma dessas etapas exige Git, Node ou terminal. Não é necessário criar uma release para testar as correções.

## Opção recomendada: instalador

A forma mais simples de usar o Simulador de Trade é o arquivo:

~~~text
Simulador-de-Trade-Instalador.exe
~~~

Quando ele estiver disponível nos artefatos de uma versão:

1. baixe o arquivo `Simulador-de-Trade-Instalador.exe`;
2. dê dois cliques nele;
3. siga as telas do instalador;
4. ao final, abra **Simulador de Trade** normalmente pelo Windows.

O instalador é gerado pelo Tauri usando NSIS.

Ele também utiliza o modo padrão de bootstrap do WebView2. Se o runtime não estiver presente, o instalador pode providenciar a instalação necessária.

## Versão portátil

O pipeline também produz:

~~~text
Simulador-de-Trade-Portable.exe
~~~

Essa versão não possui instalador.

Uso:

1. crie uma pasta, por exemplo:

~~~text
C:\Programas Portateis\Simulador de Trade
~~~

2. coloque o arquivo `Simulador-de-Trade-Portable.exe` nessa pasta;
3. dê dois cliques no executável.

### Importante sobre o portátil

“Portátil” neste projeto significa que o executável principal pode ser aberto sem passar pelo instalador do aplicativo.

Isso não significa que o arquivo carregue dentro dele todos os componentes do Windows.

O Tauri usa o Microsoft WebView2 para renderizar a interface. Em computadores Windows modernos ele normalmente já está disponível.

Se o portátil não abrir por ausência do WebView2, use o instalador.

## Onde ficam os dados

Mesmo usando o executável portátil, o banco do usuário continua sendo armazenado na pasta de dados da aplicação gerenciada pelo Windows/Tauri.

Isso é intencional.

A vantagem é que substituir o executável portátil por uma versão nova não deve exigir apagar o banco local.

Ainda assim, antes de atualizar, recomendamos usar:

~~~text
Backup e restauração → Exportar backup
~~~

## Atualização manual do portátil

Enquanto o atualizador automático ainda não estiver concluído:

1. exporte um backup;
2. feche o Simulador de Trade;
3. baixe o executável portátil da versão mais recente;
4. substitua o executável antigo;
5. abra novamente o programa;
6. confirme que o histórico aparece normalmente.

As migrações do SQLite são executadas pelo próprio aplicativo.

## Se o Windows mostrar um aviso

Enquanto o projeto não possuir assinatura digital de distribuição, o Windows pode mostrar avisos de reputação/SmartScreen para binários baixados da internet.

Isso não deve ser confundido com um certificado já existente: nesta fase o pipeline gera binários **não assinados**.

A assinatura de releases permanece uma etapa separada do ROADMAP.

## Como os arquivos são gerados

O repositório possui o workflow:

~~~text
.github/workflows/windows-build.yml
~~~

Ele executa em Windows e produz:

~~~text
Simulador-de-Trade-Instalador.exe
Simulador-de-Trade-Portable.exe
~~~

Os dois arquivos são reunidos em um artefato do GitHub Actions chamado:

~~~text
simulador-de-trade-windows-x64
~~~

## Para desenvolvedores: compilação local

Quem quiser compilar o projeto manualmente precisa instalar os pré-requisitos do Tauri 2 para Windows, além de Node.js/npm e Rust. O repositório inclui `package-lock.json` e `src-tauri/Cargo.lock`: `npm ci` reproduz o frontend usado no CI e o Cargo reutiliza as versões Rust/Tauri travadas no lockfile.

Depois, na pasta do projeto:

~~~text
npm ci
npm run tauri build
~~~

O instalador NSIS é gerado dentro da árvore:

~~~text
src-tauri\target\release\bundle\nsis\
~~~

O executável compilado fica em:

~~~text
src-tauri\target\release\
~~~

Usuários comuns não precisam executar esses comandos quando os artefatos do GitHub Actions estiverem disponíveis.


## Primeiro teste de aceitação

Para obter os binários mais recentes pela execução sob demanda e executar o roteiro de validação em WINFUT/WDOFUT, siga o [tutorial humano detalhado](VALIDACAO-HUMANA-PASSO-A-PASSO.md). O workflow não roda automaticamente em cada commit.
