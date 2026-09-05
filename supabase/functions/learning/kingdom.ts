import { applyAction, parseKingdom, type Action, type Kingdom } from '../_shared/kingdom.ts';

export interface KingdomSnapshot { state: Kingdom; revision: number; generation: number }
export interface CommandContext extends KingdomSnapshot { battle_clock: string | null; server_now: string }

export function parseKingdomCommand(value: unknown): Exclude<Action, { type: 'answer' }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Castle command.');
  const input = value as Record<string, unknown>;
  switch (input.type) {
    case 'building':
      if (!['barracks', 'range', 'stable', 'workshop'].includes(String(input.id))) throw new Error('Unknown building.');
      return { type: input.type, id: input.id as never };
    case 'start':
      if (!Number.isSafeInteger(input.stage)) throw new Error('Invalid battle stage.');
      return { type: 'start', stage: input.stage as number };
    case 'castle': case 'tick': case 'retreat': return { type: input.type };
    default: throw new Error('Unsupported Castle command.');
  }
}

// Each mutation first catches combat up to database time. Repeated ticks without
// elapsed wall time do nothing. A bounded 480 steps resolves any complete battle.
export function executeKingdomCommand(context: CommandContext, command: Exclude<Action, { type: 'answer' }>) {
  let state = parseKingdom(JSON.stringify(context.state));
  let clock = context.battle_clock;
  if (state.battle && !state.battle.result && clock) {
    const steps = Math.min(480, Math.max(0, Math.floor((Date.parse(context.server_now) - Date.parse(clock)) / 250)));
    for (let i = 0; i < steps && state.battle && !state.battle.result; i++) state = applyAction(state, { type: 'tick' });
    clock = new Date(Date.parse(clock) + steps * 250).toISOString();
  }
  if (command.type !== 'tick') state = applyAction(state, command);
  if (command.type === 'start') clock = context.server_now;
  if (!state.battle || state.battle.result) clock = null;
  return { state: parseKingdom(JSON.stringify(state)), battleClock: clock };
}
