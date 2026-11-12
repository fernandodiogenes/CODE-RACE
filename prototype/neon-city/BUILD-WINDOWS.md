# CODE RACE — NEON CITY para Windows

O desktop usa Electron para abrir o protótipo completo em uma janela maximizada.
Os arquivos do jogo, modelos, perguntas e a biblioteca Three.js são incluídos no
pacote; o aplicativo não inicia um servidor local e não precisa de internet para
carregar esses recursos.

## Pré-requisitos de desenvolvimento

- Node.js LTS e npm.
- Windows 10/11 de 64 bits para validação nativa. O empacotamento também pode
  ser gerado em macOS com Electron Builder.
- Acesso à internet durante a instalação das dependências e o primeiro build do
  Electron Builder, que baixa o runtime e as ferramentas do empacotador.

Esses pré-requisitos são apenas para desenvolvimento/empacotamento. Quem instala
o jogo não precisa de Node.js, npm, VS Code ou servidor.

## Comandos

Na raiz do projeto:

```sh
npm ci
npm run dev
npm run test:desktop
npm run build:win:installer
npm run build:win:portable
```

`npm run dev` abre o aplicativo Electron durante o desenvolvimento.
`npm run test:desktop` executa o smoke test do desktop, incluindo inicialização
3D, persistência, gameplay básico e apresentação/dispensa de um evento global.
`npm run build:win` gera os dois alvos Windows x64 de uma vez.

O instalador NSIS e o executável portátil são gravados em `dist/neon-city/`:

- `CODE-RACE-NEON-CITY-1.0.0-win-x64-setup.exe`
- `CODE-RACE-NEON-CITY-1.0.0-win-x64-portable.exe`

O instalador é configurado para instalação por usuário, com atalho na Área de
Trabalho e no Menu Iniciar. O pacote é unsigned enquanto não houver certificado
de assinatura digital configurado; o Windows poderá exibir o aviso padrão para
aplicativos sem assinatura.
Como o projeto não fornece um ícone de aplicativo, o Electron Builder usa o
ícone padrão do Electron.

## Dados e execução offline

O progresso salvo continua no `localStorage` do perfil persistente do Electron,
sob o diretório de dados do usuário do aplicativo. Não é salvo dentro da pasta
de instalação.

Three.js e seus addons são importados da dependência local incluída no pacote.
Modelos, texturas, imagens e bancos de perguntas do protótipo também são
empacotados. O build não inclui as pastas de referência, testes automatizados ou
arquivos de auditoria de perguntas.

O protótipo atualmente mostra um espaço reservado para o vídeo de lore; o arquivo
`assets/intro/video/neon-city-lore.mp4` não está presente no projeto. A ausência
desse vídeo não bloqueia o jogo nem exige conexão externa.

## Verificação em Windows

Depois de gerar o instalador, instale e execute-o em um computador Windows sem
Node.js e sem VS Code. Verifique o carregamento da cidade 3D, personagens,
perguntas, modal e rolagem, HACKs, eventos globais, salvar/reabrir partida e
encerramento pelo botão Fechar. O build feito em outro sistema operacional não
substitui esse teste nativo.
