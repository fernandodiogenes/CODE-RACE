const RANDOM_ROULETTE_OUTCOMES = Object.freeze([
  { id: 'SURGE', weight: 2, effect: { type: 'movement', movement: 1 } },
  { id: 'BACKFLOW', weight: 1, effect: { type: 'movement', movement: -2 } },
  { id: 'HACK', weight: 1, effect: { type: 'hack', hack: 'TURBO' } },
  { id: 'CHALLENGE', weight: 1, effect: { type: 'challenge', category: 'debug' } },
  { id: 'GLOBAL_EVENT', weight: 1, effect: { type: 'event' } },
  { id: 'NOTHING', weight: 1, effect: { type: 'nothing' } }
]);

const entries = [
  ['SYSTEM ONLINE', 'START'],
  ['PRINT', 'QUESTION', { difficulty: 'easy', reward: 1 }],
  ['VARIABLE', 'QUESTION', { difficulty: 'easy', reward: 1 }],
  ['BOOST', 'BOOST', { movement: 2, activateDestination: false }],
  ['DEBUG', 'DEBUG', { difficulty: 'easy', reward: 2 }],
  ['DADO DUPLO', 'CHOICE', { choices: [
    { id: 'SAFE_MODE', name: 'SAFE MODE', effect: { type: 'nothing' } },
    { id: 'OVERCLOCK', name: 'ARRISCAR', effect: { type: 'secondary_dice' } }
  ], interaction: 'DOUBLE_DICE' }],
  ['QUIZ RELÂMPAGO', 'QUESTION', { difficulty: 'easy', timeLimit: 10, reward: 2 }],
  ['SYSTEM FAILURE', 'DEBUG', { difficulty: 'medium', reward: 1 }],
  ['VARIÁVEL MISTERIOSA', 'QUESTION', { difficulty: 'medium', reward: 2 }],
  ['DATA TUNNEL', 'DATA_TUNNEL', { fallbackMovement: 2, activateDestination: false }],
  ['OPEN PATH', 'BOOST', { movement: 1, activateDestination: false }],
  ['INVERSE CODE', 'QUESTION', { difficulty: 'medium', category: 'output', reward: 2 }],
  ['ILLEGAL TOOL', 'HACK', { hacks: ['TURBO', 'ESCUDO', 'INTERCEPTAR', 'OVERRIDE'], fullFallback: { type: 'movement', movement: 1 } }],
  ['THE IMPOSTOR', 'BINARY_CODE', { difficulty: 'medium', category: 'conditions', format: 'code_completion', reward: 2 }],
  ['CHECKPOINT ZERO', 'CHECKPOINT', { checkpoint: true }],
  ['CRITICAL BUG', 'MULTI_QUESTION', { category: 'debug', count: 2, scoring: [0, 1, 3], mode: 'CRITICAL_BUG' }],
  ['LOOP', 'QUESTION', { difficulty: 'easy', reward: 2 }],
  ['LOOP MALUCO', 'QUESTION', { difficulty: 'medium', category: 'logic', reward: 2 }],
  ['COUNTDOWN', 'QUESTION', { difficulty: 'medium', timeLimit: 15, reward: 2 }],
  ['HACK HEIST', 'HACK', { interaction: 'HACK_HEIST', difficulty: 'easy', fallbackMovement: 2 }],
  ['WHILE', 'QUESTION', { difficulty: 'easy', reward: 2 }],
  ['CODE OR LIE', 'CHOICE', { difficulty: 'medium' }],
  ['RISK DEBUG', 'DEBUG', { difficulty: 'hard', reward: 3 }],
  ['NETWORK INVASION', 'DUEL', { difficulty: 'medium', interaction: 'NETWORK_INVASION' }],
  ['SHIELD CACHE', 'HACK', { hack: 'ESCUDO', fullFallback: { type: 'movement', movement: 1 } }],
  ['GHOST BUG', 'DEBUG', { difficulty: 'medium', reward: 3 }],
  ['SYSTEM GLITCH', 'RANDOM', { outcomes: RANDOM_ROULETTE_OUTCOMES }],
  ["DON'T COPY", 'QUESTION', { difficulty: 'medium' }],
  ['ENCRYPTED CODE', 'MULTI_QUESTION', { difficulty: 'hard', count: 3, scoring: [0, 0, 1, 2], mode: 'ENCRYPTED_CODE', timeLimit: 60 }],
  ['CHECKPOINT CYBER ALLEY', 'CHECKPOINT', { checkpoint: true }],
  ['DUEL', 'DUEL', { allTeams: true, difficulty: 'medium', interaction: 'DUEL_FIRST' }],
  ['SPEED BATTLE', 'DUEL', { allTeams: true, difficulty: 'medium', interaction: 'SPEED_BATTLE_FIRST', timeLimit: 30 }],
  ['AMBUSH', 'AMBUSH', { difficulty: 'medium', penalty: -3, interaction: 'AMBUSH' }],
  ['FIREWALL', 'STATUS', { status: 'FIREWALL' }],
  ['POSITION SWAP', 'POSITION_SWAP', { fallbackMovement: 2, activateDestination: false }],
  ['BET', 'BET', { safe: { difficulty: 'medium' }, highRisk: { difficulty: 'hard' }, interaction: 'BET' }],
  ['AUCTION', 'BET', { auction: true, interaction: 'AUCTION' }],
  ['KIDNAPPED', 'KIDNAPPED', { status: 'FROZEN', turns: 1 }],
  ['ALLIANCE', 'ALLIANCE', { alliance: true, interaction: 'ALLIANCE' }],
  ['BETRAYAL', 'CHOICE', { interaction: 'BETRAYAL', choices: [
    { id: 'BETRAY', name: 'TRAIR', effect: { type: 'movement', movement: 2 } },
    { id: 'COOPERATE', name: 'COOPERAR', effect: { type: 'hack', hack: 'TURBO' } }
  ] }],
  ['CATCH UP', 'QUESTION', { difficulty: 'medium', category: 'logic', questionResolution: 'CATCH_UP', movement: 3 }],
  ['SABOTAGE', 'AMBUSH', { difficulty: 'hard', penalty: -2, sabotage: true, interaction: 'SABOTAGE' }],
  ['JUDGEMENT', 'JUDGEMENT', { difficulty: 'hard', interaction: 'JUDGEMENT' }],
  ['DOUBT', 'DOUBT', { difficulty: 'medium', interaction: 'DOUBT' }],
  ['CHECKPOINT BLACK MARKET', 'CHECKPOINT', { checkpoint: true }],
  ['GLOBAL EVENT', 'EVENT', { eventPool: ['NETWORK_OVERLOAD', 'BLACKOUT', 'NETWORK_TURBO', 'GLOBAL_VIRUS'] }],
  ['REVERSE GRAVITY', 'STATUS', { status: 'REVERSE_GRAVITY', turns: 1 }],
  ['INFINITE LOOP', 'QUESTION', { category: 'debug', questionResolution: 'INFINITE_LOOP', reward: 3, failureStatus: 'INFINITE_LOOP' }],
  ['DOOR OR TRAP', 'CHOICE', { questionChoices: [
    { id: 'DOOR_A', name: 'PORTA A // MÉDIA', effect: { difficulty: 'medium', reward: 2 } },
    { id: 'DOOR_B', name: 'PORTA B // DIFÍCIL', effect: { difficulty: 'hard', reward: 3 } }
  ] }],
  ['MAXIMUM RISK', 'CHOICE', { questionChoices: [
    { id: 'NORMAL', name: 'NORMAL // MÉDIA', effect: { difficulty: 'medium', reward: 2 } },
    { id: 'MAXIMUM', name: 'MÁXIMO // DIFÍCIL', effect: { difficulty: 'hard', reward: 3 } }
  ] }],
  ['VIRUS INJECTION', 'VIRUS_INJECTION', { difficulty: 'medium', category: 'debug', turns: 1 }],
  ["HACKER'S CACHE", 'HACK_REWARD', { difficulty: 'hard', category: 'debug', hack: 'OVERRIDE', fullFallback: { type: 'movement', movement: 1 } }],
  ['GLITCH', 'RANDOM', { outcomes: RANDOM_ROULETTE_OUTCOMES }],
  ['SPEED NETWORK', 'DUEL', { allTeams: true, difficulty: 'medium', interaction: 'SPEED_NETWORK_FIRST', timeLimit: 0 }],
  ['CHECKPOINT NEON', 'CHECKPOINT', { checkpoint: true }],
  ['BOSS PROTOCOL 01', 'BOSS', { difficulty: 'medium', category: 'conditions', questionId: 'py-condition-003', timeLimit: 30, questionResolution: 'BOSS_PROTOCOL_01', reward: 0, penalty: -1 }],
  ['BOSS PROTOCOL 02', 'BOSS', { difficulty: 'hard', category: 'debug', questionId: 'py-debug-011', timeLimit: 35, questionResolution: 'BOSS_PROTOCOL_02', reward: 0, penalty: -1, hackReward: 1 }],
  ['BOSS PROTOCOL 03', 'BOSS', { difficulty: 'medium', category: 'mixed', questionId: 'py-mixed-006', timeLimit: 30, questionResolution: 'BOSS_PROTOCOL_03', reward: 1 }],
  ['FINAL GATE', 'FINAL_GATE', { difficulty: 'hard', category: 'mixed', questionId: 'py-mixed-004', timeLimit: 35 }],
  ['CENTRAL NEXUS', 'FINISH', {
    difficulty: 'hard',
    category: 'output',
    timeLimit: 60,
    fallbackHouse: 58,
    protocolStages: [
      {
        number: 1,
        label: 'ENTRADA PRINCIPAL',
        challenge: 'Você invadiu a entrada principal da base do NEXUS. Agora precisa hackear o sistema do portão para conseguir entrar.',
        category: 'output'
      },
      {
        number: 2,
        label: 'SISTEMA DE SEGURANÇA',
        challenge: 'Você entrou na base. Agora precisa invadir o sistema de segurança para conseguir atravessar a instalação e chegar ao núcleo do NEXUS.',
        category: 'debug'
      },
      {
        number: 3,
        label: 'CENTRAL NEXUS',
        challenge: 'Você chegou ao CENTRAL NEXUS. A IA está no núcleo do sistema. Desative o NEXUS.',
        category: 'mixed'
      }
    ]
  }]
];

const QUESTION_TIME_LIMITS = Object.freeze({
  2: 25, 3: 25, 5: 25, 7: 25, 8: 25, 9: 25, 12: 25, 14: 25,
  16: 25, 17: 25, 18: 25, 19: 25, 20: 25, 21: 25, 23: 25,
  22: 18, 24: 25, 26: 25, 28: 25, 29: 25, 31: 25, 32: 25, 33: 25,
  36: 25, 37: 25, 38: 25, 39: 25, 41: 25, 42: 25, 43: 25, 44: 25,
  48: 25, 49: 25, 50: 25, 51: 25, 52: 25, 54: 25, 56: 30, 57: 35, 58: 30,
  59: 35, 60: 60, 81: 20, 83: 20, 84: 25, 85: 20, 86: 25, 87: 25
});

export const HOUSE_CATALOG = Object.freeze(entries.map(([name, type, config = {}], index) => Object.freeze({
  id: index + 1,
  type,
  name,
  description: `CASA ${String(index + 1).padStart(2, '0')} // ${name}`,
  config: Object.freeze({
    ...config,
    ...(QUESTION_TIME_LIMITS[index + 1] === undefined
      ? {}
      : { timeLimit: QUESTION_TIME_LIMITS[index + 1] })
  })
})));

export function getHouseDefinition(houseId) {
  if (!Number.isInteger(houseId) || houseId < 1 || houseId > HOUSE_CATALOG.length) return null;
  return HOUSE_CATALOG[houseId - 1];
}
