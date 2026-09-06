import { BUILDING_DEFINITIONS, BuildingId, Kingdom, MAX_LEVEL, UpgradeAction, upgradeStatus } from './game';

// A target level is a preference, never evidence of ownership, balances, or eligibility.
export type ProgressionGoal = { type: 'castle'; level: number } | { type: 'building'; id: BuildingId; level: number };
export const goalStorageKey = (account: string) => `curious_y_goal_v1_${account}`;

export function parseGoal(value: unknown): ProgressionGoal | null {
  if (!value || typeof value !== 'object') return null;
  const goal = value as ProgressionGoal;
  if (!Number.isSafeInteger(goal.level) || goal.level < 1 || goal.level > MAX_LEVEL) return null;
  if (goal.type === 'castle' && goal.level >= 2) return { type: 'castle', level: goal.level };
  if (goal.type === 'building' && BUILDING_DEFINITIONS.some(b => b.id === goal.id && b.mode === 'purchase' && goal.level <= b.cap)) return { type: 'building', id: goal.id, level: goal.level };
  return null;
}

export function goalTitle(goal: ProgressionGoal) {
  if (goal.type === 'castle') return `Upgrade Castle to level ${goal.level}`;
  const name = BUILDING_DEFINITIONS.find(b => b.id === goal.id)!.name;
  return goal.level === 1 ? `Build ${name}` : `Upgrade ${name} to level ${goal.level}`;
}

export function goalOptions(state: Kingdom): ProgressionGoal[] {
  return [
    ...BUILDING_DEFINITIONS.filter(b => b.mode === 'purchase' && state.buildings[b.id] < b.cap).map(b => ({ type: 'building' as const, id: b.id, level: state.buildings[b.id] + 1 })),
    ...(state.castle < MAX_LEVEL ? [{ type: 'castle' as const, level: state.castle + 1 }] : []),
  ];
}

export function goalProgress(state: Kingdom, goal: ProgressionGoal) {
  const current = goal.type === 'castle' ? state.castle : state.buildings[goal.id];
  const action: UpgradeAction = goal.type === 'castle' ? { type: 'castle' } : { type: 'building', id: goal.id };
  return { ...upgradeStatus(state, action), action, complete: current >= goal.level, invalid: current + 1 < goal.level };
}
