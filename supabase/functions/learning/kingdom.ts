import { applyAction, battleSpeed, ARMY_SLOTS, BUILDING_DEFINITIONS, parseKingdom, isRecruitingBuilding, type ActionEntropy, type Action, type ArmySlots, type Kingdom } from '../_shared/kingdom.ts';

export interface KingdomSnapshot { state: Kingdom; revision: number; generation: number }
export interface CommandContext extends KingdomSnapshot { battle_clock: string | null; server_now: string }

export function parseKingdomCommand(value: unknown): Exclude<Action, { type: 'answer' }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Castle command.');
  const input = value as Record<string, unknown>;
  switch (input.type) {
    case 'recruit':
      if (typeof input.id !== 'string' || !isRecruitingBuilding(input.id)) throw new Error('Unknown recruitment building.');
      return { type: 'recruit', id: input.id };
    case 'lock':
      if (typeof input.id !== 'string' || typeof input.locked !== 'boolean' || typeof input.expected !== 'boolean') throw new Error('Invalid lock command.');
      return { type:'lock', id:input.id, locked:input.locked, expected:input.expected };
    case 'merge':
      if (typeof input.recipient !== 'string' || !Array.isArray(input.donors) || !input.donors.length
        || !input.donors.every(id => typeof id === 'string') || typeof input.expected !== 'string'
        || (input.replace !== undefined && typeof input.replace !== 'string')) throw new Error('Invalid merge preview.');
      return { type:'merge', recipient:input.recipient, donors:[...input.donors], expected:input.expected, ...(input.replace ? {replace:input.replace as string} : {}) };
    case 'army':
      if (!Array.isArray(input.slots) || input.slots.length !== ARMY_SLOTS
        || !input.slots.every(id => id === null || typeof id === 'string')) throw new Error('Invalid army slots.');
      return { type: 'army', slots: [...input.slots] as ArmySlots };
    case 'building':
      if (!BUILDING_DEFINITIONS.some(b => b.id === input.id && b.mode === 'purchase')) throw new Error('Unknown or non-purchasable building.');
      return { type: input.type, id: input.id as never };
    case 'start': case 'collect-battle':
      if (!Number.isSafeInteger(input.stage)) throw new Error('Invalid battle stage.');
      return { type: input.type, stage: input.stage as number };
    case 'castle': case 'tick': case 'retreat': return { type: input.type };
    default: throw new Error('Unsupported Castle command.');
  }
}

// Each mutation first catches combat up to database time. Repeated ticks without
// elapsed wall time do nothing. The frozen rules bound catch-up, including legacy battles.
export function executeKingdomCommand(context: CommandContext, command: Exclude<Action, { type: 'answer' }>, entropy?: ActionEntropy) {
  let state = parseKingdom(JSON.stringify(context.state));
  let clock = context.battle_clock;
  if (state.battle && !state.battle.result && clock) {
    const stepMs = state.battle.config.stepSeconds * 1000 / battleSpeed(state.battle.config.rulesVersion);
    const remainingSteps = Math.ceil((state.battle.config.maxSeconds - state.battle.elapsed) / state.battle.config.stepSeconds);
    const steps = Math.min(remainingSteps, Math.max(0, Math.floor((Date.parse(context.server_now) - Date.parse(clock)) / stepMs)));
    for (let i = 0; i < steps && state.battle && !state.battle.result; i++) state = applyAction(state, { type: 'tick' });
    clock = new Date(Date.parse(clock) + steps * stepMs).toISOString();
  }
  if (command.type !== 'tick') state = applyAction(state, command, entropy);
  if (command.type === 'start') clock = context.server_now;
  if (!state.battle || state.battle.result) clock = null;
  return { state: parseKingdom(JSON.stringify(state)), battleClock: clock };
}
