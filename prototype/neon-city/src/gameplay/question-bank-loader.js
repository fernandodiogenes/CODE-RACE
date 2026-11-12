const QUESTION_BANK_URLS = Object.freeze({
  easy: new URL('./question-banks/easy/question-bank-easy.json', import.meta.url),
  normal: new URL('./question-banks/normal/question-bank.json', import.meta.url)
});

export const QUESTION_BANK_DIFFICULTIES = Object.freeze(['easy', 'normal']);

export function normalizeQuestionDifficulty(value) {
  return QUESTION_BANK_DIFFICULTIES.includes(value) ? value : 'normal';
}

export async function loadQuestionBank(difficulty = 'normal') {
  const normalizedDifficulty = normalizeQuestionDifficulty(difficulty);
  const response = await fetch(QUESTION_BANK_URLS[normalizedDifficulty]);
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o banco ${normalizedDifficulty}.`);
  }
  const bank = await response.json();
  if (!Array.isArray(bank) || !bank.length) {
    throw new Error(`O banco ${normalizedDifficulty} está vazio ou inválido.`);
  }
  return bank;
}
