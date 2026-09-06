import tuning from './recruitment-tuning.json' with { type: 'json' };
import { unitDefinition, UNITS, type UnitId } from './units.ts';

export const RECRUITMENT = tuning;
export type RecruitingBuilding = keyof typeof tuning.topics;
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
export function rollRecruit(building: RecruitingBuilding, level: number, draw: number): UnitId {
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
export interface MergeIntent { recipient: string; donors: string[]; expected: string; replace?: string }
export interface RosterState { units: Recruits; armySlots: (string | null)[] }
export function mergeFingerprint(s: RosterState, recipient: string, donors: string[]) {
  return JSON.stringify([recipient, ...donors].map(id => [id, s.units[id] ? [s.units[id].unitId,s.units[id].investedXP,s.units[id].locked] : null, s.armySlots.indexOf(id)]));
}
export function spareDonors(s: RosterState, recipient: string) {
  const r = s.units[recipient], spec = unitDefinition(r.unitId);
  return Object.entries(s.units).filter(([id,d]) => id !== recipient && !d.locked && d.investedXP === 0 && !s.armySlots.includes(id)
    && unitDefinition(d.unitId).building === spec.building && unitDefinition(d.unitId).tier <= spec.tier).map(([id]) => id);
}
export function previewMerge(s: RosterState, intent: MergeIntent) {
  const r = s.units[intent.recipient];
  if (!r || !intent.donors.length || new Set(intent.donors).size !== intent.donors.length || intent.donors.includes(intent.recipient)) throw new Error('Choose a recipient and unique donors.');
  if (mergeFingerprint(s,intent.recipient,intent.donors) !== intent.expected) throw new Error('Merge preview changed. Preview again.');
  let gainedXP = 0;
  const counts: Partial<Record<UnitId, number>> = {};
  for (const id of intent.donors) {
    const d = s.units[id];
    if (!d || d.locked || unitDefinition(d.unitId).building !== unitDefinition(r.unitId).building) throw new Error('Donors must be unlocked recruits from the same building.');
    if (s.armySlots.includes(id) && intent.replace !== id) throw new Error('Use Merge and replace for an equipped donor.');
    gainedXP = safeXP(gainedXP + innateXP(d.unitId) + d.investedXP);
    counts[d.unitId] = (counts[d.unitId] ?? 0) + 1;
  }
  if (intent.replace && (!intent.donors.includes(intent.replace) || !s.armySlots.includes(intent.replace) || s.armySlots.includes(intent.recipient))) throw new Error('Replacement needs an equipped donor and unequipped recipient.');
  if (intent.replace && s.armySlots.some(id => id && id !== intent.replace && s.units[id].unitId === r.unitId)) throw new Error('This unit type is already equipped.');
  const after = { ...r, investedXP: safeXP(r.investedXP + gainedXP) };
  safeXP(after.investedXP + innateXP(after.unitId));
  return { gainedXP, counts, beforeLevel: recruitLevel(r), after, ...xpProgress(after) };
}
