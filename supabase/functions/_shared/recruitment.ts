import tuning from './recruitment-tuning.json' with { type: 'json' };
import { unitDefinition, UNITS, type UnitId } from './units.ts';

export const RECRUITMENT = tuning;
export type RecruitingBuilding = keyof typeof tuning.topics;
export type UnitFamily = 'barracks' | 'range' | 'stable' | 'academy' | 'workshop';
export interface Recruit { unitId: UnitId; investedXP: number; locked: boolean }
export type Recruits = Record<string, Recruit>;
export const isRecruitingBuilding = (id: string): id is RecruitingBuilding => Object.prototype.hasOwnProperty.call(tuning.topics, id);
export function safeXP(n: number) {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('XP or count exceeds safe integer limits.');
  return n;
}
export const recruitmentLevel = (count: number) => Math.min(tuning.buildingCap, 1 + Math.floor(safeXP(count) / tuning.actionsPerLevel));
export const innateXP = (id: UnitId) => tuning.innateXP * 3 ** (unitDefinition(id).tier - 1);
// BigInt comparisons keep inverse-formula boundary corrections exact near MAX_SAFE_INTEGER.
const thresholdExact = (level: number, id: UnitId) => BigInt(tuning.thresholdFactor * 3 ** (unitDefinition(id).tier - 1)) * BigInt(level - 1) * BigInt(level + 2);
export function xpThreshold(level: number, id: UnitId) {
  if (!Number.isSafeInteger(level) || level < 1) throw new Error('Invalid unit level.');
  return safeXP(Number(thresholdExact(level, id)));
}
export function recruitLevel(r: Recruit) {
  const xp = BigInt(safeXP(r.investedXP));
  let level = Math.max(1, Math.floor((Math.sqrt(9 + 4 * r.investedXP / (tuning.thresholdFactor * 3 ** (unitDefinition(r.unitId).tier - 1))) - 1) / 2));
  while (thresholdExact(level, r.unitId) > xp) level--;
  while (thresholdExact(level + 1, r.unitId) <= xp) level++;
  return level;
}
export function xpProgress(r: Recruit) {
  const level = recruitLevel(r), base = thresholdExact(level, r.unitId), next = thresholdExact(level + 1, r.unitId);
  return { level, current: Number(BigInt(r.investedXP) - base), required: Number(next - base) };
}
export const trainingMultiplier = (level: number) => 1 + tuning.trainingPerLevel * (level - 1);

// erfc approximation evaluated on the positive tail, avoiding 1-CDF cancellation.
function normalTail(z: number): number {
  if (z === 0) return .5;
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + .5 * x);
  const tail = .5 * t * Math.exp(-x*x - 1.26551223 + t*(1.00002368 + t*(.37409196 + t*(.09678418 + t*(-.18628806 + t*(.27886807 + t*(-1.13520398 + t*(1.48851587 + t*(-.82215223 + t*.17087277)))))))));
  return z >= 0 ? tail : 1 - tail;
}
export function recruitmentOdds(level: number): number[] {
  if (!Number.isInteger(level) || level < 1 || level > tuning.buildingCap) throw new Error('Invalid recruitment level.');
  if (level === 1) return [1,0,0,0,0];
  const anchors = tuning.meanAnchors;
  const high = anchors.findIndex(a => a[0] >= level);
  const [b, y] = anchors[high], [a, x] = anchors[Math.max(0, high - 1)];
  const mean = a === b ? y : x + (y-x) * (level-a)/(b-a);
  const bounds = [1.5,2.5,3.5,4.5];
  return [normalTail((mean-1.5)/tuning.standardDeviation), ...bounds.slice(0,3).map((lo,i) => {
    const hi = bounds[i+1];
    return lo >= mean ? normalTail((lo-mean)/tuning.standardDeviation)-normalTail((hi-mean)/tuning.standardDeviation)
      : normalTail((mean-hi)/tuning.standardDeviation)-normalTail((mean-lo)/tuning.standardDeviation);
  }), normalTail((4.5-mean)/tuning.standardDeviation)];
}
export const formatOdds = (p: number) => p === 0 ? '0%' : p < .0001 ? '<0.01%' : `${(p*100).toFixed(2)}%`;
export function rollRecruit(building: UnitFamily, level: number, draw: number): UnitId {
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('Invalid random draw.');
  const odds = recruitmentOdds(level);
  // Walk from upper tail: tiny nonzero high tiers remain sampleable with draw=0.
  let cumulative = 0;
  for (let tier = 5; tier >= 1; tier--) {
    cumulative += odds[tier-1];
    if (draw < cumulative || tier === 1) return UNITS.find(u => u.building === building && u.tier === tier)!.id;
  }
  throw new Error('Invalid distribution.');
}
export interface RosterState { units: Recruits; armySlots: (string | null)[] }
// Recruitment and legacy conversion share the same mandatory class merge.
// Keep an existing equal-tier recipient; a higher tier inherits every donor's XP.
export function mergeClass(s: RosterState, building: UnitFamily) {
  const members = Object.entries(s.units).filter(([, r]) => unitDefinition(r.unitId).building === building);
  if (!members.length) return null;
  const [recipient, kept] = members.reduce((best, entry) =>
    unitDefinition(entry[1].unitId).tier > unitDefinition(best[1].unitId).tier ? entry : best);
  let gainedXP = 0;
  const donorCounts: Partial<Record<UnitId, number>> = {};
  const ids = new Set(members.map(([id]) => id));
  for (const [id, donor] of members) if (id !== recipient) {
    gainedXP = safeXP(gainedXP + innateXP(donor.unitId) + donor.investedXP);
    donorCounts[donor.unitId] = (donorCounts[donor.unitId] ?? 0) + 1;
  }
  const after = { ...kept, locked: false, investedXP: safeXP(kept.investedXP + gainedXP) };
  safeXP(after.investedXP + innateXP(after.unitId));
  const slot = s.armySlots.findIndex(id => id !== null && ids.has(id));
  s.armySlots.forEach((id, index) => {
    if (id !== null && ids.has(id)) s.armySlots[index] = index === slot ? recipient : null;
  });
  for (const [id] of members) delete s.units[id];
  s.units[recipient] = after;
  return { recipient, unitId: after.unitId, gainedXP, beforeLevel: recruitLevel(kept), donorCounts, ...xpProgress(after) };
}
