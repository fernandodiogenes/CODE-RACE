import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGameState, finishFinalWindow, resolveFinalChallenge, resolveHouse as resolveGameHouse } from './game-state.js';
import { getHouse, resolveDeferredRandomOutcome, resolveHouse, resolveInteraction } from './house-engine.js';
import {
  applyMovement, beginIntercept, canUseShield, getHackCount, getHackTypeCount, hasHack,
  addHackCount, advanceStatusDuration, applyStatus, getInterceptTargets, grantRandomHack,
  canOverrideAction, resolveIntercept, resolveShield, setHackCount, useOverride,
  useTurbo, transferHack, stealHack
} from './gameplay-actions.js';
import { setQuestionBank } from './question-engine.js';

const normalQuestionBank = JSON.parse(readFileSync(
  new URL('./question-banks/normal/question-bank.json', import.meta.url)
));
const easyQuestionBank = JSON.parse(readFileSync(
  new URL('./question-banks/easy/question-bank-easy.json', import.meta.url)
));

function createTeamState(hacks = 0) {
  return createGameState([{
    id: 'gang-a',
    name: 'GANGUE A',
    members: ['Jogador'],
    color: 0x4ee6e4,
    character: 'robot',
    houseId: 57,
    hacks
  }]);
}

test('gangues novas começam sem HACKs possuídos', () => {
  const state = createGameState([
    { id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 1 },
    { id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi', houseId: 1 }
  ]);

  for (const gang of state.teams) {
    assert.equal(getHackCount(gang), 0);
    for (const hack of ['TURBO', 'ESCUDO', 'INTERCEPTAR', 'OVERRIDE']) {
      assert.equal(hasHack(gang, hack), false);
    }
  }
});

test('correção numérica sincroniza inventário vazio, preenchido e limite máximo', () => {
  const emptyState = createTeamState(0);
  const emptyGang = emptyState.teams[0];
  emptyGang.ownedHacks = [];
  assert.equal(setHackCount(emptyState, emptyGang.id, 2), true);
  assert.deepEqual(emptyGang.ownedHacks, ['TURBO', 'TURBO']);
  assert.equal(emptyGang.hacks, 2);

  const filledState = createTeamState(2);
  const filledGang = filledState.teams[0];
  filledGang.ownedHacks = ['ESCUDO', 'OVERRIDE'];
  filledGang.hacks = 2;
  assert.equal(setHackCount(filledState, filledGang.id, 3), true);
  assert.deepEqual(filledGang.ownedHacks, ['ESCUDO', 'OVERRIDE', 'TURBO']);
  assert.equal(filledGang.hacks, 3);

  assert.equal(setHackCount(filledState, filledGang.id, 4), false);
  assert.deepEqual(filledGang.ownedHacks, ['ESCUDO', 'OVERRIDE', 'TURBO']);
  assert.equal(filledGang.hacks, 3);
  assert.equal(getHackCount(filledGang), 3);
});

test('ESCUDO cancela uma penalidade aplicável e consome apenas um ESCUDO', () => {
  const state = createGameState([{
    id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
    houseId: 10, hacks: 2, ownedHacks: ['ESCUDO', 'TURBO']
  }]);
  const penalty = { amount: -3, reason: 'GLOBAL_VIRUS' };

  assert.equal(getHackTypeCount(state.teams[0], 'ESCUDO'), 1);
  assert.equal(canUseShield(state, 'gang-a', penalty), true);
  assert.deepEqual(resolveShield(state, 'gang-a', penalty, true), {
    canceled: true, accepted: false, amount: 0
  });
  assert.deepEqual(state.teams[0].ownedHacks, ['TURBO']);
  assert.equal(state.teams[0].hacks, 1);
  assert.equal(state.hackUsedThisTurn, true);
});

test('recusar ESCUDO aplica a penalidade e preserva o inventário', () => {
  const state = createGameState([{
    id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
    houseId: 10, hacks: 1, ownedHacks: ['ESCUDO']
  }]);
  const decision = resolveShield(state, 'gang-a', { amount: -2, reason: 'AMBUSH' }, false);
  assert.equal(decision.canceled, false);
  assert.equal(decision.accepted, true);
  assert.equal(applyMovement({ state, teamId: 'gang-a', delta: decision.amount }).houseId, 8);
  assert.deepEqual(state.teams[0].ownedHacks, ['ESCUDO']);
  assert.equal(state.teams[0].hacks, 1);
  assert.equal(state.hackUsedThisTurn, false);
});

test('inventário vazio não bloqueia a aplicação normal de uma penalidade', () => {
  const state = createTeamState(0);
  state.teams[0].houseId = 12;
  const penalty = { amount: -1, reason: 'BOSS_PROTOCOL_01' };

  assert.equal(canUseShield(state, 'gang-a', penalty), false);
  const decision = resolveShield(state, 'gang-a', penalty, true);
  assert.equal(decision.canceled, false);
  assert.equal(decision.reason, 'UNAVAILABLE');
  assert.equal(applyMovement({ state, teamId: 'gang-a', delta: decision.amount }).houseId, 11);
  assert.equal(state.teams[0].hacks, 0);
});

test('ESCUDO não cancela vitória, desafio final ou condição essencial', () => {
  const state = createTeamState(1);
  state.teams[0].ownedHacks = ['ESCUDO'];
  state.teams[0].hacks = 1;
  for (const penalty of [
    { amount: -3, houseId: 60 },
    { amount: -1, finalChallenge: true },
    { amount: -1, victory: true },
    { amount: -1, essential: true },
    { amount: 1 }
  ]) {
    assert.equal(canUseShield(state, 'gang-a', penalty), false);
    assert.equal(resolveShield(state, 'gang-a', penalty, true).canceled, false);
  }
  assert.deepEqual(state.teams[0].ownedHacks, ['ESCUDO']);
  assert.equal(state.teams[0].hacks, 1);
});

test('ESCUDO não é consumido pelo VÍRUS GLOBAL durante TURBO nem OVERRIDE', () => {
  const state = createTeamState(2);
  const gang = state.teams[0];
  gang.houseId = 10;
  gang.ownedHacks = ['TURBO', 'ESCUDO'];
  gang.hacks = 2;
  assert.equal(useTurbo(state, gang.id).ok, true);
  assert.deepEqual(gang.ownedHacks, ['ESCUDO']);
  assert.equal(getHackTypeCount(gang, 'ESCUDO'), 1);

  const overrideState = createGameState([{
    id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
    houseId: 10, hacks: 2, ownedHacks: ['OVERRIDE', 'ESCUDO']
  }]);
  const action = { status: 'READY', type: 'QUESTION', houseId: 10, question: {} };
  assert.equal(useOverride(overrideState, 'gang-a', action), true);
  assert.deepEqual(overrideState.teams[0].ownedHacks, ['ESCUDO']);
  assert.equal(overrideState.teams[0].hacks, 1);
});

test('OVERRIDE só cancela efeitos pendentes e não pode ser repetido nem usado em bloqueios oficiais', () => {
  const eligibleActions = [
    { status: 'READY', type: 'QUESTION', houseId: 10 },
    { status: 'CHOICE', type: 'CHOICE', houseId: 10 },
    { status: 'PENDING_RANDOM', type: 'RANDOM', houseId: 10 }
  ];
  for (const action of eligibleActions) assert.equal(canOverrideAction(action), true);

  const protectedActions = [
    { status: 'RESOLVED', type: 'QUESTION', houseId: 10 },
    { status: 'FALLBACK', type: 'FALLBACK', houseId: 10 },
    { status: 'FINISH', type: 'FINISH', houseId: 60 },
    { status: 'READY', type: 'FINISH', houseId: 60, questionResolution: 'FINAL_CHALLENGE' },
    { status: 'READY', type: 'QUESTION', houseId: 10, finalChallenge: true },
    { status: 'READY', type: 'QUESTION', houseId: 10, victory: true }
  ];
  for (const action of protectedActions) assert.equal(canOverrideAction(action), false);

  const state = createGameState([{
    id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
    houseId: 10, hacks: 1, ownedHacks: ['OVERRIDE']
  }]);
  const resolvedAction = { status: 'RESOLVED', type: 'BOOST', houseId: 10 };
  assert.equal(useOverride(state, 'gang-a', resolvedAction), false);
  assert.deepEqual(state.teams[0].ownedHacks, ['OVERRIDE']);
  assert.equal(state.teams[0].hacks, 1);

  const pendingAction = { status: 'READY', type: 'QUESTION', houseId: 10, question: {} };
  assert.equal(useOverride(state, 'gang-a', pendingAction), true);
  assert.equal(pendingAction.status, 'OVERRIDDEN');
  assert.deepEqual(state.teams[0].ownedHacks, []);
  assert.equal(state.teams[0].hacks, 0);
  assert.equal(useOverride(state, 'gang-a', pendingAction), false);
  assert.deepEqual(state.teams[0].ownedHacks, []);

  const blackoutState = createGameState([{
    id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
    houseId: 10, hacks: 1, ownedHacks: ['OVERRIDE']
  }]);
  blackoutState.activeEvent = 'BLACKOUT';
  assert.equal(useOverride(
    blackoutState, 'gang-a', { status: 'READY', type: 'QUESTION', houseId: 10 }
  ), false);
  assert.deepEqual(blackoutState.teams[0].ownedHacks, ['OVERRIDE']);
});

test('alvo erra e INTERCEPTAR transfere um TURBO; a defesa do VÍRUS GLOBAL vai ao alvo', () => {
  const state = createGameState([
    {
      id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
      houseId: 10, hacks: 1, ownedHacks: ['INTERCEPTAR']
    },
    {
      id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
      houseId: 12, hacks: 2, ownedHacks: ['TURBO', 'ESCUDO']
    }
  ]);

  assert.equal(beginIntercept(state, 'gang-a', 'gang-b').ok, true);
  const intercepted = resolveIntercept(state, 'gang-a', 'gang-b', false);
  assert.equal(intercepted.stolen, true);
  assert.deepEqual(state.teams[1].ownedHacks, ['ESCUDO']);
  assert.deepEqual(state.teams[0].ownedHacks, ['TURBO']);

  const virusPenalty = { amount: -3, reason: 'GLOBAL_VIRUS', event: true, interaction: true };
  assert.equal(canUseShield(state, 'gang-b', virusPenalty), true);
  assert.equal(resolveShield(state, 'gang-b', virusPenalty, true).canceled, true);
  assert.deepEqual(state.teams[1].ownedHacks, []);
  assert.equal(state.teams[1].hacks, 0);
  assert.equal(state.teams[1].houseId, 12);
  assert.equal(state.teams[0].houseId, 10);
  assert.equal(state.hackUsedThisTurn, true);
});

test('INTERCEPTAR transfere o tipo de HACK realmente possuído pelo alvo', () => {
  for (const hack of ['ESCUDO', 'INTERCEPTAR', 'OVERRIDE']) {
    const state = createGameState([
      {
        id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
        houseId: 10, hacks: 1, ownedHacks: ['INTERCEPTAR']
      },
      {
        id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
        houseId: 12, hacks: 1, ownedHacks: [hack]
      }
    ]);

    assert.equal(beginIntercept(state, 'gang-a', 'gang-b', `intercept-${hack}`).ok, true);
    const intercepted = resolveIntercept(state, 'gang-a', 'gang-b', false, `intercept-${hack}`);
    assert.deepEqual(intercepted, { stolen: true, amount: 1, hack });
    assert.deepEqual(state.teams[0].ownedHacks, [hack]);
    assert.equal(state.teams[0].hacks, 1);
    assert.deepEqual(state.teams[1].ownedHacks, []);
    assert.equal(state.teams[1].hacks, 0);
  }
});

test('INTERCEPTAR sem alvo com HACK não consome o item nem cria alvo válido', () => {
  const state = createGameState([
    {
      id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
      houseId: 10, hacks: 1, ownedHacks: ['INTERCEPTAR']
    },
    {
      id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
      houseId: 12, hacks: 0, ownedHacks: []
    }
  ]);

  assert.deepEqual(getInterceptTargets(state, 'gang-a'), []);
  assert.deepEqual(beginIntercept(state, 'gang-a', 'gang-b'), {
    ok: false, reason: 'INVALID_TARGET'
  });
  assert.deepEqual(state.teams[0].ownedHacks, ['INTERCEPTAR']);
  assert.equal(state.teams[0].hacks, 1);
  assert.deepEqual(state.teams[1].ownedHacks, []);
});

test('INTERCEPTAR bem-sucedido mantém o HACK do alvo e não consome seu ESCUDO', () => {
  const state = createGameState([
    {
      id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
      houseId: 10, hacks: 1, ownedHacks: ['INTERCEPTAR']
    },
    {
      id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
      houseId: 12, hacks: 2, ownedHacks: ['ESCUDO', 'TURBO']
    }
  ]);

  assert.equal(beginIntercept(state, 'gang-a', 'gang-b').ok, true);
  assert.equal(resolveIntercept(state, 'gang-a', 'gang-b', true).stolen, false);
  assert.deepEqual(state.teams[1].ownedHacks, ['ESCUDO', 'TURBO']);
  assert.equal(getHackTypeCount(state.teams[1], 'ESCUDO'), 1);
  assert.equal(state.teams[1].hacks, 2);
  assert.deepEqual(state.teams[0].ownedHacks, []);
});

test('INTERCEPTAR bloqueado pelo FIREWALL não consome nem transfere HACKs', () => {
  const state = createGameState([
    {
      id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
      houseId: 10, hacks: 1, ownedHacks: ['INTERCEPTAR']
    },
    {
      id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
      houseId: 12, hacks: 1, ownedHacks: ['OVERRIDE'], statuses: { FIREWALL: { turns: 1 } }
    }
  ]);
  const beforeAttacker = [...state.teams[0].ownedHacks];
  const beforeTarget = [...state.teams[1].ownedHacks];

  const started = beginIntercept(state, 'gang-a', 'gang-b', 'intercept-firewall');
  assert.deepEqual(started, {
    ok: true, blocked: true, attackerId: 'gang-a', targetId: 'gang-b'
  });
  assert.deepEqual(state.teams[0].ownedHacks, beforeAttacker);
  assert.deepEqual(state.teams[1].ownedHacks, beforeTarget);
  assert.deepEqual(resolveIntercept(state, 'gang-a', 'gang-b', false, 'intercept-firewall'), {
    stolen: false, reason: 'INTERACTION_ALREADY_RESOLVED'
  });
  assert.deepEqual(state.teams[0].ownedHacks, beforeAttacker);
  assert.deepEqual(state.teams[1].ownedHacks, beforeTarget);
});

test('FIREWALL protege contra INTERCEPTAR até o fim do próximo turno completo', () => {
  const state = createGameState([
    { id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 10 },
    { id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi', houseId: 12 }
  ]);
  state.turn = 4;

  assert.equal(applyStatus(state, 'gang-b', 'FIREWALL', 1), true);
  const target = state.teams[1];
  advanceStatusDuration(target, state.turn);
  assert.equal(target.statuses.FIREWALL.turns, 1);
  assert.equal(resolveIntercept(state, 'gang-a', 'gang-b', false).blocked, true);
  advanceStatusDuration(target, state.turn + 1);
  assert.equal(target.statuses.FIREWALL, undefined);
  assert.equal(resolveIntercept(state, 'gang-a', 'gang-b', false).blocked, undefined);
});

test('INTERCEPTAR não duplica transferência ao resolver a mesma interação duas vezes', () => {
  const state = createGameState([
    {
      id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
      houseId: 10, hacks: 1, ownedHacks: ['INTERCEPTAR']
    },
    {
      id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
      houseId: 12, hacks: 1, ownedHacks: ['OVERRIDE']
    }
  ]);

  assert.equal(beginIntercept(state, 'gang-a', 'gang-b', 'intercept-once').ok, true);
  assert.equal(resolveIntercept(state, 'gang-a', 'gang-b', false, 'intercept-once').stolen, true);
  assert.deepEqual(resolveIntercept(state, 'gang-a', 'gang-b', false, 'intercept-once'), {
    stolen: false, reason: 'INTERACTION_ALREADY_RESOLVED'
  });
  assert.deepEqual(state.teams[0].ownedHacks, ['OVERRIDE']);
  assert.equal(state.teams[0].hacks, 1);
  assert.deepEqual(state.teams[1].ownedHacks, []);
  assert.equal(state.teams[1].hacks, 0);
});

test('INTERCEPTAR no limite abre espaço ao consumir o HACK usado', () => {
  const state = createGameState([
    {
      id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
      houseId: 10, hacks: 3, ownedHacks: ['INTERCEPTAR', 'TURBO', 'ESCUDO']
    },
    {
      id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
      houseId: 12, hacks: 1, ownedHacks: ['OVERRIDE']
    }
  ]);

  assert.equal(beginIntercept(state, 'gang-a', 'gang-b', 'intercept-at-capacity').ok, true);
  assert.equal(getHackCount(state.teams[0]), 2);
  assert.equal(resolveIntercept(state, 'gang-a', 'gang-b', false, 'intercept-at-capacity').stolen, true);
  assert.deepEqual(state.teams[0].ownedHacks, ['TURBO', 'ESCUDO', 'OVERRIDE']);
  assert.equal(state.teams[0].hacks, 3);
  assert.deepEqual(state.teams[1].ownedHacks, []);
});

test('penalidade de EMBOSCADA é oferecida à gangue alvo e pode ser recusada', () => {
  const state = createGameState([
    {
      id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
      houseId: 10, hacks: 0, ownedHacks: []
    },
    {
      id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
      houseId: 12, hacks: 2, ownedHacks: ['ESCUDO', 'TURBO']
    }
  ]);
  const result = resolveInteraction(state, {
    type: 'AMBUSH',
    teamId: 'gang-a',
    targetId: 'gang-b',
    respondentId: 'gang-b',
    participantIds: ['gang-b'],
    requireResponses: true
  }, {
    responses: [{ teamId: 'gang-b', result: 'wrong', order: 1 }],
    deferPenalties: true
  });
  const penalty = result.penalties[0];
  assert.equal(penalty.teamId, 'gang-b');
  assert.equal(penalty.amount, -3);
  assert.equal(penalty.interaction, true);
  assert.equal(canUseShield(state, penalty.teamId, penalty), true);
  assert.equal(resolveShield(state, penalty.teamId, penalty, false).canceled, false);
  assert.equal(applyMovement({ state, teamId: penalty.teamId, delta: penalty.amount }).houseId, 9);
  assert.deepEqual(state.teams[1].ownedHacks, ['ESCUDO', 'TURBO']);
});

test('duas penalidades distintas não reutilizam um ESCUDO já gasto no turno', () => {
  const state = createTeamState(2);
  state.teams[0].houseId = 10;
  state.teams[0].ownedHacks = ['ESCUDO', 'ESCUDO'];
  state.teams[0].hacks = 2;
  const first = { amount: -1, reason: 'DUEL', interaction: true };
  const second = { amount: -3, reason: 'GLOBAL_VIRUS', interaction: true };

  assert.equal(resolveShield(state, 'gang-a', first, true).canceled, true);
  assert.equal(canUseShield(state, 'gang-a', second), false);
  const secondDecision = resolveShield(state, 'gang-a', second, true);
  assert.equal(secondDecision.canceled, false);
  assert.equal(secondDecision.amount, -3);
  assert.equal(applyMovement({ state, teamId: 'gang-a', delta: secondDecision.amount }).houseId, 7);
  assert.deepEqual(state.teams[0].ownedHacks, ['ESCUDO']);
  assert.equal(state.teams[0].hacks, 1);
});

test('Casa 57 concede exatamente um HACK até o limite de três', () => {
  setQuestionBank(normalQuestionBank);
  for (const [initial, expected] of [[0, 1], [1, 2], [2, 3], [3, 3]]) {
    const state = createTeamState(initial);
    const action = resolveHouse({ state, team: state.teams[0], houseId: 57 });
    assert.equal(action.question.id, 'py-debug-011');
    assert.equal(action.timeLimit, 35);
    assert.equal(addHackCount(state, 'gang-a', action.config.hackReward), expected === initial ? 0 : 1);
    assert.equal(getHackCount(state.teams[0]), expected);
  }
});

test('Casa 57 registra o tipo recebido sem confundir estoque com catálogo', () => {
  const state = createTeamState(0);
  const reward = grantRandomHack(state, 'gang-a', () => 0.75);
  assert.equal(reward.hack, 'OVERRIDE');
  assert.equal(reward.added, true);
  assert.deepEqual(state.teams[0].ownedHacks, ['OVERRIDE']);
  assert.equal(hasHack(state.teams[0], 'TURBO'), false);
  assert.equal(hasHack(state.teams[0], 'OVERRIDE'), true);
});

test('TURBO válido avança duas casas, consome uma vez e mantém inventário sincronizado', () => {
  const state = createTeamState(2);
  const gang = state.teams[0];
  gang.houseId = 10;
  gang.ownedHacks = ['TURBO', 'ESCUDO'];
  gang.hacks = 2;
  const startingInventory = [...gang.ownedHacks];

  const result = useTurbo(state, gang.id);

  assert.equal(result.ok, true);
  assert.equal(result.houseId, 12);
  assert.equal(result.activateDestination, false);
  assert.equal(result.reason, 'HACK_TURBO');
  assert.equal(gang.houseId - 10, 2);
  assert.deepEqual(gang.ownedHacks, ['ESCUDO']);
  assert.equal(gang.hacks, 1);
  assert.equal(getHackCount(gang), 1);
  assert.equal(state.hackUsedThisTurn, true);
  assert.equal(state.phase, 'FINALIZING');
  assert.deepEqual(startingInventory, ['TURBO', 'ESCUDO']);
  assert.equal(state.action, null);

  const duplicateUse = useTurbo(state, gang.id);
  assert.equal(duplicateUse.ok, false);
  assert.equal(gang.houseId, 12);
  assert.deepEqual(gang.ownedHacks, ['ESCUDO']);
  assert.equal(gang.hacks, 1);
});

test('TURBO indisponível não move nem consome o inventário', () => {
  const blockedStates = [
    ['inventário vazio', state => { state.teams[0].ownedHacks = []; state.teams[0].hacks = 0; }],
    ['fase não permitida', state => { state.phase = 'ROLLING'; }],
    ['HACK já usado no turno', state => { state.hackUsedThisTurn = true; }],
    ['partida pausada', state => { state.paused = true; }],
    ['partida encerrada', state => { state.finished = true; }],
    ['gangue finalista', state => { state.teams[0].finalist = true; }],
    ['apagão ativo', state => { state.activeEvent = 'BLACKOUT'; }]
  ];

  for (const [reason, block] of blockedStates) {
    const state = createTeamState(1);
    const gang = state.teams[0];
    gang.houseId = 10;
    gang.ownedHacks = ['TURBO'];
    gang.hacks = 1;
    block(state);

    const previousPosition = gang.houseId;
    const previousInventory = [...gang.ownedHacks];
    const previousPhase = state.phase;
    const result = useTurbo(state, gang.id);

    assert.equal(result.ok, false, reason);
    assert.equal(gang.houseId, previousPosition, reason);
    assert.deepEqual(gang.ownedHacks, previousInventory, reason);
    assert.equal(gang.hacks, previousInventory.length, reason);
    assert.equal(state.phase, previousPhase, reason);
  }
});

test('TURBO respeita o limite da Casa 60 sem ativar casas intermediárias', () => {
  const state = createTeamState(1);
  const gang = state.teams[0];
  gang.ownedHacks = ['TURBO'];
  gang.hacks = 1;
  gang.houseId = 59;

  const result = useTurbo(state, gang.id);

  assert.equal(result.ok, true);
  assert.equal(result.houseId, 60);
  assert.equal(gang.houseId, 60);
  assert.equal(result.activateDestination, false);
  assert.equal(state.usedQuestionIds.length, 0);
  assert.equal(state.action, null);
  assert.equal(gang.hacks, 0);
  assert.deepEqual(gang.ownedHacks, []);
});

test('transferir ou roubar TURBO atualiza ownedHacks e hacks juntos', () => {
  for (const transfer of [transferHack, stealHack]) {
    const state = createGameState([
      {
        id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot',
        houseId: 1, hacks: 1, ownedHacks: ['TURBO']
      },
      {
        id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi',
        houseId: 1, hacks: 0, ownedHacks: []
      }
    ]);

    const result = transfer(state, 'gang-a', 'gang-b');

    assert.equal(result.transferred ?? result.received, true);
    assert.deepEqual(state.teams[0].ownedHacks, []);
    assert.equal(state.teams[0].hacks, 0);
    assert.deepEqual(state.teams[1].ownedHacks, ['TURBO']);
    assert.equal(state.teams[1].hacks, 1);
    assert.equal(getHackCount(state.teams[1]), 1);
    assert.equal(hasHack(state.teams[1], 'TURBO'), true);
  }
});

test('Casas 56 a 60 selecionam perguntas distintas do banco', () => {
  setQuestionBank(normalQuestionBank);
  const state = createTeamState(0);
  const selected = [];
  const positions = [
    [56, 56],
    [57, 57],
    [58, 58],
    [59, 59],
    [60, 60]
  ];
  state.finalPortalUnlockedTeamIds = ['gang-a'];
  for (const [houseId, position] of positions) {
    state.teams[0].houseId = position;
    const action = resolveHouse({ state, team: state.teams[0], houseId });
    selected.push(action.question.id);
  }
  assert.equal(selected[0], 'py-condition-003');
  assert.equal(selected[1], 'py-debug-011');
  assert.equal(selected[2], 'py-mixed-006');
  assert.equal(selected[3], 'py-mixed-004');
  assert.equal(new Set(selected).size, selected.length);
});

test('Casa 60 executa três etapas com perguntas inéditas e registra a vitória', () => {
  setQuestionBank(normalQuestionBank);
  const state = createGameState([{
    id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 60
  }]);
  state.finalPortalUnlockedTeamIds = ['gang-a'];
  const selected = [];
  for (let stage = 1; stage <= 3; stage += 1) {
    const action = resolveGameHouse(state, 60);
    assert.equal(action.status, 'READY');
    assert.equal(action.finalProtocolStage, stage);
    selected.push(action.question.id);
    const result = resolveFinalChallenge(state, 'gang-a', { correct: true }, stage);
    assert.equal(result.ok, true);
    if (stage < 3) assert.equal(result.nextStage, stage + 1);
  }
  assert.equal(new Set(selected).size, 3);
  assert.equal(state.finalRanking[0].teamId, 'gang-a');
  assert.equal(state.teams[0].finalist, true);
  assert.equal(state.winner, 'gang-a');
});

test('janela final aguarda a classificação completa para encerrar a partida', () => {
  setQuestionBank(normalQuestionBank);
  const state = createGameState([
    { id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 60 },
    { id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi', houseId: 60 }
  ]);
  state.finalPortalUnlockedTeamIds = ['gang-a', 'gang-b'];

  for (let stage = 1; stage <= 3; stage += 1) {
    resolveGameHouse(state, 60);
    assert.equal(resolveFinalChallenge(state, 'gang-a', { correct: true }).ok, true);
  }

  assert.deepEqual(state.finalRanking.map(entry => entry.teamId), ['gang-a']);
  assert.equal(state.teams[0].finalist, true);
  assert.equal(state.teams[1].finalist, false);
  assert.equal(finishFinalWindow(state), false);
  assert.equal(state.finished, false);
  assert.equal(state.finalWindow.active, true);

  state.currentTeamIndex = 1;
  for (let stage = 1; stage <= 3; stage += 1) {
    const action = resolveGameHouse(state, 60);
    assert.equal(action.finalProtocolStage, stage);
    assert.equal(resolveFinalChallenge(state, 'gang-b', { correct: true }).ok, true);
  }

  assert.deepEqual(state.finalRanking.map(entry => entry.teamId), ['gang-a', 'gang-b']);
  assert.equal(state.finished, true);
});

test('Casa 60 não reutiliza perguntas entre gangues', () => {
  setQuestionBank(normalQuestionBank);
  const state = createGameState([
    { id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 60 },
    { id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi', houseId: 60 }
  ]);
  state.finalPortalUnlockedTeamIds = ['gang-a', 'gang-b'];
  const first = resolveHouse({ state, team: state.teams[0], houseId: 60 });
  const second = resolveHouse({ state, team: state.teams[1], houseId: 60 });
  assert.notEqual(first.question.id, second.question.id);
  assert.ok(state.usedQuestionIds.includes(first.question.id));
  assert.ok(state.usedQuestionIds.includes(second.question.id));
});

test('progresso da Casa 60 é reiniciado por gangue após falha na terceira etapa', () => {
  setQuestionBank(easyQuestionBank, 'easy');
  const state = createGameState([
    { id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 60 },
    { id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi', houseId: 60 }
  ]);
  const selected = [];

  for (let stage = 1; stage <= 3; stage += 1) {
    const action = resolveGameHouse(state, 60);
    assert.equal(action.status, 'READY');
    assert.equal(action.finalProtocolStage, stage);
    selected.push(action.question.id);
    const result = resolveFinalChallenge(state, 'gang-a', { correct: stage < 3 });
    assert.equal(result.ok, true);
  }
  assert.equal(state.finalProtocol.status, 'FAILED');
  assert.equal(state.finalProtocol.stage, 3);
  assert.equal(state.finalProtocol.teamId, 'gang-a');

  state.currentTeamIndex = 1;
  state.phase = 'RESOLVING_HOUSE';
  for (let stage = 1; stage <= 3; stage += 1) {
    const action = resolveGameHouse(state, 60);
    assert.equal(action.status, 'READY');
    assert.equal(action.finalProtocolStage, stage);
    assert.equal(state.finalChallenge.stage, stage);
    selected.push(action.question.id);
    const result = resolveFinalChallenge(state, 'gang-b', { correct: true });
    assert.equal(result.ok, true);
  }

  assert.equal(new Set(selected).size, 6);
  assert.equal(state.finalRanking[0].teamId, 'gang-b');
  assert.equal(state.finalProtocol.status, 'PASSED');
  assert.equal(state.finalProtocol.teamId, 'gang-b');
});

test('falha em qualquer etapa da Casa 60 retorna à Casa 58 sem ativá-la', () => {
  setQuestionBank(normalQuestionBank);
  for (let stage = 1; stage <= 3; stage += 1) {
    const state = createGameState([{ id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 60 }]);
    state.finalPortalUnlockedTeamIds = ['gang-a'];
    state.finalProtocol = { status: 'ACTIVE', stage, totalStages: 3, teamId: 'gang-a' };
    const action = resolveGameHouse(state, 60);
    assert.equal(action.finalProtocolStage, stage);
    const result = resolveFinalChallenge(state, 'gang-a', { correct: false });
    assert.equal(result.correct, false);
    state.teams[0].houseId = 58;
    state.phase = 'PREPARING';
    assert.equal(state.finalProtocol.status, 'FAILED');
    assert.equal(state.finalProtocol.stage, stage);
    assert.equal(state.teams[0].houseId, 58);
  }
});

test('Casa 57 deduplica a pergunta entre gangues na mesma partida', () => {
  setQuestionBank(normalQuestionBank);
  const state = createGameState([
    { id: 'gang-a', name: 'GANGUE A', members: ['A'], color: 1, character: 'robot', houseId: 57, hacks: 0 },
    { id: 'gang-b', name: 'GANGUE B', members: ['B'], color: 2, character: 'cauboi', houseId: 57, hacks: 0 }
  ]);
  const first = resolveHouse({ state, team: state.teams[0], houseId: 57 });
  const second = resolveHouse({ state, team: state.teams[1], houseId: 57 });
  assert.equal(first.question.id, 'py-debug-011');
  assert.notEqual(second.question.id, first.question.id);
  assert.ok(state.usedQuestionIds.includes(first.question.id));
  assert.ok(state.usedQuestionIds.includes(second.question.id));
});

test('Casa 57 não repete quando o banco compatível foi esgotado', () => {
  setQuestionBank(normalQuestionBank);
  const state = createTeamState(0);
  const compatible = normalQuestionBank.filter(question =>
    question.difficulty === getHouse(57).config.difficulty &&
    question.category === getHouse(57).config.category
  );
  assert.equal(compatible.length, 10);
  assert.equal(new Set(compatible.map(question => question.id)).size, compatible.length);
  assert.ok(compatible.every(question => question.options.length === 4 && typeof question.explanation === 'string'));

  const selected = [];
  for (let index = 0; index < compatible.length; index += 1) {
    const action = resolveHouse({ state, team: state.teams[0], houseId: 57 });
    assert.equal(action.status, 'READY');
    selected.push(action.question.id);
  }
  assert.equal(new Set(selected).size, compatible.length);
  assert.deepEqual(new Set(selected), new Set(compatible.map(question => question.id)));

  const exhausted = resolveHouse({ state, team: state.teams[0], houseId: 57 });
  assert.equal(exhausted.status, 'FALLBACK');
  assert.equal(exhausted.question, undefined);
  assert.equal(state.usedQuestionIds.length, compatible.length);
});

test('banco EASY tem pools HARD distintos e suficientes para oito tentativas completas na Casa 60', () => {
  setQuestionBank(easyQuestionBank, 'easy');
  const stagePools = [
    { categories: ['INTRODUCAO_PRINT', 'PREVISAO_SAIDA'], minimum: 8 },
    { categories: ['DEBUG'], minimum: 8 },
    { categories: ['DESAFIO_MISTO'], minimum: 8 }
  ].map(stage => easyQuestionBank.filter(question =>
    question.difficulty === 'hard' && stage.categories.includes(question.category)
  ));
  assert.deepEqual(stagePools.map(pool => pool.length), [16, 15, 16]);
  for (const pool of stagePools) {
    assert.ok(pool.length >= 8);
    assert.equal(new Set(pool.map(question => question.id)).size, pool.length);
  }

  const state = createGameState(Array.from({ length: 8 }, (_, index) => ({
    id: `gang-${index + 1}`,
    name: `GANGUE ${index + 1}`,
    members: [`Jogador ${index + 1}`],
    color: index + 1,
    character: 'robot',
    houseId: 60
  })));
  const selected = [];
  for (let gangIndex = 0; gangIndex < state.teams.length; gangIndex += 1) {
    state.currentTeamIndex = gangIndex;
    state.phase = 'RESOLVING_HOUSE';
    for (let stage = 1; stage <= 3; stage += 1) {
      const action = resolveGameHouse(state, 60);
      assert.equal(action.status, 'READY');
      assert.equal(action.finalProtocolStage, stage);
      selected.push(action.question.id);
      const result = resolveFinalChallenge(state, state.teams[gangIndex].id, { correct: true });
      assert.equal(result.ok, true);
    }
  }
  assert.equal(selected.length, 24);
  assert.equal(new Set(selected).size, 24);
  assert.equal(state.usedQuestionIds.length, 24);
});

test('Casa 57 EASY seleciona cinco perguntas diferentes antes de esgotar o banco', () => {
  setQuestionBank(easyQuestionBank, 'easy');
  const state = createTeamState(0);
  const selected = [];
  for (let index = 0; index < 5; index += 1) {
    const action = resolveHouse({ state, team: state.teams[0], houseId: 57 });
    assert.equal(action.status, 'READY');
    selected.push(action.question.id);
  }
  assert.equal(new Set(selected).size, 5);
  assert.equal(state.usedQuestionIds.length, 5);
});

test('Casa 59 é o desafio difícil penúltimo e não fica bloqueada', () => {
  setQuestionBank(normalQuestionBank);
  const state = createTeamState(0);
  state.teams[0].houseId = 59;
  const action = resolveHouse({ state, team: state.teams[0], houseId: 59 });
  assert.equal(action.type, 'FINAL_GATE');
  assert.equal(action.questionResolution, 'FINAL_GATE');
  assert.equal(action.question.id, 'py-mixed-004');
  assert.equal(action.timeLimit, 35);
});

test('roleta das Casas 27 e 53 concede um HACK ao resultado HACK', () => {
  setQuestionBank(normalQuestionBank);
  for (const houseId of [27, 53]) {
    const state = createTeamState(0);
    state.teams[0].houseId = houseId;
    const pending = resolveHouse({ state, team: state.teams[0], houseId, random: () => 0.5 });
    assert.equal(pending.status, 'PENDING_RANDOM');
    const resolved = resolveDeferredRandomOutcome({
      state,
      team: state.teams[0],
      houseId,
      outcome: pending.randomOutcome,
      random: () => 0.5
    });
    assert.equal(resolved.randomOutcome.id, 'HACK');
    assert.equal(getHackCount(state.teams[0]), 1);
    assert.deepEqual(state.teams[0].ownedHacks, ['TURBO']);
    assert.equal(state.teams[0].hacks, 1);
  }
});

test('catálogo mantém IDs e tempos dos protocolos finais', () => {
  assert.equal(getHouse(56).config.questionId, 'py-condition-003');
  assert.equal(getHouse(57).config.questionId, 'py-debug-011');
  assert.equal(getHouse(58).config.questionId, 'py-mixed-006');
  assert.equal(getHouse(59).config.questionId, 'py-mixed-004');
  assert.equal(getHouse(60).config.protocolStages.length, 3);
  assert.deepEqual(getHouse(60).config.protocolStages.map(stage => stage.category), ['output', 'debug', 'mixed']);
  assert.equal(getHouse(57).config.timeLimit, 35);
});
