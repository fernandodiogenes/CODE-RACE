# Auditoria — banco de questões CODE-RACE / NEON CITY

Total: **135** questões (`question-bank.json`).

## Distribuição por categoria e dificuldade

| Categoria | Total | easy | medium | hard |
|---|---|---|---|---|
| INTRODUCAO_PRINT | 10 | 5 | 5 | 0 |
| STRINGS | 10 | 2 | 7 | 1 |
| VARIAVEIS_TIPOS | 15 | 6 | 7 | 2 |
| OPERADORES_MATEMATICOS | 12 | 5 | 5 | 2 |
| COMPARACAO | 12 | 3 | 7 | 2 |
| OPERADORES_LOGICOS | 15 | 3 | 10 | 2 |
| CONDICIONAIS | 20 | 3 | 12 | 5 |
| PREVISAO_SAIDA | 12 | 2 | 6 | 4 |
| DEBUG | 12 | 4 | 6 | 2 |
| LOGICA | 5 | 0 | 2 | 3 |
| DESAFIO_MISTO | 12 | 0 | 5 | 7 |
| **Total** | **135** | **33** | **72** | **30** |

## Formatos pedagógicos (campo `format` = `multiple-choice` em todas; detalhe em `question-bank.meta.json`)

- output-prediction: 29
- condition: 19
- logic: 18
- mixed: 12
- comparison: 11
- debug: 11
- math: 11
- concept: 8
- type-identification: 8
- correct-code: 4
- syntax: 2
- fix-code: 2

## Posição da resposta correta

- índice 0: 34
- índice 1: 34
- índice 2: 34
- índice 3: 33
- maior sequência consecutiva com o mesmo índice: 3

## Resultado da auditoria

- IDs duplicados: 0
- campos ausentes / categoria, dificuldade ou formato inválidos: 0
- respostas fora do índice: 0
- questões sem explicação: 0
- alternativas duplicadas dentro de uma questão: 0
- conteúdo proibido (for, while, range, loops, funções, classes, módulos, listas, métodos, etc.), em código, alternativas, enunciados e explicações: 0
- inconsistência entre código executado e resposta marcada: 0 (125 de 135 questões verificadas executando o código Python de verdade)
- questões ambíguas restantes: 0 (revisão manual)
- duplicatas relevantes: 0 (5 pares com o mesmo esqueleto de código foram revisados e testam raciocínios diferentes)

## Como a verificação funcionou

Questões de saída foram executadas e a saída comparada com a alternativa marcada. Questões de erro foram checadas para confirmar se dão SyntaxError ou erro de execução. Questões de tipo foram checadas com `type()`. Questões “qual expressão é True”, “qual condição representa a regra” e “qual linha corrige o código” foram testadas contra todas as alternativas, e apenas a marcada como correta passa no teste.

As 10 questões não executáveis (conceituais) foram revisadas manualmente: py-print-003, py-variable-015, py-math-011, py-compare-004, py-compare-010, py-compare-012, py-boolean-009, py-boolean-010, py-condition-010, py-logic-005.
