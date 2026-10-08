export type Move = 'rock' | 'paper' | 'scissors';
export type Result = 'win' | 'lose' | 'draw';

export const MOVES: Record<Move, { label: string; emoji: string }> = {
  rock: { label: 'Rock', emoji: '✊' },
  paper: { label: 'Paper', emoji: '✋' },
  scissors: { label: 'Scissors', emoji: '✌️' },
};

export function randomMove(): Move {
  const moves: Move[] = ['rock', 'paper', 'scissors'];
  return moves[Math.floor(Math.random() * moves.length)];
}

export function getResult(player: Move, computer: Move): Result {
  if (player === computer) return 'draw';
  if (
    (player === 'rock' && computer === 'scissors') ||
    (player === 'paper' && computer === 'rock') ||
    (player === 'scissors' && computer === 'paper')
  ) return 'win';
  return 'lose';
}

export function resultLabel(result: Result) {
  if (result === 'win') return 'YOU WIN';
  if (result === 'lose') return 'COMPUTER WINS';
  return 'DRAW';
}
