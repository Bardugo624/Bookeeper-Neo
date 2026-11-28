import type { Target } from '../engine/protocol';

/** The «Torna al …» after a jump: where the person was. */
export interface Jump {
  target: Target;
  percent: number;
  forwardTurns: number;
}
export const JUMP_FORWARD_TURNS = 2;

export function jumpFrom(target: Target, percent: number): Jump {
  return { target, percent, forwardTurns: 0 };
}

export function afterTurn(jump: Jump, direction: 'next' | 'prev'): Jump {
  return direction === 'next' ? { ...jump, forwardTurns: jump.forwardTurns + 1 } : jump;
}

export function isExpired(jump: Jump): boolean {
  return jump.forwardTurns >= JUMP_FORWARD_TURNS;
}
