const HACKS = Object.freeze(['TURBO', 'ESCUDO', 'INTERCEPTAR', 'OVERRIDE']);
const STATUSES = Object.freeze([
  'FIREWALL',
  'FROZEN',
  'KIDNAPPED',
  'REVERSE_GRAVITY',
  'VIRUS',
  'VIRUS_INJECTION',
  'INFINITE_LOOP'
]);
const EVENTS = Object.freeze(['NETWORK_OVERLOAD', 'BLACKOUT', 'NETWORK_TURBO', 'GLOBAL_VIRUS']);

export function clampHouse(houseId) {
  return Math.max(1, Math.min(60, Number.isInteger(houseId) ? houseId : 1));
}

export function moveTeam(state, teamId, steps) {
  const target = state?.teams?.find(item => item.id === teamId);
  if (!target || !Number.isFinite(steps)) return null;
  const amount = Math.trunc(steps);
  target.houseId = clampHouse(target.houseId + amount);
  return target.houseId;
}

export function applyMovement({
  state,
  teamId,
  delta = 0,
  reason = 'HOUSE_EFFECT',
  activateDestination = false,
  isReward = false
} = {}) {
  const target = state?.teams?.find(item => item.id === teamId);
  if (target && delta > 0 && isReward && hasStatus(target, 'INFINITE_LOOP')) {
    removeStatus(target, 'INFINITE_LOOP');
    return {
      ok: true,
      houseId: target.houseId,
      activateDestination: false,
      reason,
      canceledByInfiniteLoop: true
    };
  }
  const houseId = moveTeam(state, teamId, delta);
  return houseId === null ? { ok: false, houseId: null, activateDestination: false, reason } : {
    ok: true,
    houseId,
    activateDestination: Boolean(activateDestination),
    reason
  };
}

export function returnTeamToTurnStart(state, teamId) {
  const target = state?.teams?.find(item => item.id === teamId);
  const origin = state?.turnStartHouseId;
  if (!target || !Number.isInteger(origin) || origin < 1 || origin > 60) {
    return { ok: false, houseId: target?.houseId ?? null, activateDestination: false, reason: 'INVALID_TURN_ORIGIN' };
  }
  return applyMovement({
    state,
    teamId,
    delta: origin - target.houseId,
    reason: 'QUESTION_ROLLBACK',
    activateDestination: false
  });
}

export function getAdversaries(state, teamId, { requireHack = false } = {}) {
  return (state?.teams ?? []).filter(item =>
    item.id !== teamId && !item.finalist && (!requireHack || getHackCount(item) > 0)
  );
}

export function getTeamAhead(state, teamId) {
  const source = state?.teams?.find(item => item.id === teamId);
  if (!source) return null;
  return getAdversaries(state, teamId)
    .filter(item => item.houseId > source.houseId)
    .sort((a, b) => a.houseId - b.houseId)[0] ?? null;
}

export function getTeamsAhead(state, teamId) {
  const source = state?.teams?.find(item => item.id === teamId);
  if (!source) return [];
  return getAdversaries(state, teamId)
    .filter(item => item.houseId > source.houseId)
    .sort((a, b) => a.houseId - b.houseId);
}

export function swapTeamPositions(state, firstId, secondId) {
  const first = state?.teams?.find(item => item.id === firstId);
  const second = state?.teams?.find(item => item.id === secondId);
  if (!first || !second || first === second || first.houseId === second.houseId) return false;
  const position = first.houseId;
  first.houseId = second.houseId;
  second.houseId = position;
  return true;
}

export function swapWithTeamAhead(state, teamId, targetId) {
  const source = state?.teams?.find(item => item.id === teamId);
  const target = getTeamsAhead(state, teamId).find(item => item.id === targetId);
  if (!source || !target) return { ok: false, reason: 'INVALID_TARGET' };
  const fromHouseId = source.houseId;
  if (!swapTeamPositions(state, teamId, targetId)) return { ok: false, reason: 'SWAP_UNAVAILABLE' };
  source.houseId = clampHouse(source.houseId);
  target.houseId = clampHouse(target.houseId);
  return { ok: true, fromHouseId, houseId: source.houseId, targetHouseId: target.houseId };
}

export function resolveDoubleDice(state, teamId, roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    return { ok: false, reason: 'INVALID_SECOND_ROLL', roll, delta: 0 };
  }
  const delta = roll <= 2 ? -2 : roll <= 4 ? 0 : 3;
  const movement = applyMovement({
    state,
    teamId,
    delta,
    reason: 'DOUBLE_DICE',
    activateDestination: false
  });
  return { ...movement, roll, delta };
}

export function applyRankedRewards(state, teamIds, rewards) {
  const applied = new Set();
  teamIds.forEach((teamId, index) => {
    if (applied.has(teamId)) return;
    const amount = Number(rewards[index] ?? 0);
    if (Number.isFinite(amount) && amount !== 0) {
      applyMovement({ state, teamId, delta: amount, reason: 'INTERACTION_RANKING', activateDestination: false, isReward: true });
    }
    applied.add(teamId);
  });
  return applied.size;
}

export function recordInteractionResponse(state, interactionId, teamId, result) {
  if (!state || !interactionId || !teamId) return { accepted: false, reason: 'INVALID_RESPONSE' };
  state.interactionResponses ??= {};
  const responses = state.interactionResponses[interactionId] ?? [];
  const responseLimit = state.interactionResponseLimits?.[interactionId];
  if (Number.isInteger(responseLimit) && responses.length >= responseLimit) {
    return { accepted: false, reason: 'RESPONSE_LIMIT_REACHED' };
  }
  const participants = state.interactionParticipants?.[interactionId];
  if (participants && !participants.includes(teamId)) return { accepted: false, reason: 'INVALID_PARTICIPANT' };
  if (responses.some(item => item.teamId === teamId)) return { accepted: false, reason: 'DUPLICATE_RESPONSE' };
  const normalizedResult = result === true || result === 'correct'
    ? 'correct'
    : result === 'timeout'
      ? 'timeout'
      : 'wrong';
  const answeredAt = Date.now();
  const entry = {
    teamId,
    result: normalizedResult,
    answered: true,
    correct: normalizedResult === 'correct',
    timedOut: normalizedResult === 'timeout',
    order: responses.length + 1,
    answeredAt
  };
  state.interactionResponses[interactionId] = [...responses, entry];
  return { accepted: true, entry };
}

export function beginMultiplayerInteraction(state, interactionId, participants = []) {
  if (!state || !interactionId || !participants.length || new Set(participants).size !== participants.length) {
    return { ok: false, reason: 'INVALID_INTERACTION' };
  }
  const validIds = new Set(state.teams?.map(item => item.id) ?? []);
  if (participants.some(id => !validIds.has(id))) return { ok: false, reason: 'INVALID_PARTICIPANT' };
  state.interactionResponses ??= {};
  state.interactionParticipants ??= {};
  if (state.interactionResponses[interactionId]) {
    const existing = state.interactionParticipants[interactionId] ?? [];
    return existing.length === participants.length && existing.every(id => participants.includes(id))
      ? { ok: true, interactionId, participants: existing, existing: true }
      : { ok: false, reason: 'INTERACTION_EXISTS' };
  }
  state.interactionResponses[interactionId] = [];
  state.interactionParticipants[interactionId] = [...participants];
  return { ok: true, interactionId, participants: [...participants] };
}

export function getInteractionResponses(state, interactionId) {
  return [...(state?.interactionResponses?.[interactionId] ?? [])];
}

export function getInteractionOrder(state, interactionId) {
  return getInteractionResponses(state, interactionId)
    .filter(item => item.result === 'correct')
    .sort((a, b) => a.order - b.order)
    .map(item => item.teamId);
}

const FIREWALL_PROTECTED_INTERACTIONS = new Set([
  'DUEL',
  'NETWORK_INVASION',
  'AMBUSH',
  'SABOTAGE',
  'KIDNAPPED',
  'HACK_HEIST',
  'INTERCEPTAR'
]);

export function isGangProtectedByFirewall(state, gangId) {
  const target = state?.teams?.find(item => item.id === gangId);
  return Boolean(target && hasStatus(target, 'FIREWALL'));
}

export function isProtectedByFirewall(state, interaction, targetId) {
  if (!FIREWALL_PROTECTED_INTERACTIONS.has(interaction)) return false;
  return isGangProtectedByFirewall(state, targetId);
}

export function transferHack(state, fromTeamId, toTeamId, hackId = 'TURBO') {
  const from = state?.teams?.find(item => item.id === fromTeamId);
  const to = state?.teams?.find(item => item.id === toTeamId);
  const normalized = String(hackId).toUpperCase();
  if (!from || !to || from === to || getHackCount(from) <= 0 || getHackCount(to) >= 3 ||
      !HACKS.includes(normalized)) {
    return { transferred: false, reason: 'NO_TRANSFER_AVAILABLE' };
  }
  if (!removeHack(from, normalized)) return { transferred: false, reason: 'SOURCE_EMPTY' };
  if (!grantHack(state, toTeamId, normalized)) {
    grantHack(state, fromTeamId, normalized);
    return { transferred: false, reason: 'TARGET_UNAVAILABLE' };
  }
  return { transferred: true, amount: 1, hack: normalized };
}

export function stealHack(state, fromTeamId, toTeamId, hackId = 'TURBO') {
  const from = state?.teams?.find(item => item.id === fromTeamId);
  const to = state?.teams?.find(item => item.id === toTeamId);
  const normalized = String(hackId).toUpperCase();
  if (!from || !to || from === to || getHackCount(from) <= 0 || !HACKS.includes(normalized)) {
    return { stolen: false, reason: 'NO_HACK_TO_STEAL' };
  }
  if (!removeHack(from, normalized)) return { stolen: false, reason: 'SOURCE_EMPTY' };
  const received = getHackCount(to) < 3;
  if (received && !grantHack(state, toTeamId, normalized)) {
    grantHack(state, fromTeamId, normalized);
    return { stolen: false, received: false, reason: 'TARGET_UNAVAILABLE' };
  }
  return { stolen: true, received, amount: 1, hack: normalized };
}

export function getHackCount(team) {
  return normalizeHackInventory(team).length;
}

export function getHackTypeCount(team, hackId) {
  const normalized = String(hackId).toUpperCase();
  if (!HACKS.includes(normalized)) return 0;
  return normalizeHackInventory(team).filter(hack => hack === normalized).length;
}

export function hasHack(team, hackId) {
  return normalizeHackInventory(team).includes(String(hackId).toUpperCase());
}

export function canUseHack(team, hackId, state) {
  const normalized = String(hackId).toUpperCase();
  return Boolean(
    team &&
    state &&
    state.teams?.[state.currentTeamIndex] === team &&
    !state.hackUsedThisTurn &&
    HACKS.includes(normalized) &&
    hasHack(team, normalized) &&
    !isHackBlockedByEvent(state)
  );
}

export function removeHack(team, hackId = 'TURBO') {
  if (!team || !HACKS.includes(String(hackId).toUpperCase())) return false;
  const inventory = normalizeHackInventory(team);
  const index = inventory.indexOf(String(hackId).toUpperCase());
  if (index < 0) return false;
  inventory.splice(index, 1);
  setHackInventory(team, inventory);
  return true;
}

export function useHack(state, teamId, hackId) {
  const target = state?.teams?.find(item => item.id === teamId);
  const normalized = String(hackId).toUpperCase();
  if (!canUseHack(target, normalized, state) || !removeHack(target, normalized)) return false;
  state.hackUsedThisTurn = true;
  return true;
}

export function useTurbo(state, teamId) {
  const target = state?.teams?.find(item => item.id === teamId);
  if (state?.phase !== 'PREPARING' || state.paused || state.finished || target?.finalist ||
      !useHack(state, teamId, 'TURBO')) {
    return { ok: false, reason: 'UNAVAILABLE' };
  }
  const movement = applyMovement({ state, teamId, delta: 2, reason: 'HACK_TURBO', activateDestination: false });
  state.phase = 'FINALIZING';
  return { ok: true, ...movement, teamId: target?.id };
}

export function isPenaltyCancelable(penalty = {}) {
  return Boolean(
    penalty &&
    Number.isFinite(penalty.amount) &&
    penalty.amount < 0 &&
    !penalty.essential &&
    !penalty.finalChallenge &&
    !penalty.victory &&
    penalty.houseId !== 60
  );
}

export function canUseShield(state, teamId, penalty) {
  if (!isPenaltyCancelable(penalty)) return false;
  const target = state?.teams?.find(item => item.id === teamId);
  if (!target || !hasHack(target, 'ESCUDO') || isHackBlockedByEvent(state)) return false;
  const activeTeam = state.teams[state.currentTeamIndex];
  return activeTeam === target
    ? !state.hackUsedThisTurn
    : penalty.interaction === true;
}

export function resolveShield(state, teamId, penalty, useShield) {
  if (!isPenaltyCancelable(penalty)) return { canceled: false, reason: 'NOT_CANCELABLE' };
  if (!useShield) return { canceled: false, accepted: true, amount: penalty.amount };
  const target = state?.teams?.find(item => item.id === teamId);
  const activeTeam = state?.teams?.[state.currentTeamIndex];
  if (!canUseShield(state, teamId, penalty)) {
    return { canceled: false, accepted: true, amount: penalty.amount, reason: 'UNAVAILABLE' };
  }
  const consumed = activeTeam === target
    ? useHack(state, teamId, 'ESCUDO')
    : removeHack(target, 'ESCUDO');
  return consumed
    ? { canceled: true, accepted: false, amount: 0 }
    : { canceled: false, accepted: true, amount: penalty.amount, reason: 'UNAVAILABLE' };
}

export function getInterceptTargets(state, attackerId) {
  return (state?.teams ?? []).filter(target =>
    target.id !== attackerId && getHackCount(target) > 0
  );
}

export function beginIntercept(state, attackerId, targetId, interactionId = null) {
  const target = state?.teams?.find(item => item.id === targetId);
  if (interactionId &&
      (state.resolvedInteractions?.[interactionId] || state.startedInteractions?.[interactionId])) {
    return { ok: false, reason: 'INTERACTION_ALREADY_RESOLVED' };
  }
  if (!target || !getInterceptTargets(state, attackerId).some(item => item.id === targetId)) {
    return { ok: false, reason: 'INVALID_TARGET' };
  }
  if (isProtectedByFirewall(state, 'INTERCEPTAR', targetId)) {
    if (interactionId) {
      state.resolvedInteractions ??= {};
      if (state.resolvedInteractions[interactionId]) return { ok: false, reason: 'INTERACTION_ALREADY_RESOLVED' };
      state.resolvedInteractions[interactionId] = true;
    }
    state.phase = 'RESOLVING_HOUSE';
    return { ok: true, blocked: true, attackerId, targetId };
  }
  if (!useHack(state, attackerId, 'INTERCEPTAR')) return { ok: false, reason: 'UNAVAILABLE' };
  if (interactionId) {
    state.startedInteractions ??= {};
    state.startedInteractions[interactionId] = true;
  }
  state.phase = 'RESOLVING_HOUSE';
  return { ok: true, attackerId, targetId };
}

export function resolveIntercept(state, attackerId, targetId, targetAnsweredCorrectly, interactionId = null) {
  const attacker = state?.teams?.find(item => item.id === attackerId);
  const target = state?.teams?.find(item => item.id === targetId);
  if (!attacker || !target || attacker === target) {
    return { stolen: false, reason: 'INVALID_TARGET' };
  }
  if (interactionId && state.resolvedInteractions?.[interactionId]) {
    return { stolen: false, reason: 'INTERACTION_ALREADY_RESOLVED' };
  }
  if (isProtectedByFirewall(state, 'INTERCEPTAR', targetId)) {
    if (interactionId) {
      state.resolvedInteractions ??= {};
      state.resolvedInteractions[interactionId] = true;
    }
    return { stolen: false, blocked: true, reason: 'FIREWALL' };
  }
  if (interactionId) {
    state.resolvedInteractions ??= {};
    state.resolvedInteractions[interactionId] = true;
  }
  if (targetAnsweredCorrectly) {
    return { stolen: false, reason: targetAnsweredCorrectly ? 'TARGET_CORRECT' : 'INVALID_TARGET' };
  }
  if (getHackCount(attacker) >= 3 || getHackCount(target) <= 0) {
    return { stolen: false, reason: 'NO_TRANSFER_AVAILABLE' };
  }
  const hack = target.ownedHacks[0];
  const transfer = transferHack(state, targetId, attackerId, hack);
  return transfer.transferred
    ? { stolen: true, amount: 1, hack: transfer.hack }
    : { stolen: false, reason: transfer.reason ?? 'NO_TRANSFER_AVAILABLE' };
}

export function canOverrideAction(action) {
  return Boolean(
    action &&
    ['READY', 'CHOICE', 'PENDING_RANDOM'].includes(action.status) &&
    action.type !== 'FINISH' &&
    action.houseId !== 60 &&
    !action.victory &&
    !action.finalChallenge &&
    action.questionResolution !== 'FINAL_CHALLENGE'
  );
}

export function useOverride(state, teamId, action) {
  if (!canOverrideAction(action) || !useHack(state, teamId, 'OVERRIDE')) return false;
  action.status = 'OVERRIDDEN';
  action.message = 'OVERRIDE EXECUTADO // EFEITO CANCELADO';
  action.question = null;
  action.choices = null;
  return true;
}

export function grantHack(state, teamId, hack = 'TURBO') {
  const target = state?.teams?.find(item => item.id === teamId);
  const normalized = String(hack).toUpperCase();
  if (!target || !HACKS.includes(normalized)) return false;
  const inventory = normalizeHackInventory(target);
  if (inventory.length >= 3) return false;
  inventory.push(normalized);
  setHackInventory(target, inventory);
  return true;
}

export function addHack(state, teamId, hack = 'TURBO') {
  return grantHack(state, teamId, hack);
}

export function addHackCount(state, teamId, amount = 1) {
  const target = state?.teams?.find(item => item.id === teamId);
  const count = Number.isInteger(amount) ? amount : 0;
  if (!target || count < 1) return 0;
  const previous = getHackCount(target);
  const inventory = normalizeHackInventory(target);
  for (let index = previous; index < Math.min(3, previous + count); index += 1) inventory.push('TURBO');
  setHackInventory(target, inventory);
  return inventory.length - previous;
}

export function setHackCount(state, teamId, amount) {
  const target = state?.teams?.find(item => item.id === teamId);
  if (!target || !Number.isInteger(amount) || amount < 0 || amount > 3) return false;

  const inventory = normalizeHackInventory(target);
  if (inventory.length > amount) {
    inventory.length = amount;
    target.hacks = inventory.length;
    return true;
  }

  while (getHackCount(target) < amount) {
    if (!grantHack(state, teamId, 'TURBO')) return false;
  }
  return true;
}

export function grantRandomHack(state, teamId, random = Math.random) {
  const hack = HACKS[Math.floor(random() * HACKS.length)] ?? HACKS[0];
  return { hack, added: grantHack(state, teamId, hack) };
}

function normalizeHackInventory(team) {
  if (!team) return [];
  if (!Array.isArray(team.ownedHacks)) {
    const legacyCount = Number.isInteger(team.hacks) ? Math.max(0, Math.min(3, team.hacks)) : 0;
    team.ownedHacks = Array.from({ length: legacyCount }, () => 'TURBO');
  }
  team.ownedHacks = team.ownedHacks
    .map(hack => String(hack).toUpperCase())
    .filter(hack => HACKS.includes(hack))
    .slice(0, 3);
  team.hacks = team.ownedHacks.length;
  return team.ownedHacks;
}

function setHackInventory(team, inventory) {
  team.ownedHacks = inventory.slice(0, 3);
  team.hacks = team.ownedHacks.length;
}

export function applyStatus(state, teamId, status, turns = 1) {
  const target = state?.teams?.find(item => item.id === teamId);
  if (!addStatus(target, status, turns)) return false;
  target.statuses[String(status).toUpperCase()].appliedAtTurn = state.turn;
  return true;
}

export function addStatus(team, status, turns = 1, effect = null) {
  const id = String(status).toUpperCase();
  const duration = Number.isFinite(turns) ? Math.trunc(turns) : 0;
  if (!team || !STATUSES.includes(id) || duration < 1) return false;
  team.statuses ??= {};
  team.statuses[id] = { id, turns: duration, effect };
  return true;
}

export function removeStatus(team, status) {
  if (!team?.statuses) return false;
  const id = String(status).toUpperCase();
  if (!team.statuses[id]) return false;
  delete team.statuses[id];
  return true;
}

export function hasStatus(team, status) {
  return Boolean(team?.statuses?.[String(status).toUpperCase()]);
}

export function getStatus(team, status) {
  return team?.statuses?.[String(status).toUpperCase()] ?? null;
}

export function advanceStatusDuration(team, currentTurn = null) {
  if (!team?.statuses) return;
  for (const [id, value] of Object.entries(team.statuses)) {
    if (id === 'REVERSE_GRAVITY' || id === 'VIRUS_INJECTION') continue;
    if (currentTurn !== null && typeof value === 'object' && value.appliedAtTurn === currentTurn) continue;
    const turns = typeof value === 'number' ? value - 1 : value.turns - 1;
    if (turns <= 0) delete team.statuses[id];
    else team.statuses[id] = typeof value === 'number' ? turns : { ...value, turns };
  }
}

export function activateEvent(state, event, {
  activationTeamId = state?.teams?.[state.currentTeamIndex]?.id ?? null,
  activationTurn = state?.turn ?? null,
  activationTurnInProgress = state?.phase !== 'PREPARING'
} = {}) {
  const normalized = String(event || '').toUpperCase();
  if (!state || !EVENTS.includes(normalized)) return null;
  state.activeEvent = normalized;
  state.eventRoundsRemaining = Math.max(1, state.teams?.length ?? 1);
  state.eventRemainingTeamIds = (state.teams ?? []).map(team => team.id);
  state.networkTurboRemainingTeamIds = normalized === 'NETWORK_TURBO'
    ? [...state.eventRemainingTeamIds]
    : [];
  state.eventActivationTeamId = activationTeamId;
  state.eventActivationTurn = activationTurn;
  state.eventActivationTurnInProgress = Boolean(activationTurnInProgress);
  return normalized;
}

export function activateGlobalEvent(state, eventId, options) {
  return activateEvent(state, eventId, options);
}

export function replaceGlobalEvent(state, eventId) {
  return activateEvent(state, eventId);
}

export function consumeEventRound(
  state,
  teamId = state?.teams?.[state.currentTeamIndex]?.id,
  turn = state?.turn
) {
  if (!state?.activeEvent) return;
  const isActivationTurn = state.eventActivationTurnInProgress &&
    state.eventActivationTeamId === teamId &&
    state.eventActivationTurn === turn;
  if (isActivationTurn) return;
  state.eventRemainingTeamIds = (state.eventRemainingTeamIds ?? []).filter(id => id !== teamId);
  state.networkTurboRemainingTeamIds = (state.networkTurboRemainingTeamIds ?? []).filter(id => id !== teamId);
  state.eventRoundsRemaining = state.eventRemainingTeamIds.length;
  if (!state.eventRemainingTeamIds.length) {
    state.activeEvent = null;
    state.eventRoundsRemaining = 0;
    state.eventRemainingTeamIds = [];
    state.networkTurboRemainingTeamIds = [];
    state.eventActivationTeamId = null;
    state.eventActivationTurn = null;
    state.eventActivationTurnInProgress = false;
  }
}

export function consumeNetworkTurbo(state, teamId) {
  if (state?.activeEvent !== 'NETWORK_TURBO' || !teamId) return false;
  const remaining = state.networkTurboRemainingTeamIds ?? [];
  if (!remaining.includes(teamId)) return false;
  state.networkTurboRemainingTeamIds = remaining.filter(id => id !== teamId);
  return true;
}

export function addTeamToActiveEvent(state, teamId) {
  if (!state?.activeEvent || !teamId) return false;
  state.eventRemainingTeamIds ??= [];
  if (!state.eventRemainingTeamIds.includes(teamId)) state.eventRemainingTeamIds.push(teamId);
  if (state.activeEvent === 'NETWORK_TURBO') {
    state.networkTurboRemainingTeamIds ??= [];
    if (!state.networkTurboRemainingTeamIds.includes(teamId)) state.networkTurboRemainingTeamIds.push(teamId);
  }
  state.eventRoundsRemaining = state.eventRemainingTeamIds.length;
  return true;
}

export function removeTeamFromActiveEvent(state, teamId) {
  if (!state?.activeEvent || !teamId) return false;
  state.eventRemainingTeamIds = (state.eventRemainingTeamIds ?? []).filter(id => id !== teamId);
  state.networkTurboRemainingTeamIds = (state.networkTurboRemainingTeamIds ?? []).filter(id => id !== teamId);
  state.eventRoundsRemaining = state.eventRemainingTeamIds.length;
  if (!state.eventRemainingTeamIds.length) {
    state.activeEvent = null;
    state.eventRoundsRemaining = 0;
    state.networkTurboRemainingTeamIds = [];
    state.eventActivationTeamId = null;
    state.eventActivationTurn = null;
    state.eventActivationTurnInProgress = false;
  }
  return true;
}

export function getQuestionMovementBonus(state, amount) {
  return state?.activeEvent === 'NETWORK_OVERLOAD' && Number.isFinite(amount) && amount > 0
    ? 1
    : 0;
}

export function eventIsActive(state, event) {
  return state?.activeEvent === String(event).toUpperCase();
}

export function isGlobalEventActive(state, eventId) {
  return eventIsActive(state, eventId);
}

export function isHackBlockedByEvent(state) {
  return eventIsActive(state, 'BLACKOUT');
}

export function chooseWeightedOutcome(outcomes = [], random = Math.random) {
  const valid = outcomes.filter(item => item && Number.isFinite(item.weight) && item.weight > 0);
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return null;
  let cursor = random() * total;
  return valid.find(item => (cursor -= item.weight) < 0) ?? valid[valid.length - 1];
}

export function randomInt(min, max, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

export { EVENTS, HACKS, STATUSES };
