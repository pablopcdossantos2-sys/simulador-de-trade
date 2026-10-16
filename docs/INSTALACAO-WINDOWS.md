# Instalação no Windows

Este tutorial é destinado a usuários que não trabalham habitualmente com terminal, Rust, Node.js ou compilação de programas.

## Opção recomendada: instalador

A forma mais simples de usar o Simulador de Trade é o arquivo:

~~~text
Simulador-de-Trade-setup.exe
~~~

Quando ele estiver disponível nos artefatos de uma versão:

1. baixe o arquivo `Simulador-de-Trade-setup.exe`;
2. dê dois cliques nele;
3. siga as telas do instalador;
4. ao final, abra **Simulador de Trade** normalmente pelo Windows.

O instalador é gerado pelo Tauri usando NSIS.

Ele também utiliza o modo padrão de bootstrap do WebView2. Se o runtime não estiver presente, o instalador pode providenciar a instalação necessária.

## Versão portátil

O pipeline também produz:

~~~text
Simulador-de-Trade-portable.exe
~~~

Essa versão não possui instalador.

Uso:

1. crie uma pasta, por exemplo:

~~~text
C:\Programas Portateis\Simulador de Trade
~~~

2. coloque o arquivo `Simulador-de-Trade-portable.exe` nessa pasta;
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
Simulador-de-Trade-setup.exe
Simulador-de-Trade-portable.exe
~~~

Os dois arquivos são reunidos em um artefato do GitHub Actions chamado:

~~~text
simulador-de-trade-windows-x64
~~~

## Para desenvolvedores: compilação local

Quem quiser compilar o projeto manualmente precisa instalar os pré-requisitos do Tauri 2 para Windows, além de Node.js/npm e Rust.

Depois, na pasta do projeto:

~~~text
npm install
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
