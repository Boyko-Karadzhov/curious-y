import type { CurriculumDraft } from './curriculum.ts';
import { CurriculumCycleError } from './curriculumDependencies.ts';

/** Discard the failed stage's mutations, retaining all previously prepared branches. */
export function recoverCycle(saved: CurriculumDraft, error: unknown): CurriculumDraft {
    if (!(error instanceof CurriculumCycleError)) {
        throw error;
    }

    const draft = structuredClone(saved);
    const work = draft.queue[0];
    const node = draft.nodes.find(n => n.id === work?.nodeId);
    if (!work || !node || node.kind === 'boss' || (work.repairs ?? 0) >= 2) {
        return restartProposal(draft, error);
    }

    draft.queue[0] = { nodeId: work.nodeId, stage: 'knowledge', repairs: (work.repairs ?? 0) + 1, feedback: error.message };
    return draft;
}

function restartProposal(draft: CurriculumDraft, error: CurriculumCycleError): CurriculumDraft {
    if ((draft.restarts ?? 0) >= 2) {
        throw new Error('We could not prepare a coherent learning path after several repairs. Your progress is saved. Please try another topic or retry later.');
    }

    return {
        ...draft, nodes: [], queue: [{ nodeId: 'pending-boss', stage: 'boss', feedback: error.message }],
        restarts: (draft.restarts ?? 0) + 1,
        rejectedBosses: [...draft.rejectedBosses ?? [], ...draft.nodes.filter(n => n.kind === 'boss').map(n => n.title)],
    };
}
