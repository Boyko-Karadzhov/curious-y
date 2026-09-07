import { BUILDING_DEFINITIONS, isRecruitingBuilding, recruitmentCost, missingCost, canAfford, type RecruitingBuilding, BuildingId, Kingdom, MAX_LEVEL, UpgradeAction, upgradeStatus } from './game';

// A target level is a preference, never evidence of ownership, balances, or eligibility.
export type ProgressionGoal = { type: 'castle'; level: number } | { type: 'building'; id: BuildingId; level: number } | {type:'recruit';id:RecruitingBuilding;count:number};
export const goalStorageKey = (account: string) => `curious_y_goal_v1_${account}`;
export const PROGRESS_RESET = 'curious-y-progress-reset';
export const initialGoal: ProgressionGoal = { type: 'building', id: 'barracks', level: 1 };

export function parseGoal(value: unknown): ProgressionGoal | null {
  if (!value || typeof value !== 'object') return null;
  const goal = value as ProgressionGoal;
  if (goal.type === 'recruit') return isRecruitingBuilding(goal.id) && Number.isSafeInteger(goal.count) && goal.count > 0 ? {type:'recruit',id:goal.id,count:goal.count} : null;
  if (!Number.isSafeInteger(goal.level) || goal.level < 1 || goal.level > MAX_LEVEL) return null;
  if (goal.type === 'castle' && goal.level >= 2) return { type: 'castle', level: goal.level };
  if (goal.type === 'building' && BUILDING_DEFINITIONS.some(b => b.id === goal.id && b.mode === 'purchase' && goal.level <= (isRecruitingBuilding(b.id) || b.id === 'forge' ? 1 : b.cap))) return { type: 'building', id: goal.id, level: goal.level };
  return null;
}

export function goalTitle(goal: ProgressionGoal) {
  if (goal.type === 'castle') return `Upgrade Castle to level ${goal.level}`;
  const name = BUILDING_DEFINITIONS.find(b => b.id === goal.id)!.name;
  if (goal.type === 'recruit') return `Recruit at ${name} · pack ${goal.count}`;
  return goal.level === 1 ? `Build ${name}` : `Upgrade ${name} to level ${goal.level}`;
}

export function goalOptions(state: Kingdom): ProgressionGoal[] {
  return [
    ...BUILDING_DEFINITIONS.filter(b=>isRecruitingBuilding(b.id) && state.buildings[b.id]>0).map(b=>({type:'recruit' as const,id:b.id as RecruitingBuilding,count:state.recruitCount[b.id as RecruitingBuilding]+1})),
    ...BUILDING_DEFINITIONS.filter(b => b.mode === 'purchase' && state.buildings[b.id] < (isRecruitingBuilding(b.id) || b.id === 'forge' ? 1 : b.cap)).map(b => ({ type: 'building' as const, id: b.id, level: state.buildings[b.id] + 1 })),
    ...(state.castle < MAX_LEVEL ? [{ type: 'castle' as const, level: state.castle + 1 }] : []),
  ];
}

export function goalProgress(state: Kingdom, goal: ProgressionGoal) {
  if (goal.type === 'recruit') {
    const cost=recruitmentCost(goal.id),affordable=canAfford(state,cost),blocker=state.buildings[goal.id] ? null : 'Construct this building first.';
    return {cost,missing:missingCost(state,cost),requiredCastle:BUILDING_DEFINITIONS.find(b=>b.id===goal.id)!.unlock,blocker,affordable,ready:!blocker&&affordable,action:{type:'building' as const,id:goal.id},complete:state.recruitCount[goal.id]>=goal.count,invalid:state.recruitCount[goal.id]+1<goal.count};
  }
  const current = goal.type === 'castle' ? state.castle : state.buildings[goal.id];
  const action: UpgradeAction = goal.type === 'castle' ? { type: 'castle' } : { type: 'building', id: goal.id };
  return { ...upgradeStatus(state, action), action, complete: current >= goal.level, invalid: current + 1 < goal.level };
}
