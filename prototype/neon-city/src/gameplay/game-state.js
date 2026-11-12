import { resolveHouse as resolveHouseDefinition } from './house-engine.js';
import {
  activateEvent as activateGlobalEvent,
  advanceStatusDuration,
  consumeEventRound,
  consumeNetworkTurbo,
  removeStatus,
  removeTeamFromActiveEvent
} from './gameplay-actions.js';
import { normalizeQuestionDifficulty } from './question-bank-loader.js';

const EVENTS = ['NETWORK_OVERLOAD', 'BLACKOUT', 'NETWORK_TURBO', 'GLOBAL_VIRUS'];
export const TURN_PHASES = Object.freeze({
  FROZEN_ESCAPE: 'FROZEN_ESCAPE',
  VIRUS_INJECTION_ESCAPE: 'VIRUS_INJECTION_ESCAPE',
  PREPARING: 'PREPARING',
  ROLLING: 'ROLLING',
  MOVING: 'MOVING',
  RESOLVING_HOUSE: 'RESOLVING_HOUSE',
  FINAL_CHALLENGE: 'FINAL_CHALLENGE',
  FINALIZING: 'FINALIZING',
  FINISHED: 'FINISHED',
  NEXT_TURN: 'NEXT_TURN'
});

const defaultTeams = [
  { id: 'crimson', name: 'GANGUE CRIMSON', color: 0xff4f73, members: ['Equipe Alpha'], character: 'bubbleguy', houseId: 1, hacks: 0 },
  { id: 'cyan', name: 'GANGUE CYAN', color: 0x4ee6e4, members: ['Equipe Beta'], character: 'robot', houseId: 27, hacks: 0 },
  { id: 'amber', name: 'GANGUE AMBER', color: 0xe6a85e, members: ['Equipe Gamma'], character: 'cauboi', houseId: 60, hacks: 0 }
];

export function createGameState(initialTeams, questionDifficulty = 'normal') {
  const sourceTeams = initialTeams?.length ? initialTeams : defaultTeams;
  const state = {
    teams: sourceTeams.map(item => ({
      ...item,
      members: [...(item.members ?? [])],
      hacks: Number.isInteger(item.hacks) ? item.hacks : 0,
      ownedHacks: Array.isArray(item.ownedHacks) ? [...item.ownedHacks] : undefined,
      statuses: { ...(item.statuses ?? {}) },
      finalist: Boolean(item.finalist),
      houseId: clampHouse(item.houseId)
    })),
    currentTeamIndex: 0,
    turnStartHouseId: clampHouse(sourceTeams[0]?.houseId),
    turn: 1,
    round: 1,
    phase: TURN_PHASES.PREPARING,
    questionDifficulty: normalizeQuestionDifficulty(questionDifficulty),
    diceValue: null,
    diceFaceValue: null,
    diceModifier: 0,
    diceMovementValue: null,
    moving: false,
    movementTeamId: null,
    movementReturnPhase: null,
    activeEvent: null,
    eventRoundsRemaining: 0,
    eventRemainingTeamIds: [],
    networkTurboRemainingTeamIds: [],
    eventActivationTeamId: null,
    eventActivationTurn: null,
    eventActivationTurnInProgress: false,
    action: null,
    history: [],
    paused: false,
    rolling: false,
    hackUsedThisTurn: false,
    usedQuestionIds: [],
    interactionResponses: {},
    interactionParticipants: {},
    startedInteractions: {},
    resolvedInteractions: {},
    winner: null,
    finalists: [],
    finalRanking: [],
    finalPortalUnlockedTeamIds: [],
    finalGatePendingTeamIds: [],
    finalChallengeAttempts: [],
    finalChallenge: null,
    finalProtocol: null,
    finalWindow: { active: false, durationMs: 60000, remainingMs: 60000 },
    finished: false
  };
  if (state.teams[0]?.statuses?.FROZEN) {
    state.phase = TURN_PHASES.FROZEN_ESCAPE;
    state.frozenEscape = { teamId: state.teams[0].id, attempts: 0, maxAttempts: 1, status: 'READY' };
  } else if (state.teams[0]?.statuses?.VIRUS_INJECTION &&
      !state.teams[0].statuses.VIRUS_INJECTION.escapeAttempted) {
    state.phase = TURN_PHASES.VIRUS_INJECTION_ESCAPE;
  }
  return state;
}

function clampHouse(houseId) {
  return Math.max(1, Math.min(60, Number.isInteger(houseId) ? houseId : 1));
}

export function team(state) {
  return state.teams[state.currentTeamIndex];
}

export function beginTurn(state) {
  if (state.paused || !state.teams.length || state.moving) return false;
  const current = team(state);
  if (!current || current.finalist || state.finished) return false;
  state.turnStartHouseId = clampHouse(current?.houseId);
  state.phase = TURN_PHASES.PREPARING;
  state.action = null;
  state.diceValue = null;
  state.diceFaceValue = null;
  state.diceModifier = 0;
  state.diceMovementValue = null;
  state.rolling = false;
  state.hackUsedThisTurn = false;
  state.frozenEscape = null;
  if (current?.statuses?.FROZEN) {
    state.phase = TURN_PHASES.FROZEN_ESCAPE;
    state.frozenEscape = {
      teamId: current.id,
      attempts: 0,
      maxAttempts: 1,
      status: 'READY'
    };
  } else if (current?.statuses?.VIRUS_INJECTION &&
      !current.statuses.VIRUS_INJECTION.escapeAttempted) {
    state.phase = TURN_PHASES.VIRUS_INJECTION_ESCAPE;
  }
  return true;
}

export function resolveFrozenEscape(state, result) {
  const current = team(state);
  const escape = state.frozenEscape;
  if (state.phase !== TURN_PHASES.FROZEN_ESCAPE || !current || !escape || escape.teamId !== current.id) {
    return { ok: false, reason: 'NO_ESCAPE_PROTOCOL' };
  }
  if (escape.status === 'RESOLVED') return { ok: false, reason: 'ESCAPE_ALREADY_RESOLVED' };
  escape.attempts += 1;
  const correct = result === true || result?.correct === true;
  if (correct) {
    delete current.statuses.FROZEN;
    escape.status = 'RESOLVED';
    state.phase = current.statuses.VIRUS_INJECTION &&
      !current.statuses.VIRUS_INJECTION.escapeAttempted
      ? TURN_PHASES.VIRUS_INJECTION_ESCAPE
      : TURN_PHASES.PREPARING;
    activatePendingFinalGate(state);
    return { ok: true, escaped: true, attempts: escape.attempts };
  }
  escape.status = 'RESOLVED';
  state.phase = TURN_PHASES.FINALIZING;
  return { ok: true, escaped: false, attempts: escape.attempts, turnLost: true };
}

export function resolveVirusInjectionEscape(state, result) {
  const current = team(state);
  if (state.phase !== TURN_PHASES.VIRUS_INJECTION_ESCAPE || !current?.statuses?.VIRUS_INJECTION) {
    return { ok: false, reason: 'NO_VIRUS_INJECTION_PROTOCOL' };
  }
  const correct = result === true || result?.correct === true;
  if (correct) removeStatus(current, 'VIRUS_INJECTION');
  state.phase = TURN_PHASES.PREPARING;
  activatePendingFinalGate(state);
  return { ok: true, escaped: correct, virusRemains: Boolean(current.statuses.VIRUS_INJECTION) };
}

export function rollDice(state) {
  const current = team(state);
  if (state.paused || state.rolling || state.moving || state.phase !== TURN_PHASES.PREPARING || !current) return null;
  state.turnStartHouseId = clampHouse(current.houseId);
  state.rolling = true;
  state.phase = TURN_PHASES.ROLLING;
  const rolledValue = 1 + Math.floor(Math.random() * 6);
  const reversedValue = current.statuses?.REVERSE_GRAVITY
    ? 7 - rolledValue
    : rolledValue;
  const virusLimitedValue = current.statuses?.VIRUS_INJECTION
    ? Math.min(3, reversedValue)
    : reversedValue;
  if (current.statuses?.REVERSE_GRAVITY) delete current.statuses.REVERSE_GRAVITY;
  if (current.statuses?.VIRUS_INJECTION) removeStatus(current, 'VIRUS_INJECTION');
  const turboBonus = consumeNetworkTurbo(state, current.id) ? 1 : 0;
  state.diceFaceValue = virusLimitedValue;
  state.diceValue = virusLimitedValue;
  state.diceModifier = turboBonus;
  state.diceMovementValue = virusLimitedValue + turboBonus;
  return virusLimitedValue;
}

export function settleDice(state) {
  if (state.phase !== TURN_PHASES.ROLLING || !state.rolling) return false;
  state.rolling = false;
  return true;
}

export function beginMovement(state, teamId, startHouse, returnPhase = state?.phase) {
  const current = state?.teams?.find(item => item.id === teamId);
  if (state?.paused || state?.moving || !current || !Number.isInteger(startHouse) ||
      startHouse < 1 || startHouse > 60) return false;
  current.houseId = startHouse;
  state.moving = true;
  state.movementTeamId = teamId;
  state.movementReturnPhase = returnPhase;
  state.phase = TURN_PHASES.MOVING;
  return current.houseId;
}

export function advanceMovement(state, teamId, houseId) {
  const current = state?.teams?.find(item => item.id === teamId);
  if (!state?.moving || state.movementTeamId !== teamId || !current ||
      !Number.isInteger(houseId) || houseId < 1 || houseId > 60 ||
      Math.abs(houseId - current.houseId) !== 1) return false;
  current.houseId = houseId;
  return current.houseId;
}

export function completeMovement(state, teamId) {
  const current = state?.teams?.find(item => item.id === teamId);
  if (!state?.moving || !current || state.movementTeamId !== teamId) return false;
  state.moving = false;
  state.movementTeamId = null;
  state.phase = state.movementReturnPhase ?? TURN_PHASES.RESOLVING_HOUSE;
  state.movementReturnPhase = null;
  return current.houseId;
}

export function beginFinalizing(state) {
  if (state.paused || state.moving ||
      ![TURN_PHASES.RESOLVING_HOUSE, TURN_PHASES.FINAL_CHALLENGE].includes(state.phase)) return false;
  state.phase = TURN_PHASES.FINALIZING;
  return true;
}

export function moveToHouse(state, teamId, houseId) {
  const current = state.teams.find(item => item.id === teamId);
  if (!current || current !== team(state) || state.paused || state.moving) return false;
  current.houseId = clampHouse(houseId);
  state.phase = TURN_PHASES.RESOLVING_HOUSE;
  return current.houseId;
}

export function resolveHouse(state, houseId) {
  let action = resolveHouseDefinition({
    state,
    team: team(state),
    houseId
  });
  if (action.questionResolution === 'FINAL_CHALLENGE') {
    const started = beginFinalChallenge(state, team(state)?.id, action.questionId);
    if (!started.ok) {
      action = {
        status: 'FALLBACK',
        type: 'FINISH',
        message: 'DESAFIO FINAL JÁ REGISTRADO OU INDISPONÍVEL',
        houseId
      };
    } else {
      action.finalAttemptId = started.attempt.attemptId;
    }
  }
  state.action = action;
  state.phase = action.questionResolution === 'FINAL_CHALLENGE'
    ? TURN_PHASES.FINAL_CHALLENGE
    : TURN_PHASES.RESOLVING_HOUSE;
  return action;
}

export function beginFinalChallenge(state, teamId, questionId) {
  const challenger = state?.teams?.find(item => item.id === teamId);
  if (!challenger || challenger.finalist || state.finished ||
      state.finalChallenge?.status === 'ACTIVE' ||
      state.finalRanking?.some(item => item.teamId === teamId)) {
    return { ok: false, reason: 'FINAL_CHALLENGE_UNAVAILABLE' };
  }
  const attemptId = (state.finalChallengeAttempts?.length ?? 0) + 1;
  const attempt = {
    attemptId,
    teamId,
    questionId,
    status: 'ACTIVE',
    startedAt: Date.now(),
    remainingMs: 60000
  };
  const stage = state.finalProtocol?.status === 'ACTIVE' &&
    state.finalProtocol.teamId === teamId &&
    Number.isInteger(state.finalProtocol.stage)
    ? state.finalProtocol.stage
    : 1;
  state.finalProtocol = {
    status: 'ACTIVE',
    stage,
    totalStages: 3,
    teamId
  };
  attempt.stage = stage;
  state.finalChallengeAttempts ??= [];
  state.finalChallengeAttempts.push(attempt);
  state.finalChallenge = attempt;
  state.phase = TURN_PHASES.FINAL_CHALLENGE;
  return { ok: true, attempt };
}

export function resolveFinalChallenge(state, teamId, result, completedAt = Date.now()) {
  const attempt = state?.finalChallenge;
  if (!attempt || attempt.status !== 'ACTIVE' || attempt.teamId !== teamId ||
      state.finished || state.phase !== TURN_PHASES.FINAL_CHALLENGE) {
    return { ok: false, reason: 'FINAL_CHALLENGE_ALREADY_RESOLVED' };
  }
  const correct = result === true || result?.correct === true;
  attempt.status = correct ? 'PASSED' : 'FAILED';
  attempt.result = correct ? 'correct' : result?.result === 'timeout' ? 'timeout' : 'wrong';
  attempt.completedAt = completedAt;
  attempt.remainingMs = 0;
  if (!correct) {
    state.finalProtocol = {
      ...(state.finalProtocol ?? {}),
      status: 'FAILED',
      stage: attempt.stage ?? 1,
      totalStages: 3,
      teamId
    };
    state.phase = TURN_PHASES.RESOLVING_HOUSE;
    return { ok: true, correct: false, attempt };
  }

  const stage = attempt.stage ?? state.finalProtocol?.stage ?? 1;
  if (stage < 3) {
    state.finalProtocol = {
      status: 'ACTIVE',
      stage: stage + 1,
      totalStages: 3,
      teamId
    };
    state.finalChallenge = null;
    state.phase = TURN_PHASES.RESOLVING_HOUSE;
    return { ok: true, correct: true, advanced: true, nextStage: stage + 1, attempt };
  }

  const rankingEntry = {
    teamId,
    order: (state.finalRanking?.length ?? 0) + 1,
    result: 'correct',
    completedAt
  };
  state.finalRanking ??= [];
  state.finalists ??= [];
  state.finalRanking.push(rankingEntry);
  state.finalists.push(teamId);
  const finisher = state.teams.find(item => item.id === teamId);
  finisher.finalist = true;
  state.finalProtocol = {
    status: 'PASSED',
    stage: 3,
    totalStages: 3,
    teamId
  };
  removeTeamFromActiveEvent(state, teamId);
  if (state.winner === null) state.winner = teamId;

  if (!state.finalWindow?.active) {
    state.finalWindow = {
      active: true,
      durationMs: 60000,
      remainingMs: 60000,
      startedAt: completedAt
    };
  }
  state.phase = TURN_PHASES.RESOLVING_HOUSE;
  if (state.finalists.length >= state.teams.length) {
    state.finalWindow.active = false;
    state.finished = true;
    state.phase = TURN_PHASES.FINISHED;
  }
  return { ok: true, correct: true, attempt, rankingEntry, winnerId: state.winner };
}

export function finishFinalWindow(state, { force = false } = {}) {
  const rankedTeamIds = new Set((state?.finalRanking ?? []).map(entry => entry.teamId));
  const classificationComplete = state?.teams?.length > 0 &&
    state.teams.every(item => rankedTeamIds.has(item.id));
  if (!state?.finalWindow?.active || state.finished || (!force && !classificationComplete)) return false;
  if (state.finalChallenge?.status === 'ACTIVE') {
    state.finalChallenge.status = 'FAILED';
    state.finalChallenge.result = 'timeout';
    state.finalChallenge.completedAt = Date.now();
    state.finalChallenge.remainingMs = 0;
  }
  state.finalWindow.active = false;
  state.finalWindow.remainingMs = 0;
  state.finished = true;
  state.phase = TURN_PHASES.FINISHED;
  return true;
}

export function activatePendingFinalGate(state) {
  const current = team(state);
  if (state.phase !== TURN_PHASES.PREPARING || !current || current.houseId !== 59 ||
      !state.finalGatePendingTeamIds?.includes(current.id) ||
      !state.finalPortalUnlockedTeamIds?.includes(current.id)) return false;
  state.finalGatePendingTeamIds = state.finalGatePendingTeamIds.filter(id => id !== current.id);
  return true;
}

export function activateEvent(state, event = EVENTS[(state.currentTeamIndex + 1) % EVENTS.length]) {
  if (state.activeEvent && event === EVENTS[(state.currentTeamIndex + 1) % EVENTS.length]) {
    event = EVENTS[(EVENTS.indexOf(state.activeEvent) + 1) % EVENTS.length];
  }
  return activateGlobalEvent(state, event, {
    activationTeamId: team(state)?.id ?? null,
    activationTurn: state.turn,
    activationTurnInProgress: state.phase !== TURN_PHASES.PREPARING
  });
}

export function finishTurn(state) {
  if (state.paused || state.finished || state.moving || state.phase !== TURN_PHASES.FINALIZING || !state.teams.length) return false;
  const finishingTeam = team(state);
  const finishingIndex = state.currentTeamIndex;
  consumeEventRound(state, finishingTeam.id, state.turn);
  advanceStatusDuration(finishingTeam, state.turn);
  state.phase = TURN_PHASES.NEXT_TURN;
  const nextIndex = Array.from({ length: state.teams.length }, (_, offset) =>
    (state.currentTeamIndex + offset + 1) % state.teams.length
  ).find(index => !state.teams[index].finalist);
  if (nextIndex === undefined) {
    state.finalWindow.active = false;
    state.finished = true;
    state.phase = TURN_PHASES.FINISHED;
    return false;
  }
  state.currentTeamIndex = nextIndex;
  if (nextIndex <= finishingIndex) state.round += 1;
  state.turn += 1;
  state.rolling = false;
  state.diceValue = null;
  state.diceFaceValue = null;
  state.diceModifier = 0;
  state.diceMovementValue = null;
  state.action = null;
  beginTurn(state);
  activatePendingFinalGate(state);
  return true;
}

export const EVENT_LABELS = {
  NETWORK_OVERLOAD: 'SOBRECARGA DA REDE',
  BLACKOUT: 'APAGÃO',
  NETWORK_TURBO: 'TURBO DE REDE',
  GLOBAL_VIRUS: 'VÍRUS GLOBAL'
};
