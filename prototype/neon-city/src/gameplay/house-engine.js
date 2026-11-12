import { getHouseDefinition } from './house-catalog.js';
import { registerQuestionUse, selectQuestion } from './question-engine.js';
import {
  activateEvent, applyMovement, applyStatus, chooseWeightedOutcome, getAdversaries, getTeamAhead,
  EVENTS, HACKS, getQuestionMovementBonus, getTeamsAhead, grantHack, isProtectedByFirewall,
  randomInt, swapTeamPositions, stealHack
} from './gameplay-actions.js';

const HOUSE_HANDLERS = Object.freeze({
  START: ({ definition }) => ({
    status: 'RESOLVED',
    message: `${definition.name} // CONEXÃO ESTABELECIDA.`
  }),
  QUESTION: ({ state, definition, team }) => {
    const selection = selectQuestion({
      state,
      difficulty: definition.config.difficulty,
      category: definition.config.category,
      format: definition.config.format,
      preferredQuestionId: definition.config.questionId
    });
    if (!selection.question) {
      return fallback(definition, 'NENHUMA PERGUNTA DISPONÍVEL // CONTINUE A PARTIDA');
    }
    registerQuestionUse(state, selection.question.id);
    return {
      status: 'READY',
      questionResolution: 'NORMAL',
      question: selection.question,
      questionId: selection.question.id,
      timeLimit: definition.config.timeLimit ?? null,
      questionResolution: definition.config.questionResolution ?? 'NORMAL'
    };
  },
  DEBUG: ({ state, definition, team }) => questionAction(state, definition, team, definition.type, 'NORMAL'),
  BINARY_CODE: ({ state, definition, team, random = Math.random }) => binaryCodeAction(state, definition, team, random),
  MULTI_QUESTION: ({ state, definition, team }) => multiQuestionAction(state, definition, team),
  BOSS: ({ state, definition, team }) => questionAction(
    state,
    definition,
    team,
    definition.name,
    definition.config.questionResolution ?? 'SPECIAL'
  ),
  FINAL_GATE: ({ state, definition, team }) => {
    return questionAction(state, definition, team, 'FINAL GATE', 'FINAL_GATE');
  },
  BOOST: ({ state, definition, team }) => {
    const amount = definition.config.movement ?? definition.config.reward ?? 1;
    applyMovement({ state, teamId: team.id, delta: amount, reason: 'BOOST', activateDestination: false });
    return { status: 'RESOLVED', message: `ROTA LIBERADA // +${amount} CASA(S)`, movement: amount };
  },
  MOVEMENT: ({ state, definition, team }) => {
    const amount = definition.config.movement ?? 1;
    applyMovement({ state, teamId: team.id, delta: amount, reason: 'MOVEMENT', activateDestination: false });
    return { status: 'RESOLVED', message: `MOVIMENTO AUTÔNOMO // ${amount} CASA(S)`, movement: amount };
  },
  TELEPORT: ({ state, definition, team }) => {
    const destination = getTeleportDestination(team.houseId, definition.config);
    if (destination === null) return fallback(definition, 'DESTINO INVÁLIDO // POSIÇÃO MANTIDA');
    const result = applyMovement({
      state,
      teamId: team.id,
      delta: destination - team.houseId,
      reason: 'TELEPORT',
      activateDestination: false
    });
    return result.ok
      ? { status: 'RESOLVED', message: `TELEPORTE EXECUTADO // CASA ${destination}`, destination, movement: destination - team.houseId }
      : fallback(definition, 'TELEPORTE INDISPONÍVEL // CONTINUE A PARTIDA');
  },
  POSITION: ({ state, definition, team }) => {
    const amount = definition.config.fallbackMovement ?? 0;
    applyMovement({ state, teamId: team.id, delta: amount, reason: 'POSITION', activateDestination: false });
    return { status: 'RESOLVED', message: `POSIÇÃO AJUSTADA // ${amount}`, movement: amount };
  },
  HACK: ({ state, definition, team, random = Math.random }) => {
    if (definition.config.interaction === 'HACK_HEIST') {
      return interactionAction(state, definition, team, 'HACK_HEIST');
    }
    const hacks = (definition.config.hacks ?? [definition.config.hack ?? 'TURBO'])
      .filter(hack => HACKS.includes(String(hack).toUpperCase()));
    const hack = hacks[randomInt(0, hacks.length - 1, random)] ?? 'TURBO';
    const added = grantHack(state, team.id, hack);
    if (added) return { status: 'RESOLVED', message: `HACK RECEBIDO // ${hack}`, hack, added };
    return resolveSimpleEffect({ state, definition, team, effect: definition.config.fullFallback }, 'LIMITE DE HACKS // FALLBACK EXECUTADO');
  },
  HACK_REWARD: ({ state, definition, team }) => questionAction(
    state, definition, team, "HACKER'S CACHE", 'HACK_REWARD'
  ),
  VIRUS_INJECTION: ({ state, definition, team }) => {
    const targets = getAdversaries(state, team.id);
    return targets.length
      ? {
          status: 'CHOICE',
          type: 'VIRUS_INJECTION_TARGET',
          choices: targets.map(target => ({ id: target.id, name: target.name, targetId: target.id })),
          targetIds: targets.map(target => target.id),
          message: 'ESCOLHA UMA GANGUE ADVERSÁRIA PARA RECEBER O VÍRUS.'
        }
      : fallback(definition, 'NENHUMA GANGUE ADVERSÁRIA VÁLIDA // VÍRUS NÃO APLICADO');
  },
  STATUS: ({ state, definition, team }) => {
    const status = definition.config.status ?? 'FIREWALL';
    const applied = applyStatus(state, team.id, status, definition.config.turns ?? 1);
    return applied
      ? { status: 'RESOLVED', message: `STATUS ATIVO // ${status}`, appliedStatus: status, turns: definition.config.turns ?? 1 }
      : fallback(definition, 'STATUS INDISPONÍVEL // CONTINUE A PARTIDA');
  },
  KIDNAPPED: ({ state, definition, team }) => interactionAction(state, definition, team, 'KIDNAPPED'),
  EVENT: ({ state, definition }) => {
    const eventPool = definition.config.eventPool ?? ['NETWORK_OVERLOAD', 'BLACKOUT', 'NETWORK_TURBO', 'GLOBAL_VIRUS'];
    const event = definition.config.event ?? eventPool[randomInt(0, eventPool.length - 1)];
    activateEvent(state, event);
    return { status: 'RESOLVED', message: `EVENTO GLOBAL // ${event}`, event };
  },
  CHECKPOINT: ({ definition }) => ({ status: 'RESOLVED', message: `${definition.name} // PROGRESSO REGISTRADO.` }),
  RANDOM: ({ state, definition, team, random = Math.random }) => {
    const outcome = chooseWeightedOutcome(definition.config.outcomes ?? [], random);
    if (!outcome) return fallback(definition, 'RANDOM SEM RESULTADO // TURNO CONTINUA');
    if (definition.id === 27 || definition.id === 53) {
      return {
        status: 'PENDING_RANDOM',
        randomOutcome: outcome
      };
    }
    return resolveSimpleEffect({
      state,
      definition,
      team,
      effect: outcome.effect,
      message: `RANDOM // ${outcome.id}`,
      random
    });
  },
  CHOICE: ({ definition }) => {
    const questionChoices = definition.config.questionChoices;
    const choices = normalizeChoices(questionChoices ?? definition.config.choices ?? [
      { id: 'SAFE_MODE', name: 'SAFE MODE', effect: { type: 'nothing' } },
      { id: 'OVERCLOCK', name: 'ARRISCAR', effect: { type: 'movement', movement: definition.config.movement ?? 2 } }
    ]);
    return choices.length
      ? {
          status: 'CHOICE',
          interaction: definition.config.interaction,
          choiceQuestion: Boolean(questionChoices),
          choices,
          message: questionChoices ? 'ESCOLHA O NÍVEL DO DESAFIO.' : 'ESCOLHA UMA ROTA.'
        }
      : fallback(definition, 'ESCOLHA INDISPONÍVEL // TURNO CONTINUA');
  },
  DATA_TUNNEL: ({ state, definition, team }) => {
    const targets = getTeamsAhead(state, team.id);
    if (!targets.length) {
      const result = applyMovement({
        state,
        teamId: team.id,
        delta: definition.config.fallbackMovement ?? 2,
        reason: 'DATA_TUNNEL_FALLBACK',
        activateDestination: false
      });
      return { status: 'RESOLVED', message: 'NENHUMA GANGUE À FRENTE // +2 CASAS', movement: result.ok ? definition.config.fallbackMovement ?? 2 : 0 };
    }
    return {
      status: 'CHOICE',
      type: 'DATA_TUNNEL_TARGET',
      interaction: 'DATA_TUNNEL',
      choices: targets.map(target => ({ id: target.id, name: target.name, targetId: target.id })),
      targetIds: targets.map(target => target.id),
      message: 'ESCOLHA UMA GANGUE QUE ESTEJA À SUA FRENTE PARA TROCAR DE POSIÇÃO.'
    };
  },
  DUEL: ({ state, definition, team }) => interactionAction(state, definition, team, definition.config.interaction ?? (definition.config.allTeams ? 'SPEED_BATTLE' : 'DUEL')),
  AMBUSH: ({ state, definition, team }) => interactionAction(state, definition, team, definition.config.interaction ?? (definition.config.sabotage ? 'SABOTAGE' : 'AMBUSH')),
  ATTACK: ({ state, definition, team }) => interactionAction(state, definition, team, 'ATTACK'),
  BET: ({ state, definition, team }) => interactionAction(state, definition, team, definition.config.auction ? 'AUCTION' : 'BET'),
  POSITION_SWAP: ({ state, definition, team }) => {
    const ahead = getTeamAhead(state, team.id);
    if (!ahead) {
      const result = applyMovement({ state, teamId: team.id, delta: definition.config.fallbackMovement ?? 2, reason: 'POSITION_SWAP', activateDestination: false });
      return { status: 'RESOLVED', message: 'SEM GANGUE À FRENTE // AVANÇO APLICADO', movement: result.ok ? definition.config.fallbackMovement ?? 2 : 0 };
    }
    const firstHouse = team.houseId;
    const swapped = swapTeamPositions(state, team.id, ahead.id);
    return swapped
      ? { status: 'RESOLVED', message: 'POSITION SWAP // POSIÇÕES TROCADAS', swappedTeamId: ahead.id, fromHouseId: firstHouse, toHouseId: team.houseId }
      : fallback(definition, 'TROCA INDISPONÍVEL // TURNO CONTINUA');
  },
  CATCH_UP: ({ state, definition, team }) => {
    const ahead = getTeamAhead(state, team.id);
    const maxMove = definition.config.movement ?? 3;
    const delta = ahead ? Math.max(0, Math.min(maxMove, ahead.houseId - team.houseId - 1)) : maxMove;
    const result = applyMovement({ state, teamId: team.id, delta, reason: 'CATCH_UP', activateDestination: false });
    return { status: 'RESOLVED', message: `CATCH UP // +${delta}`, movement: result.ok ? delta : 0, targetTeamId: ahead?.id ?? null };
  },
  ALLIANCE: ({ state, definition, team }) => interactionAction(state, definition, team, 'ALLIANCE'),
  JUDGEMENT: ({ state, definition, team }) => interactionAction(state, definition, team, 'JUDGEMENT'),
  DOUBT: ({ state, definition, team }) => interactionAction(state, definition, team, 'DOUBT'),
  FINISH: ({ state, definition, team }) => {
    if (team.finalist || state.finished) {
      const movement = applyMovement({
        state,
        teamId: team.id,
        delta: 58 - team.houseId,
        reason: 'CENTRAL_NEXUS_LOCKED',
        activateDestination: false
      });
      return {
        status: 'FALLBACK',
        message: 'PORTAL FINAL BLOQUEADO // RETORNO À CASA 58',
        movement: movement.ok ? movement.houseId : null
      };
    }
    const stages = definition.config.protocolStages ?? [];
    const stageNumber = state.finalProtocol?.status === 'ACTIVE' &&
      state.finalProtocol.teamId === team.id &&
      Number.isInteger(state.finalProtocol.stage)
      ? state.finalProtocol.stage
      : 1;
    const stage = stages[stageNumber - 1] ?? stages[0];
    const selection = selectQuestion({
      state,
      difficulty: definition.config.difficulty,
      category: stage?.category ?? definition.config.category,
      allowUsedFallback: false
    });
    if (!selection.question) {
      return fallback(definition, 'DESAFIO FINAL INDISPONÍVEL // TENTE NOVAMENTE');
    }
    registerQuestionUse(state, selection.question.id);
    return {
      status: 'READY',
      type: 'FINISH',
      question: selection.question,
      questionId: selection.question.id,
      timeLimit: definition.config.timeLimit ?? 60,
      challenge: 'CENTRAL NEXUS',
      questionResolution: 'FINAL_CHALLENGE',
      finalProtocolStage: stage?.number ?? stageNumber,
      finalProtocolTotal: stages.length || 3,
      finalProtocolLabel: stage?.label ?? 'CENTRAL NEXUS',
      finalProtocolChallenge: stage?.challenge ?? 'DESATIVE O NEXUS'
    };
  }
});

function questionAction(state, definition, team, label = definition.type, questionResolution = 'SPECIAL', questionConfig = {}) {
  const config = { ...definition.config, ...questionConfig };
  const selection = selectQuestion({
    state,
    difficulty: config.difficulty,
    category: config.category,
    format: config.format,
    preferredQuestionId: config.questionId,
    allowUsedFallback: config.questionResolution !== 'BOSS_PROTOCOL_02'
  });
  if (!selection.question) return fallback(definition, 'NENHUMA PERGUNTA DISPONÍVEL // CONTINUE A PARTIDA');
  registerQuestionUse(state, selection.question.id);
  return { status: 'READY', question: selection.question, questionId: selection.question.id,
    timeLimit: config.timeLimit ?? null, challenge: label, questionResolution };
}

function binaryCodeAction(state, definition, team, random) {
  const selection = selectQuestion({
    state,
    difficulty: definition.config.difficulty,
    category: definition.config.category,
    format: definition.config.format,
    preferredQuestionId: definition.config.questionId
  });
  if (!selection.question || selection.question.options.length < 2) {
    return fallback(definition, 'NENHUM PAR DE CÓDIGOS DISPONÍVEL // TURNO CONTINUA');
  }
  const source = selection.question;
  const incorrectOptions = source.options
    .map((option, index) => ({ option, index }))
    .filter(item => item.index !== source.answer);
  const decoy = incorrectOptions[randomInt(0, incorrectOptions.length - 1, random)];
  const options = random() < 0.5
    ? [source.options[source.answer], decoy.option]
    : [decoy.option, source.options[source.answer]];
  const question = {
    ...source,
    id: `${source.id}:impostor`,
    question: 'Escolha o trecho de código que completa corretamente a instrução.',
    options,
    answer: options.indexOf(source.options[source.answer])
  };
  registerQuestionUse(state, source.id);
  return {
    status: 'READY',
    question,
    questionId: question.id,
    questionResolution: 'NORMAL',
    timeLimit: definition.config.timeLimit ?? null
  };
}

function multiQuestionAction(state, definition, team) {
  const count = definition.config.count ?? 1;
  const questions = [];
  for (let index = 0; index < count; index += 1) {
    const selection = selectQuestion({
      state,
      difficulty: definition.config.difficulty,
      category: definition.config.category
    });
    if (!selection.question) {
      return fallback(definition, 'NÃO HÁ MINIQUESTÕES SUFICIENTES // DESAFIO CANCELADO');
    }
    registerQuestionUse(state, selection.question.id);
    questions.push(selection.question);
  }
  const firstQuestion = questions[0];
  if (!firstQuestion) return fallback(definition, 'DESAFIO INDISPONÍVEL // TURNO CONTINUA');
  const question = definition.config.mode === 'CRITICAL_BUG'
    ? {
        ...firstQuestion,
        question: 'O código mostra dois trechos com erro. Corrija o erro indicado em cada etapa.',
        code: questions
          .map((item, index) => `# TRECHO ${index + 1}\n${String(item.code ?? '').replaceAll('\\n', '\n')}`)
          .join('\n\n')
      }
    : firstQuestion;
  return {
    status: 'READY',
    question,
    questions,
    scoring: definition.config.scoring ?? [],
    challengeMode: definition.config.mode,
    questionResolution: 'MULTI_NORMAL',
    timeLimit: definition.config.timeLimit ?? null
  };
}

function interactionAction(state, definition, team, mode) {
  const needsTarget = ['DUEL', 'AMBUSH', 'SABOTAGE', 'ALLIANCE', 'DOUBT', 'ATTACK', 'NETWORK_INVASION', 'KIDNAPPED', 'HACK_HEIST'].includes(mode);
  const targets = needsTarget
    ? getAdversaries(state, team.id, { requireHack: mode === 'HACK_HEIST' })
    : [];
  if (mode === 'HACK_HEIST' && !targets.length) {
    const movement = applyMovement({
      state,
      teamId: team.id,
      delta: definition.config.fallbackMovement ?? 2,
      reason: 'HACK_HEIST_FALLBACK',
      activateDestination: false
    });
    return { status: 'RESOLVED', interaction: mode, movement: movement.ok ? definition.config.fallbackMovement ?? 2 : 0,
      message: 'NENHUM ALVO COM HACK // AVANÇO DE 2 CASAS' };
  }
  if (needsTarget && !targets.length && mode !== 'DOUBT') {
    return fallback(definition, 'NENHUMA GANGUE ADVERSÁRIA VÁLIDA // TURNO CONTINUA');
  }
  if (mode === 'BET') {
    return { status: 'CHOICE', interaction: mode, choices: [
      { id: 'SAFE', name: 'SAFE', effect: { difficulty: 'medium', correct: 2, wrong: -1 } },
      { id: 'HIGH_RISK', name: 'HIGH RISK', effect: { difficulty: 'hard', correct: 3, wrong: -2 } }
    ], message: 'ESCOLHA SUA APOSTA.' };
  }
  if (mode === 'AUCTION') {
    return { status: 'CHOICE', interaction: mode, choices: [1, 2, 3].map(amount => ({
      id: `BET_${amount}`, name: `${amount} CASA(S)`, effect: { amount }
    })), message: 'ESCOLHA O VALOR DA APOSTA.' };
  }
  if (mode === 'DOUBT') {
    return {
      status: 'CHOICE',
      interaction: mode,
      choices: [
        { id: 'ALONE', name: 'ALONE', effect: { mode: 'ALONE', difficulty: 'medium' } },
        ...targets.map(target => ({ id: target.id, name: `ASK FOR HELP // ${target.name}`, targetId: target.id, effect: { mode: 'HELP', difficulty: 'medium' } }))
      ],
      message: 'ESCOLHA COMO ENFRENTAR A DÚVIDA.'
    };
  }
  if (['JUDGEMENT', 'SPEED_BATTLE', 'SPEED_BATTLE_FIRST', 'DUEL_FIRST', 'SPEED_NETWORK', 'SPEED_NETWORK_FIRST'].includes(mode)) {
    const selection = selectQuestion({ state, difficulty: definition.config.difficulty ?? 'medium' });
    if (!selection.question) return fallback(definition, 'NENHUMA PERGUNTA DISPONÍVEL // TURNO CONTINUA');
    registerQuestionUse(state, selection.question.id);
    return {
      status: 'READY',
      interaction: mode,
      interactionId: `${state.turn}:${definition.id}:${team.id}`,
      question: selection.question,
      participants: state.teams.filter(item => !item.finalist).map(item => item.id),
      responseLimit: mode === 'SPEED_NETWORK_FIRST' ? 1 : state.teams.length,
      timeLimit: definition.config.timeLimit === undefined ? 30 : definition.config.timeLimit
    };
  }
  return {
    status: 'CHOICE',
    interaction: mode,
    choices: targets.map(target => ({ id: target.id, name: target.name, targetId: target.id })),
    message: mode === 'HACK_HEIST' ? 'ESCOLHA UMA GANGUE ADVERSÁRIA QUE POSSUA HACK.' : 'SELECIONE A GANGUE ALVO.',
    targetIds: targets.map(target => target.id)
  };
}

export function resolveInteraction(state, interaction, outcome) {
  const attacker = state?.teams?.find(item => item.id === interaction?.teamId);
  if (!attacker || !interaction || interaction.resolved) return { ok: false, reason: 'INVALID_INTERACTION' };
  if (interaction.interactionId && state.resolvedInteractions?.[interaction.interactionId]) {
    return { ok: false, reason: 'INTERACTION_ALREADY_RESOLVED' };
  }
  const target = state.teams.find(item => item.id === interaction.targetId);
  const targeted = ['DUEL', 'NETWORK_INVASION', 'AMBUSH', 'SABOTAGE', 'KIDNAPPED', 'HACK_HEIST', 'ALLIANCE'].includes(interaction.type) ||
    (interaction.type === 'DOUBT' && interaction.mode !== 'ALONE');
  if (targeted && (!target || target === attacker)) return { ok: false, reason: 'INVALID_TARGET' };
  if (target && isProtectedByFirewall(state, interaction.type, target.id)) {
    markInteractionResolved(state, interaction);
    return { ok: true, blocked: true, message: 'FIREWALL BLOQUEOU A INTERAÇÃO.' };
  }
  const responses = normalizeInteractionResponses(outcome?.responses);
  const participantIds = interaction.participantIds ?? (target ? [attacker.id, target.id] : [attacker.id]);
  const responseIds = responses.map(response => response.teamId);
  if (new Set(responseIds).size !== responseIds.length ||
      responseIds.some(id => !participantIds.includes(id))) {
    return { ok: false, reason: 'INVALID_RESPONSES' };
  }
  if (interaction.requireResponses) {
    if (participantIds.length !== responseIds.length ||
        participantIds.some(id => !responseIds.includes(id))) {
      return { ok: false, reason: 'INCOMPLETE_RESPONSES' };
    }
  }
  const responseFor = teamId => responses.find(response => response.teamId === teamId);
  const activeResponse = responseFor(interaction.respondentId ?? attacker.id);
  const correct = activeResponse
    ? activeResponse.result === 'correct'
    : outcome === true || outcome?.correct === true;
  const penalties = [];
  markInteractionResolved(state, interaction);
  const move = (teamId, amount, reason = interaction.type, questionReward = false) => {
    if (amount < 0 && outcome?.deferPenalties) {
      penalties.push({ teamId, amount, reason, cancelable: true, interaction: true });
      return { ok: true, deferred: true, teamId, amount };
    }
    return applyMovement({
      state,
      teamId,
      delta: amount + (questionReward ? getQuestionMovementBonus(state, amount) : 0),
      reason,
      activateDestination: false,
      isReward: questionReward
    });
  };
  switch (interaction.type) {
    case 'AMBUSH':
      return { ok: true, movement: move(attacker.id, correct ? -1 : 0, 'AMBUSH'), targetMovement: move(target.id, correct ? 0 : -3, 'AMBUSH'), penalties };
    case 'SABOTAGE':
      return { ok: true, movement: move(target.id, correct ? 0 : -2, 'SABOTAGE'), penalties };
    case 'KIDNAPPED':
      if (target.statuses?.FROZEN) return { ok: true, fallback: true };
      return { ok: true, status: applyStatus(state, target.id, 'FROZEN', 1) };
    case 'HACK_HEIST': {
      if (correct) return { ok: true, stolen: false, message: 'ROUBO FALHOU // ALVO ACERTOU.' };
      return { ok: true, ...stealHack(state, target.id, attacker.id) };
    }
    case 'DUEL':
    case 'NETWORK_INVASION': {
      const correctOrder = responses
        .filter(response => response.result === 'correct')
        .sort((a, b) => a.order - b.order);
      if (!correctOrder.length) return { ok: true, winnerId: null, penalties };
      const winnerId = correctOrder[0].teamId;
      const loserId = winnerId === attacker.id ? target.id : attacker.id;
      const winner = move(winnerId, 3, interaction.type, true);
      penalties.push({ teamId: loserId, amount: -1, reason: interaction.type, cancelable: true, interaction: true });
      return { ok: true, winnerId, winner, penalties };
    }
    case 'ALLIANCE':
      if (participantIds.some(id => responseFor(id)?.result !== 'correct')) return { ok: true, bonus: 0 };
      return { ok: true, attacker: move(attacker.id, 2, 'ALLIANCE', true), target: move(target.id, 2, 'ALLIANCE', true) };
    case 'DOUBT':
      if (interaction.mode === 'ALONE') return { ok: true, attacker: move(attacker.id, correct ? 2 : 0, 'DOUBT', correct) };
      if (participantIds.some(id => responseFor(id)?.result !== 'correct')) return { ok: true, bonus: 0 };
      return { ok: true, attacker: move(attacker.id, 2, 'DOUBT', true), target: move(target.id, 2, 'DOUBT', true) };
    case 'BET':
    case 'AUCTION': {
      const amount = interaction.amount ?? (correct ? outcome.correctAmount : outcome.wrongAmount);
      if (!Number.isFinite(amount)) return { ok: false, reason: 'INVALID_AMOUNT' };
      return { ok: true, movement: move(attacker.id, correct ? amount : -amount, interaction.type, correct), penalties };
    }
    case 'CATCH_UP':
      return { ok: true };
    case 'POSITION_SWAP':
      return { ok: true };
    case 'JUDGEMENT':
    case 'SPEED_BATTLE':
    case 'SPEED_NETWORK': {
      if (!Array.isArray(outcome.order)) return { ok: true, rewards: [] };
      const rewards = interaction.type === 'JUDGEMENT'
        ? [2, ...outcome.order.slice(1).map(() => 1)]
        : interaction.type === 'SPEED_NETWORK'
          ? [1, ...outcome.order.slice(1).map(() => 0)]
          : [3, 2, ...outcome.order.slice(2).map(() => 1)];
      const applied = outcome.order.map((teamId, index) => ({
        teamId,
        amount: rewards[index] ?? 0,
        movement: move(teamId, rewards[index] ?? 0, interaction.type, true)
      }));
      return { ok: true, rewards: applied, penalties };
    }
    case 'SPEED_NETWORK_FIRST': {
      const firstTeamId = outcome?.firstTeamId;
      if (!participantIds.includes(firstTeamId)) return { ok: false, reason: 'INVALID_FIRST_RESPONDER' };
      const firstTeam = state.teams.find(item => item.id === firstTeamId);
      if (!firstTeam) return { ok: false, reason: 'INVALID_FIRST_RESPONDER' };
      const firstResponse = responses[0];
      if (!firstResponse) return { ok: false, reason: 'MISSING_RESPONSE' };
      const firstCorrect = firstResponse?.result === 'correct';
      return {
        ok: true,
        firstTeamId,
        movement: firstCorrect ? move(firstTeamId, 1, 'SPEED_NETWORK_FIRST', true) : null
      };
    }
    case 'SPEED_BATTLE_FIRST': {
      const firstTeamId = outcome?.firstTeamId;
      if (!participantIds.includes(firstTeamId)) return { ok: false, reason: 'INVALID_FIRST_RESPONDER' };
      const firstTeam = state.teams.find(item => item.id === firstTeamId);
      if (!firstTeam) return { ok: false, reason: 'INVALID_FIRST_RESPONDER' };
      return {
        ok: true,
        firstTeamId,
        movement: correct ? move(firstTeamId, 3, 'SPEED_BATTLE_FIRST', true) : null
      };
    }
    case 'DUEL_FIRST': {
      const firstTeamId = outcome?.firstTeamId;
      if (!participantIds.includes(firstTeamId)) return { ok: false, reason: 'INVALID_FIRST_RESPONDER' };
      const firstTeam = state.teams.find(item => item.id === firstTeamId);
      if (!firstTeam) return { ok: false, reason: 'INVALID_FIRST_RESPONDER' };
      if (firstTeam.id !== attacker.id && isProtectedByFirewall(state, 'DUEL', firstTeam.id)) {
        return { ok: true, blocked: true, winnerId: null, penalties: [] };
      }
      if (!correct) return { ok: true, winnerId: null, penalties: [] };
      const opponent = firstTeam.id === attacker.id
        ? state.teams.find(item => participantIds.includes(item.id) &&
            item.id !== attacker.id && !isProtectedByFirewall(state, 'DUEL', item.id))
        : attacker;
      const winner = move(firstTeam.id, 3, 'DUEL', true);
      if (!opponent) return { ok: true, winnerId: firstTeam.id, winner, penalties: [] };
      const penalty = {
        teamId: opponent.id,
        amount: -1,
        reason: 'DUEL',
        cancelable: true,
        interaction: true
      };
      penalties.push(penalty);
      return { ok: true, winnerId: firstTeam.id, winner, penalties };
    }
    default:
      return { ok: true, penalties };
  }
}

function normalizeInteractionResponses(responses) {
  if (Array.isArray(responses)) return responses;
  if (!responses || typeof responses !== 'object') return [];
  return Object.entries(responses).map(([teamId, response], index) => ({
    teamId,
    result: response?.timedOut ? 'timeout' : response?.correct ? 'correct' : 'wrong',
    order: Number.isInteger(response?.order) ? response.order : index + 1,
    answeredAt: response?.answeredAt ?? null
  }));
}

function markInteractionResolved(state, interaction) {
  interaction.resolved = true;
  if (!interaction.interactionId) return;
  state.resolvedInteractions ??= {};
  state.resolvedInteractions[interaction.interactionId] = true;
}

function fallback(definition, message = 'Esta casa ainda não possui uma interação implementada.') {
  return {
    status: 'FALLBACK',
    message,
    definition
  };
}

function normalizeChoices(choices) {
  return choices.map((choice, index) => typeof choice === 'string'
    ? { id: choice, name: choice, effect: { type: choice === 'OVERCLOCK' ? 'movement' : 'nothing', movement: choice === 'OVERCLOCK' ? 2 : 0 } }
    : ({ id: choice?.id ?? `CHOICE_${index + 1}`, name: choice?.name ?? choice?.id ?? `OPÇÃO ${index + 1}`, effect: choice?.effect ?? { type: 'nothing' } }))
    .filter(choice => choice.id && choice.name && choice.effect);
}

function getTeleportDestination(currentHouse, config) {
  const configured = config.destination;
  if (Number.isInteger(configured) && configured >= 1 && configured <= 60) return configured;
  const destinations = Array.isArray(config.destinations)
    ? config.destinations.filter(item => Number.isInteger(item) && item >= 1 && item <= 60)
    : [];
  if (destinations.length) return destinations[0];
  const delta = config.fallbackMovement ?? config.movement;
  if (!Number.isInteger(delta)) return null;
  return Math.max(1, Math.min(60, currentHouse + delta));
}

function resolveSimpleEffect({
  state,
  definition,
  team,
  effect,
  message = 'EFEITO RESOLVIDO',
  random = Math.random
}, fallbackMessage = 'FALLBACK EXECUTADO') {
  const safeEffect = effect && typeof effect === 'object' ? effect : { type: 'nothing' };
  switch (safeEffect.type) {
    case 'movement': {
      const amount = Number.isFinite(safeEffect.movement) ? Math.trunc(safeEffect.movement) : 0;
      const movement = applyMovement({
        state,
        teamId: team.id,
        delta: amount,
        reason: definition.type,
        activateDestination: false
      });
      return {
        status: 'RESOLVED',
        message: message ?? `MOVIMENTO // ${amount}`,
        movement: amount,
        movementResult: movement,
        activateDestination: movement.activateDestination,
        effect: safeEffect
      };
    }
    case 'hack': {
      const added = grantHack(state, team.id, safeEffect.hack ?? 'TURBO');
      return { status: 'RESOLVED', message: added ? `HACK RECEBIDO // ${safeEffect.hack ?? 'TURBO'}` : fallbackMessage, added, effect: safeEffect };
    }
    case 'status': {
      const applied = applyStatus(state, team.id, safeEffect.status, safeEffect.turns ?? 1);
      return applied
        ? { status: 'RESOLVED', message: `STATUS ATIVO // ${safeEffect.status}`, appliedStatus: safeEffect.status, effect: safeEffect }
        : fallback(definition, fallbackMessage);
    }
    case 'challenge':
      return questionAction(
        state,
        definition,
        team,
        safeEffect.label ?? 'DESAFIO SURPRESA',
        'NORMAL',
        safeEffect
      );
    case 'nothing':
      return { status: 'RESOLVED', message: message ?? 'SEM EFEITO // TURNO CONTINUA', effect: safeEffect };
    case 'event': {
      const event = safeEffect.event ?? EVENTS[randomInt(0, EVENTS.length - 1, random)];
      const activated = activateEvent(state, event);
      return activated
        ? { status: 'RESOLVED', message: `EVENTO GLOBAL // ${activated}`, event: activated, effect: safeEffect }
        : fallback(definition, 'EVENTO GLOBAL INDISPONÍVEL // TURNO CONTINUA');
    }
    default:
      return fallback(definition, fallbackMessage);
  }
}

export function resolveDeferredRandomOutcome({ state, team, houseId, outcome, random = Math.random } = {}) {
  const definition = getHouseDefinition(houseId);
  const selectedOutcome = definition?.config.outcomes?.find(item => item.id === outcome?.id);
  if (![27, 53].includes(definition?.id) || definition.type !== 'RANDOM' || !selectedOutcome || !team) {
    return {
      status: 'FALLBACK',
      message: 'RESULTADO DA ROLETA INDISPONÍVEL // POSIÇÃO MANTIDA',
      type: 'RANDOM',
      houseId
    };
  }
  return {
    ...resolveSimpleEffect({
      state,
      definition,
      team,
      effect: selectedOutcome.effect,
      message: `ROLETA // ${selectedOutcome.id}`,
      random
    }),
    definition,
    type: 'RANDOM',
    config: definition.config,
    houseId: definition.id,
    randomOutcome: selectedOutcome
  };
}

export function getHouse(houseId) {
  return getHouseDefinition(houseId);
}

export function resolveDestination({ fromHouseId, steps = 0, activation = 'NORMAL' }) {
  if (!Number.isInteger(fromHouseId) || fromHouseId < 1 || fromHouseId > 60) {
    return { houseId: null, activateDestination: false, error: 'INVALID_SOURCE_HOUSE' };
  }
  const movement = Number.isInteger(steps) ? steps : 0;
  return {
    houseId: Math.max(1, Math.min(60, fromHouseId + movement)),
    activateDestination: activation === 'NORMAL'
  };
}

export function resolveHouse(context = {}) {
  const definition = getHouse(context.houseId);
  if (!definition) {
    return {
      status: 'FALLBACK',
      message: 'CASA INVÁLIDA // CONTINUE A PARTIDA',
      definition: null,
      error: 'INVALID_HOUSE'
    };
  }

  const handler = HOUSE_HANDLERS[definition.type];
  const result = handler
    ? handler({ ...context, definition })
    : fallback(definition);

  return {
    ...result,
    definition,
    type: result.type ?? definition.type,
    config: definition.config,
    houseId: definition.id
  };
}
