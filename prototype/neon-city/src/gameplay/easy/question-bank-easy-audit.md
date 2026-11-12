# Auditoria — banco INICIANTE (question-bank-easy.json)

Total: **135** questões. IDs com prefixo `pf-` (o banco atual usa `py-`; sem colisão). `timeLimit: null` em todas.

## Dificuldade

- easy: 65 (48%)
- medium: 56 (41%)
- hard: 14 (10%)

## Categorias (mesmos nomes do banco atual)

| Categoria | Total | easy | medium | hard |
|---|---|---|---|---|
| CONDICIONAIS | 22 | 10 | 11 | 1 |
| VARIAVEIS_TIPOS | 16 | 11 | 4 | 1 |
| OPERADORES_LOGICOS | 14 | 8 | 5 | 1 |
| DEBUG | 14 | 7 | 6 | 1 |
| COMPARACAO | 13 | 8 | 5 | 0 |
| PREVISAO_SAIDA | 12 | 2 | 8 | 2 |
| INTRODUCAO_PRINT | 11 | 7 | 4 | 0 |
| OPERADORES_MATEMATICOS | 11 | 4 | 5 | 2 |
| STRINGS | 9 | 5 | 4 | 0 |
| DESAFIO_MISTO | 8 | 2 | 3 | 3 |
| LOGICA | 5 | 1 | 1 | 3 |

## Formatos pedagógicos (campo `format` = `multiple-choice` em todas)

- output-prediction: 27
- condition: 18
- logic: 15
- true-false: 13
- concept: 12
- type-identification: 10
- comparison: 10
- math: 9
- debug: 8
- mixed: 6
- correct-code: 4
- fix-code: 1
- syntax: 1
- ordering: 1

As 13 questões `true-false` usam `options: ["Verdadeiro","Falso"]` (2 alternativas). `ordering` é uma questão de escolher a versão com as linhas na ordem certa.

## Cobertura dos slides (slide principal de cada questão)

| Slide | Tema | Questões |
|---|---|---|
| 1 | Abertura / print | 1 |
| 3 | Python × C++ (: e recuo) | 1 |
| 4 | print() e input() | 3 |
| 5 | Strings e variáveis | 17 |
| 6 | Tipos de dados | 9 |
| 7 | = guarda, == compara | 9 |
| 8 | Operadores | 27 |
| 9 | Comparação → True/False → decisão | 9 |
| 10 | if / elif / else | 12 |
| 11 | Indentação | 4 |
| 12 | Interprete o código | 18 |
| 13 | Qual será a saída? (and) | 13 |
| 14 | Missão (if/else) | 2 |
| 15 | Erro de sintaxe | 5 |
| 16 | Erro lógico | 5 |

## Fora do banco por não aparecerem nos slides

`for`, `while`, `range`, listas, funções, classes, bibliotecas; juntar strings com `+`; precedência e parênteses em contas; `%`, `//`, `**`; métodos de string; regras de nomes de variável; nomes de erros além de SyntaxError e IndentationError; comentários `#`; `if` direto em variável booleana. Os parênteses só aparecem em `print()` e `input()`.

Pequenas extensões do que está nos slides, conscientes:
- `print("Faltam", preco - dinheiro)`: conta dentro do print (slides 4, 8 e 12).
- `if ganhou == True` e `nota = 7.5` em condição: usam só `==`, `>=` e float (slides 6 e 7).
- `print(a or b, a and b)` e `chave and not alarme`: combinam operadores do slide 8.

## Validação

- IDs duplicados: 0; colisões com o banco atual: 0
- Campos ausentes, categoria, dificuldade ou formato inválidos: 0
- `answer` fora do índice: 0; alternativas repetidas: 0; sem explicação: 0
- Conteúdo fora dos slides ou de loops (código, enunciados, explicações, alternativas): 0
- Código executado de verdade (113 de 135): saída, tipo, erro de sintaxe/execução e correção conferem com a resposta marcada. Nas de "qual alternativa", só a marcada passa no teste.
- Todo código foi compilado; só os erros de sintaxe intencionais não compilam.
- Questões longas (enunciado > 25 palavras, código > 8 linhas ou explicação > 35 palavras): 0
- Respostas nos índices 0/1/2/3 (só alternativas de 4 opções): 31/31/30/30; Verdadeiro/Falso: 8/5
- Duplicatas: 6 grupos com o mesmo esqueleto de código foram revisados; cada um testa raciocínio diferente (caminho if/else, fronteira >=, ordem do elif, igualdade com texto ou número).
- Questões ambíguas: 0 (as 22 questões sem teste executável são conceituais, revisadas manualmente)

## Comparação com o banco atual

| Medida | Atual | Novo |
|---|---|---|
| easy / medium / hard | 33 / 72 / 30 | 65 / 56 / 14 |
| Linhas de código (média, só questões com código) | 3.99 | 3.37 |
| Maior código (linhas) | 10 | 8 |
| Questões com código > 8 linhas | 9 | 0 |
| Palavras por explicação (média) | 25.8 | 14.3 |
| Questões longas pelo critério acima | 19 | 0 |

As 19 questões longas do banco atual não foram copiadas nem editadas. O novo banco foi escrito do zero, com o mesmo conteúdo em versões curtas.

## Observações para a implementação

- Não use este banco em LOOP (17), LOOP MALUCO (18), WHILE (21) ou INFINITE LOOP (48) com a lógica de loop do `GAME_SPEC.md`. Os slides não ensinam repetição. Essas casas devem sortear de CONDICIONAIS, PREVISAO_SAIDA, DEBUG e LOGICA.
- Casas V/F (CODE OR LIE, 22): filtre `options.length === 2`. Não há outro campo marcando V/F.
- Casas "escolher o código" (THE IMPOSTOR, DON'T COPY): as questões `correct-code` têm 4 alternativas. Se a casa só mostrar 2, é preciso adaptar no engine.
- Os desafios finais (BOSS 58 e CENTRAL NEXUS 60) pedem "repetição" no spec. Este banco só tem variável + condição + lógica.
- Verifique se o engine aceita alternativas de várias linhas (`pf-condition-022`, `pf-mixed-006`, `pf-mixed-007`, `pf-debug-010`) com indentação preservada.
