export const REASONING_STAGES = [
    'directInference', 'composition', 'discrimination', 'transfer',
    'counterfactual', 'synthesis', 'derivation',
] as const;

type ReasoningStage = typeof REASONING_STAGES[number];
type Track = Partial<Record<ReasoningStage, number>>;
const CORE_STAGES = REASONING_STAGES.slice(0, 3);

/** Advanced practice must be reachable before the proficiency it helps earn. */
export function eligibleReasoningStages(mastery: string, track: Track = {}): readonly ReasoningStage[] {
    if (mastery === 'unseen') {
        return ['directInference'];
    }

    const coreReady = CORE_STAGES.every(stage => (track[stage] ?? 0) >= 1)
    && CORE_STAGES.reduce((sum, stage) => sum + (track[stage] ?? 0), 0) >= 5;
    return mastery === 'learning' && !coreReady ? CORE_STAGES : REASONING_STAGES;
}

/** Finish unmastered stages before repeating a stage with three successes. */
export function practiceReasoningStages(mastery: string, track: Track = {}): readonly ReasoningStage[] {
    const eligible = eligibleReasoningStages(mastery, track);
    const unfinished = eligible.filter(stage => (track[stage] ?? 0) < 3);
    return unfinished.length ? unfinished : eligible;
}

/** Choose the least-practiced eligible stage; ties favor simpler reasoning. */
export function nextReasoningStage(mastery: string, track: Track = {}): ReasoningStage {
    return practiceReasoningStages(mastery, track).reduce((next, stage) =>
        (track[stage] ?? 0) < (track[next] ?? 0) ? stage : next);
}
