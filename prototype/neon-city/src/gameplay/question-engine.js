import { QUESTION_BANK, QUESTION_DIFFICULTIES, QUESTION_FORMATS } from './question-bank.js';

const VALID_RESULTS = Object.freeze(['correct', 'wrong', 'timeout']);
const EASY_CATEGORY_ALIASES = Object.freeze({
  output: ['INTRODUCAO_PRINT', 'PREVISAO_SAIDA'],
  variables: ['STRINGS', 'VARIAVEIS_TIPOS'],
  operators: ['OPERADORES_MATEMATICOS'],
  conditions: ['CONDICIONAIS'],
  debug: ['DEBUG'],
  logic: ['OPERADORES_LOGICOS', 'LOGICA'],
  mixed: ['DESAFIO_MISTO']
});
let activeQuestionBank = QUESTION_BANK;
let activeQuestionDifficulty = 'normal';

function isValidQuestion(question) {
  return Boolean(
    question &&
    typeof question.id === 'string' &&
    typeof question.category === 'string' &&
    question.category.length > 0 &&
    QUESTION_DIFFICULTIES.includes(question.difficulty) &&
    QUESTION_FORMATS.includes(question.format) &&
    typeof question.question === 'string' &&
    (question.code === null || typeof question.code === 'string') &&
    Array.isArray(question.options) &&
    question.options.length >= 2 &&
    Number.isInteger(question.answer) &&
    question.answer >= 0 &&
    question.answer < question.options.length &&
    typeof question.explanation === 'string' &&
    (question.timeLimit === null ||
      (Number.isInteger(question.timeLimit) && question.timeLimit > 0))
  );
}

export function validateQuestionBank(bank = QUESTION_BANK) {
  if (!Array.isArray(bank) || bank.length === 0) return { valid: false, errors: ['O banco de perguntas está vazio.'] };
  const errors = [];
  const ids = new Set();
  bank.forEach((question, index) => {
    if (!isValidQuestion(question)) errors.push(`Pergunta inválida no índice ${index}.`);
    if (ids.has(question?.id)) errors.push(`ID duplicado: ${question.id}.`);
    ids.add(question?.id);
  });
  return { valid: errors.length === 0, errors };
}

export function setQuestionBank(bank, difficulty = 'normal') {
  const validation = validateQuestionBank(bank);
  if (!validation.valid) throw new Error(`Banco de perguntas inválido: ${validation.errors.join(' ')}`);
  activeQuestionBank = bank;
  activeQuestionDifficulty = difficulty === 'easy' ? 'easy' : 'normal';
  return activeQuestionBank;
}

export function getQuestionBank() {
  return activeQuestionBank;
}

function filterValues(value, type) {
  if (activeQuestionDifficulty === 'easy' && type === 'category') {
    return EASY_CATEGORY_ALIASES[value] ?? [value];
  }
  if (type === 'format' && value === 'code_completion') return ['multiple-choice'];
  return [value];
}

export function selectQuestion({
  state,
  bank = activeQuestionBank,
  difficulty,
  category,
  format,
  preferredQuestionId,
  previousQuestionId,
  allowUsedFallback = true
} = {}) {
  const validation = validateQuestionBank(bank);
  if (!validation.valid) return { question: null, error: 'INVALID_BANK', details: validation.errors };
  const used = new Set(Array.isArray(state?.usedQuestionIds) ? state.usedQuestionIds : []);
  const categories = category ? filterValues(category, 'category') : null;
  const formats = format ? filterValues(format, 'format') : null;
  const filtered = bank.filter(question =>
    (!difficulty || question.difficulty === difficulty) &&
    (!categories || categories.includes(question.category)) &&
    (!formats || formats.includes(question.format))
  );
  const preferred = preferredQuestionId
    ? filtered.find(question => question.id === preferredQuestionId && !used.has(question.id))
    : null;
  if (preferred) return { question: preferred, error: null };
  const unused = filtered.filter(question => !used.has(question.id));
  if (!unused.length && !allowUsedFallback) {
    return { question: null, error: 'NO_UNUSED_QUESTIONS_AVAILABLE' };
  }
  const candidates = unused.length ? unused : filtered.filter(question => question.id !== previousQuestionId);
  const pool = candidates.length ? candidates : filtered;
  if (!pool.length) return { question: null, error: 'NO_QUESTIONS_AVAILABLE' };
  const question = pool[Math.floor(Math.random() * pool.length)];
  return { question, error: null };
}

export function registerQuestionUse(state, questionId) {
  if (!state || typeof questionId !== 'string') return false;
  if (!Array.isArray(state.usedQuestionIds)) state.usedQuestionIds = [];
  if (!state.usedQuestionIds.includes(questionId)) state.usedQuestionIds.push(questionId);
  return true;
}

export function evaluateAnswer(question, answer, { timedOut = false } = {}) {
  if (!isValidQuestion(question)) return { result: 'wrong', correct: false, error: 'INVALID_QUESTION' };
  if (timedOut) return { result: 'timeout', correct: false, questionId: question.id };
  const selected = typeof answer === 'number'
    ? (Number.isInteger(answer) ? answer : null)
    : typeof answer === 'string' && /^(0|[1-9]\d*)$/.test(answer)
      ? Number(answer)
      : null;
  const correct = Number.isInteger(selected) && selected === question.answer;
  return { result: correct ? 'correct' : 'wrong', correct, questionId: question.id };
}

export { VALID_RESULTS };
