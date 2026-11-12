const HOUSE_COPY = Object.freeze({
  1: ['START', 'A conexão com Neon City foi estabelecida. O primeiro passo começa aqui; sua posição permanece nesta casa.'],
  2: ['PRINT', 'Você responderá uma pergunta fácil sobre print(). Se acertar, avança 1 casa. Se errar, volta à posição em que começou este turno.'],
  3: ['VARIÁVEIS', 'Você responderá uma pergunta fácil sobre variáveis. Se acertar, avança 1 casa. Se errar, volta à posição em que começou este turno.'],
  4: ['IMPULSO', 'Uma rota secreta foi encontrada. Sua gangue avança 2 casas sem ativar a casa de destino.'],
  5: ['DEPURAÇÃO', 'Você responderá uma pergunta fácil de depuração de código. Se acertar, avança 2 casas. Se errar, volta à posição em que começou este turno.'],
  6: ['DADO DUPLO', 'Jogue o dado novamente. No modo seguro, você permanece onde está. Se arriscar, o resultado pode fazer você avançar ou recuar.'],
  7: ['PERGUNTA RELÂMPAGO', 'Responda uma pergunta fácil em até 10 segundos. Se acertar, avança 2 casas. Se errar ou o tempo acabar, volta à posição em que começou este turno.'],
  8: ['FALHA DO SISTEMA', 'Você responderá uma pergunta de depuração de dificuldade média. Se acertar, avança 1 casa. Se errar ou o tempo acabar, volta à posição em que começou este turno.'],
  9: ['VARIÁVEL MISTERIOSA', 'Descubra o resultado de uma pergunta de dificuldade média sobre código. Se acertar, avança 2 casas. Se errar, volta à posição em que começou este turno.'],
  10: ['TÚNEL DE DADOS', 'Escolha uma gangue que esteja à sua frente para trocar de posição. Gangues atrás de você e a sua própria gangue não podem ser escolhidas. Se ninguém estiver à frente, você avança 2 casas. A nova posição não ativa outra casa.'],
  11: ['CAMINHO LIVRE', 'Sua gangue avança 1 casa. A casa de destino não será ativada novamente.'],
  12: ['CÓDIGO INVERSO', 'Descubra qual trecho de código ou expressão produz o resultado indicado. A pergunta é de dificuldade média. Se acertar, avança 2 casas; se errar, volta à posição em que começou este turno.'],
  13: ['FERRAMENTA ILEGAL', 'Você recebe aleatoriamente 1 HACK permitido. O limite é de 3 HACKs por gangue. Se já tiver 3, avança 1 casa no lugar do HACK.'],
  14: ['O IMPOSTOR', 'Compare dois trechos de código e escolha o único que completa corretamente a instrução. Se acertar, avança 2 casas; se errar, volta à posição em que começou este turno.'],
  15: ['CHECKPOINT ZERO', 'O sistema que você tentou hackear já estava quebrado.\nNenhuma alteração necessária.\nVocê permanece exatamente onde está.'],
  16: ['ERRO CRÍTICO', 'O desafio apresenta dois trechos com erros. Corrija um em cada etapa: acertar os dois faz avançar 3 casas; acertar somente um faz avançar 1 casa; não acertar nenhum faz voltar à posição em que começou este turno. O desafio só se resolve depois das duas respostas.'],
  17: ['REPETIÇÃO', 'Responda a pergunta fácil apresentada. Se acertar, avança 2 casas. Se errar ou o tempo acabar, volta à posição em que começou este turno.'],
  18: ['LAÇO MALUCO', 'Resolva um desafio de lógica e interpretação de código. Se acertar, avança 2 casas; se errar, volta à posição em que começou este turno.'],
  19: ['CONTAGEM REGRESSIVA', 'Responda uma pergunta de dificuldade média em até 15 segundos. Se acertar, avança 2 casas; se errar ou o tempo acabar, volta à posição em que começou este turno.'],
  20: ['ROUBO DE HACK', 'Escolha uma gangue adversária que possua pelo menos 1 HACK. O alvo responderá uma pergunta fácil. Se acertar, protege seus HACKs e o roubo falha. Se errar, sua gangue rouba 1 HACK. O FIREWALL bloqueia o roubo. Se não houver alvo válido, sua gangue avança 2 casas.'],
  21: ['ENQUANTO', 'Responda a pergunta fácil apresentada. Se acertar, avança 2 casas. Se errar ou o tempo acabar, volta à posição em que começou este turno.'],
  22: ['CÓDIGO OU MENTIRA', 'Escolha uma das opções disponíveis. Uma delas não altera sua posição; a outra aplica o avanço configurado. A casa de destino não será ativada novamente.'],
  23: ['DEPURAÇÃO DE RISCO', 'Responda uma pergunta difícil de depuração. Se acertar, avança 3 casas. Se errar, volta à posição em que começou este turno.'],
  24: ['INVASÃO DE REDE', 'Escolha uma gangue adversária. As duas gangues responderão à mesma pergunta de dificuldade média, cada uma uma vez. A primeira a acertar avança 3 casas; a outra recua 1 casa e pode usar ESCUDO para cancelar o recuo. Se ambas errarem, não há movimento. O FIREWALL protege a gangue alvo.'],
  25: ['RESERVA DE PROTEÇÃO', 'Sua gangue recebe 1 HACK ESCUDO. Se já tiver 3 HACKs, avança 1 casa no lugar do HACK.'],
  26: ['FALHA FANTASMA', 'Responda uma pergunta de dificuldade média sobre lógica e código. Se acertar, avança 3 casas. Se errar ou o tempo acabar, volta à posição em que começou este turno.'],
  27: ['FALHA DO SISTEMA', 'Uma roleta será girada e um dos resultados abaixo será sorteado:'],
  28: ['NÃO COPIE', 'Escolha o código correto em uma pergunta de dificuldade média. Um acerto mantém sua gangue nesta casa. Se errar, volta à posição em que começou este turno.'],
  29: ['CÓDIGO CRIPTOGRAFADO', 'Resolva três miniquestões de programação em até 60 segundos no total. Três acertos valem +2 casas; dois acertos valem +1; com um ou nenhum acerto, você volta à posição em que começou este turno. O tempo esgotado encerra o desafio e causa o mesmo retorno.'],
  30: ['CHECKPOINT CYBER ALLEY', 'Você atravessou a primeira zona da cidade.\nO sinal ainda está ativo. Continue avançando.'],
  31: ['DUELO', 'Todas as gangues respondem à mesma pergunta de dificuldade média. A primeira gangue a acertar vence: avança 3 casas, enquanto a gangue adversária recua 1 e pode usar ESCUDO para cancelar o recuo. Se ninguém acertar, não há movimento. Uma gangue protegida pelo FIREWALL pode responder, mas não pode ser escolhida como adversária.'],
  32: ['BATALHA RELÂMPAGO', 'Será apresentada uma pergunta de Python para todas as gangues. O professor registra a primeira gangue a responder: se acertar, avança 3 casas; se errar, permanece onde está.'],
  33: ['EMBOSCADA', 'Escolha uma gangue adversária. Somente o alvo responderá a uma pergunta média. Se acertar, a emboscada falha e sua gangue recua 1 casa. Se errar, o alvo recua 3 casas. A gangue que receber a penalidade pode usar ESCUDO. O FIREWALL protege o alvo.'],
  34: ['FIREWALL', 'Sua gangue recebe proteção contra DUELO, INVASÃO, EMBOSCADA, SABOTAGEM, SEQUESTRO e roubo de HACK. A proteção dura até terminar seu próximo turno completo. FIREWALL não é HACK e não ocupa espaço no limite de HACKs. Enquanto estiver protegida, nenhuma gangue pode escolhê-la como alvo dessas ações.'],
  35: ['TROCA DE POSIÇÃO', 'Sua gangue troca de posição com a gangue imediatamente à frente. Você não escolhe o alvo. Se não houver uma gangue à frente, sua gangue avança 2 casas. A nova casa não é ativada.'],
  36: ['APOSTA', 'Escolha uma aposta segura ou de alto risco. A aposta segura usa uma pergunta média: acerto avança 2 casas e erro recua 1. O alto risco usa uma pergunta difícil: acerto avança 3 e erro recua 2. Um HACK ESCUDO pode cancelar uma penalidade aplicável.'],
  37: ['LEILÃO', 'Escolha apostar 1, 2 ou 3 casas e responda uma pergunta média. Se acertar, avança o valor apostado; se errar, recua esse mesmo valor. Um HACK ESCUDO pode cancelar a penalidade.'],
  38: ['SEQUESTRO', 'Escolha uma gangue adversária para aplicar FROZEN. O alvo perderá o próximo lançamento normal e poderá tentar o PROTOCOLO DE FUGA antes de rolar. Um acerto remove FROZEN; um erro mantém o bloqueio até o limite de duração. O FIREWALL protege o alvo.'],
  39: ['ALIANÇA', 'Escolha uma gangue parceira. As duas responderão à mesma pergunta, uma vez cada. Se ambas acertarem, cada gangue avança 2 casas. Se qualquer uma errar, nenhuma recebe o bônus.'],
  40: ['TRAIÇÃO', 'Escolha: TRAIR, para avançar 2 casas, ou COOPERAR, para receber 1 HACK. Não é preciso escolher outra gangue nem responder a uma pergunta. Se sua gangue já tiver 3 HACKs, COOPERAR não acrescenta outro.'],
  41: ['ALCANCE', 'Responda uma pergunta de dificuldade média. Se acertar, avance até 3 casas, sem ultrapassar a gangue imediatamente à frente; se ninguém estiver à frente, pode avançar 3. Se errar, volte à posição em que começou este turno. A casa de destino não é ativada.'],
  42: ['SABOTAGEM', 'Escolha uma gangue adversária. Somente o alvo responderá a uma pergunta difícil. Se acertar, a sabotagem falha. Se errar, o alvo recua 2 casas e pode usar ESCUDO para cancelar o recuo. O FIREWALL protege o alvo.'],
  43: ['JULGAMENTO', 'Todas as gangues respondem individualmente à mesma pergunta difícil. A primeira a acertar avança 2 casas; as demais que acertarem avançam 1. Erros e tempo esgotado não dão recompensa.'],
  44: ['DÚVIDA', 'Escolha RESPONDER SOZINHO ou PEDIR AJUDA. Sozinho, acertar uma pergunta média avança sua gangue 2 casas. Se pedir ajuda, escolha uma gangue parceira: as duas respondem à mesma pergunta. Ambas precisam acertar para avançarem 2 casas cada; qualquer erro cancela o bônus.'],
  45: ['CHECKPOINT BLACK MARKET', 'O mercado ficou para trás.\nSua posição permanece. A próxima rota já está aberta.'],
  46: ['EVENTO GLOBAL', 'Um dos eventos globais será sorteado e ativado por uma rodada completa. Depois do sorteio, a janela mostra o nome e a explicação do evento escolhido.'],
  47: ['GRAVIDADE INVERTIDA', 'No próximo lançamento desta gangue, o resultado do dado será invertido. O efeito é consumido nesse lançamento.'],
  48: ['LAÇO INFINITO', 'Responda um desafio de depuração. Se acertar, avança 3 casas. Se errar, sua gangue recebe INFINITE LOOP: a próxima recompensa positiva de movimento é cancelada uma vez. O efeito não cancela o lançamento normal nem movimentos negativos.'],
  49: ['PORTA OU ARMADILHA', 'Escolha antes da pergunta: a PORTA A apresenta um desafio médio e vale +2 casas no acerto; a PORTA B apresenta um desafio difícil e vale +3. Errar em qualquer porta faz sua gangue voltar à posição em que começou este turno.'],
  50: ['RISCO MÁXIMO', 'Escolha NORMAL, com pergunta média e recompensa de +2 casas, ou MÁXIMO, com pergunta difícil e recompensa de +3. Errar faz sua gangue voltar à posição em que começou este turno. Não há aposta nem penalidade extra.'],
  51: ['INJEÇÃO DE VÍRUS', 'Escolha uma gangue adversária. Ela recebe VIRUS INJECTION e pode tentar removê-lo imediatamente respondendo a um desafio médio. Se acertar, o próximo dado fica sem limite; se errar, o vírus permanece e limita o próximo lançamento a 3. O efeito termina nesse lançamento.'],
  52: ['RESERVA DE HACKER', 'Responda uma pergunta difícil. Se acertar, recebe o HACK OVERRIDE; se já tiver 3 HACKs, avança 1 casa no lugar. Errar não dá bônus.'],
  53: ['FALHA', 'Uma roleta será girada e um dos resultados abaixo será sorteado:'],
  54: ['REDE RELÂMPAGO', 'Todas as gangues respondem à mesma pergunta. Cada gangue responde uma vez: o primeiro acerto avança 1 casa e os demais permanecem onde estão. Erros não recebem recompensa.'],
  55: ['CHECKPOINT NEON', 'O sinal da cidade continua estável.\nVocê chegou ao último checkpoint antes dos protocolos finais.'],
  56: ['PROTOCOLO CHEFE 01', 'Resolva uma questão média de condicionais em 30 segundos. Se acertar, permaneça na casa; se errar ou o tempo acabar, recue 1 casa.'],
  57: ['PROTOCOLO CHEFE 02', 'Resolva o desafio difícil de depuração em 35 segundos. Se acertar, permaneça na Casa 57 e receba 1 HACK, se houver espaço. Com 3 HACKs, permaneça na casa. Se errar ou o tempo acabar, recue 1 casa; ESCUDO pode cancelar.'],
  58: ['PROTOCOLO CHEFE 03', 'Você terá 30 segundos para resolver um desafio misto do banco atual, envolvendo interpretação de código e condições. Se acertar, avance 1 casa e desbloqueie o PORTÃO FINAL, sem ativá-lo nesse movimento. Se errar ou o tempo acabar, permaneça na Casa 58 e encerre o turno.'],
  59: ['PENÚLTIMO DESAFIO', 'Responda à questão difícil para avançar ao CENTRAL NEXUS. Se acertar, avance para a Casa 60. Se errar ou o tempo acabar, volte à Casa 58.'],
  60: ['NÚCLEO CENTRAL', 'A Casa 60 inicia a prova final. Responda em até 60 segundos a uma pergunta difícil de depuração do banco atual. Se acertar, você entra na classificação como finalista; a primeira conclusão correta define o vencedor. Se errar ou o tempo acabar, volte à Casa 58.']
});

const SHORT_HOUSE_DESCRIPTIONS = Object.freeze({
  2: 'Responda sobre print(). Acerto: avance 1 casa. Erro: volte ao início do turno.',
  3: 'Responda sobre variáveis. Acerto: avance 1 casa. Erro: volte ao início do turno.',
  5: 'Resolva a depuração. Acerto: avance 2 casas. Erro: volte ao início do turno.',
  7: 'Responda em 15 segundos. Acerto: avance 2 casas. Erro ou tempo esgotado: volte ao início do turno.',
  8: 'Resolva a depuração média. Acerto: avance 1 casa. Erro ou tempo esgotado: volte ao início do turno.',
  9: 'Resolva o desafio de código. Acerto: avance 2 casas. Erro: volte ao início do turno.',
  12: 'Identifique o resultado do código. Acerto: avance 2 casas. Erro: volte ao início do turno.',
  14: 'Escolha o trecho correto. Acerto: avance 2 casas. Erro: volte ao início do turno.',
  16: 'Resolva dois erros. Dois acertos: +3 casas; um: +1; nenhum: volte ao início do turno.',
  17: 'Responda a pergunta. Acerto: avance 2 casas. Erro ou tempo esgotado: volte ao início do turno.',
  18: 'Resolva a lógica. Acerto: avance 2 casas. Erro: volte ao início do turno.',
  19: 'Responda em 18 segundos. Acerto: avance 2 casas. Erro ou tempo esgotado: volte ao início do turno.',
  20: 'Escolha um alvo com HACK. Se ele errar, roube 1 HACK; se não houver alvo, avance 2 casas.',
  21: 'Responda a pergunta. Acerto: avance 2 casas. Erro ou tempo esgotado: volte ao início do turno.',
  22: 'Escolha uma opção e resolva o desafio. A opção escolhida define o efeito.',
  23: 'Resolva a depuração difícil. Acerto: avance 3 casas. Erro: volte ao início do turno.',
  24: 'Escolha um adversário. O primeiro acerto avança 3; o outro recua 1. ESCUDO pode cancelar o recuo.',
  26: 'Resolva a lógica. Acerto: avance 3 casas. Erro ou tempo esgotado: volte ao início do turno.',
  28: 'Escolha o código correto. Acerto: permaneça; erro: volte ao início do turno.',
  29: 'Resolva três miniquestões. Três acertos: +2; dois: +1; menos: volte ao início do turno.',
  31: 'Escolha um adversário. O primeiro acerto avança 3; o outro recua 1. ESCUDO pode cancelar o recuo.',
  32: 'Todas podem responder. O professor registra a primeira gangue a responder.',
  33: 'Escolha um alvo. Acerto dele: sua gangue recua 1; erro: o alvo recua 3. ESCUDO pode cancelar.',
  36: 'Escolha uma aposta média ou difícil. Acerto avança; erro recua conforme a aposta.',
  37: 'Aposte 1, 2 ou 3 casas. Acerto avança o valor; erro recua o mesmo valor.',
  38: 'Escolha um alvo para FROZEN. O acerto remove o bloqueio; o erro mantém o efeito.',
  39: 'Escolha uma parceira. Se ambas acertarem, as duas avançam 2 casas.',
  41: 'Responda. Acerto: avance até 3 casas sem ultrapassar a gangue à frente; erro: volte ao início do turno.',
  42: 'Escolha um alvo. Se errar, ele recua 2 casas; ESCUDO pode cancelar. Acerto não aplica penalidade.',
  43: 'Todas respondem. O primeiro acerto avança 2; os demais, 1.',
  44: 'Responda sozinho ou peça ajuda. O bônus só vale se a condição escolhida for cumprida.',
  48: 'Resolva a depuração. Acerto: avance 3 casas; erro: receba INFINITE LOOP.',
  49: 'Escolha uma porta. A média vale +2; a difícil, +3. Erro: volte ao início do turno.',
  50: 'Escolha NORMAL (+2) ou MÁXIMO (+3). Erro: volte ao início do turno.',
  51: 'Escolha um alvo para VIRUS INJECTION. Acerto remove o vírus; erro limita o próximo dado a 3.',
  52: 'Resolva a pergunta difícil. Acerto: receba OVERRIDE; com 3 HACKs, avance 1 casa.',
  54: 'Todas respondem. O primeiro acerto avança 1 casa; os demais permanecem.',
  56: 'Resolva uma questão média de condicionais em 30 segundos. Se acertar, permaneça na casa; se errar ou o tempo acabar, recue 1 casa.',
  57: 'Resolva a depuração difícil em 35 segundos. Acerto: permaneça e receba 1 HACK se houver espaço. Com 3 HACKs, permaneça. Erro ou tempo esgotado: recue 1; ESCUDO pode cancelar.',
  58: 'Resolva o desafio misto em 30 segundos. Acerto: avance 1 e desbloqueie o Portão Final; erro ou tempo esgotado: permaneça na Casa 58.',
  59: 'Responda à questão difícil para avançar ao CENTRAL NEXUS em 35 segundos. Acerto: vá à Casa 60; erro ou tempo esgotado: volte à Casa 58.',
  60: 'Resolva a prova final em 60 segundos. Acerto: torne-se finalista; erro ou tempo esgotado: volte à Casa 58.'
});

const HOUSE_NAMES = Object.freeze({
  1: 'SISTEMA CONECTADO',
  15: 'PONTO DE CONTROLE ZERO',
  30: 'PONTO DE CONTROLE DO BECO CIBERNÉTICO',
  45: 'PONTO DE CONTROLE DO MERCADO NEGRO',
  55: 'PONTO DE CONTROLE NEON'
});

export function getHouseExplanation(definition) {
  if (!definition) return null;
  const copy = HOUSE_COPY[definition.id];
  if (!copy) return null;
  return {
    title: copy[0],
    description: SHORT_HOUSE_DESCRIPTIONS[definition.id] ?? copy[1],
    continueLabel: 'PROSSEGUIR'
  };
}

export function isNeutralHouse(houseId) {
  return [1, 15, 30, 45, 55].includes(houseId);
}

export function getHouseDisplayName(houseId, fallback = 'AÇÃO DA CASA') {
  return HOUSE_COPY[houseId]?.[0] ?? HOUSE_NAMES[houseId] ?? fallback;
}

export function getInteractionDisplayName(id, fallback = 'INTERAÇÃO') {
  const names = {
    DUEL: 'DUELO',
    DUEL_FIRST: 'DUELO',
    AMBUSH: 'EMBOSCADA',
    NETWORK_INVASION: 'INVASÃO DE REDE',
    SABOTAGE: 'SABOTAGEM',
    ALLIANCE: 'ALIANÇA',
    KIDNAPPED: 'SEQUESTRO',
    HACK_HEIST: 'ROUBO DE HACK',
    BETRAYAL: 'TRAIÇÃO',
    JUDGEMENT: 'JULGAMENTO',
    SPEED_BATTLE: 'BATALHA RELÂMPAGO',
    SPEED_BATTLE_FIRST: 'BATALHA RELÂMPAGO',
    BET: 'APOSTA',
    AUCTION: 'LEILÃO',
    DOUBT: 'DÚVIDA',
    CATCH_UP: 'ALCANCE',
    DATA_TUNNEL: 'TÚNEL DE DADOS',
    DOUBLE_DICE: 'DADO DUPLO',
    POSITION_SWAP: 'TROCA DE POSIÇÃO',
    SPEED_NETWORK: 'REDE RELÂMPAGO',
    INTERCEPTAR: 'INTERCEPTAR',
    INTERCEPT_TARGET: 'ESCOLHA DE ALVO',
    FROZEN_ESCAPE: 'PROTOCOLO DE FUGA',
    VIRUS_INJECTION_ESCAPE: 'REMOÇÃO DE VÍRUS',
    VIRUS_INJECTION_CHALLENGE: 'DESAFIO DE VÍRUS',
    QUESTION: 'PERGUNTA',
    DEBUG: 'DEPURAÇÃO',
    BOOST: 'IMPULSO',
    TELEPORT: 'TELETRANSPORTE',
    HACK: 'HACK',
    STATUS: 'STATUS',
    EVENT: 'EVENTO GLOBAL',
    RANDOM: 'OCORRÊNCIA ALEATÓRIA',
    CHOICE: 'ESCOLHA',
    BOSS: 'PROTOCOLO CHEFE',
    FINISH: 'DESAFIO FINAL',
    POSITION: 'MOVIMENTO',
    MOVEMENT: 'MOVIMENTO',
    INTERACTION: 'INTERAÇÃO',
    FALLBACK: 'SISTEMA'
  };
  return names[id] ?? fallback;
}

export function getChoiceDisplayName(id, fallback = 'OPÇÃO') {
  const names = {
    SAFE: 'APOSTA SEGURA',
    SAFE_MODE: 'MODO SEGURO',
    HIGH_RISK: 'ALTO RISCO',
    OVERCLOCK: 'ARRISCAR',
    DOOR_A: 'PORTA A // MÉDIA',
    DOOR_B: 'PORTA B // DIFÍCIL',
    NORMAL: 'NORMAL // MÉDIA',
    MAXIMUM: 'MÁXIMO // DIFÍCIL',
    ALONE: 'RESPONDER SOZINHO',
    BETRAY: 'TRAIR',
    COOPERATE: 'COOPERAR',
    DOOR: 'PORTA',
    TRAP: 'ARMADILHA'
  };
  return names[id] ?? fallback;
}
