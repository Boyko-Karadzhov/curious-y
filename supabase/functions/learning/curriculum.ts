import { FACET_ORDER, validateJourneyPlan, type JourneyNode, type LearningGraph } from '../_shared/journey.ts';
import { DEFAULT_SUBTOPIC_EXPLORATIONS } from '../_shared/subtopics.ts';
import { ANGLES, randomItem } from './curriculumRules.ts';
import { ANSWER_RULE, questionSchema, validateQuestionContent } from './questionContent.ts';
import { structured } from './structured.ts';
import { directDependencies, matchConcepts, prepareKnowledge, type ConceptMatch } from './curriculumContent.ts';
import { wouldCreatePrerequisiteCycle } from './curriculumDependencies.ts';

type Work = { nodeId: string; stage: 'knowledge' | 'dependencies' | 'match'; names?: string[] };
export type CurriculumDraft = { topic: string; angle: string; subtopic: string; nodes: JourneyNode[]; queue: Work[] };

export function newDraft(topic: string): CurriculumDraft {
    return {
        topic,
        angle: randomItem(ANGLES),
        subtopic: randomItem(DEFAULT_SUBTOPIC_EXPLORATIONS[topic]),
        nodes: [],
        queue: []
    };
}

async function prepareBoss(key: string, draft: CurriculumDraft, graph: LearningGraph): Promise<void> {
    const assessment = await structured(key, `Create one meaningful synthesis BOSS question in ${draft.topic}.
Selected subtopic: ${draft.subtopic}. Selected ANGLE: ${draft.angle}. Use exactly this subtopic and angle.
Ask a concrete prediction, comparison, causal explanation, counterfactual or evidence-based judgment that connects ideas. Avoid trivia and mere definition recall. The question need not start with Why. Make it worth studying its prerequisites. We will build those prerequisites AFTER saving this question; do not generate a curriculum now.
${ANSWER_RULE}
List required concepts in assumedConcepts. Avoid repeating or paraphrasing these previous bosses: ${JSON.stringify(graph.nodes.filter(n => n.kind === 'boss').map(n => n.title))}`, questionSchema, value => {
        const question = validateQuestionContent(value);
        if (graph.nodes.filter(n => n.kind === 'boss').map(n => n.title)
            .some(title => title.toLowerCase() === question.question.toLowerCase())) {
            throw new Error('Choose a fresh boss question.');
        }

        return question;
    });
    const boss: JourneyNode = {
        id: `boss-${crypto.randomUUID()}`,
        topic: draft.topic,
        topics: [draft.topic],
        title: assessment.question,
        definition: assessment.knowledgeEntry,
        kind: 'boss',
        facets: ['mechanism'],
        requires: [],
        curriculum: {
            assessment,
            angle: draft.angle,
            subtopic: draft.subtopic
        }
    };
    draft.nodes.push(boss);
    draft.queue = [{
        nodeId: boss.id,
        stage: 'dependencies'
    }];
}

const identity = (title: string) => title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function resolveMatch(match: ConceptMatch, draft: CurriculumDraft, graph: LearningGraph): JourneyNode | undefined {
    const all = [...graph.nodes, ...draft.nodes];
    const existing = all.find(n => n.kind === 'concept' && (n.id === match.existingId || identity(n.title) === identity(match.title || match.name)));
    if (existing || !match.needsLearning) {
        return existing;
    }

    if (draft.nodes.length >= 129) {
        throw new Error('This curriculum exceeded the generation budget. Choose another topic or reset learning progress.');
    }

    const node: JourneyNode = {
        id: `concept-${crypto.randomUUID()}`,
        title: match.title,
        definition: match.definition,
        topic: match.topic,
        topics: [...new Set([match.topic, draft.topic])],
        kind: 'concept',
        facets: [...FACET_ORDER],
        requires: []
    };
    draft.nodes.push(node);
    draft.queue.push({
        nodeId: node.id,
        stage: 'knowledge'
    });
    return node;
}

function applyMatches(matches: ConceptMatch[], node: JourneyNode, draft: CurriculumDraft, graph: LearningGraph): void {
    for (const match of matches) {
        const parent = resolveMatch(match, draft, graph);
        if (parent && !node.requires.some(r => r.nodeId === parent.id)
            && !wouldCreatePrerequisiteCycle(node, parent, [...graph.nodes, ...draft.nodes])) {
            node.requires.push({
                nodeId: parent.id,
                facets: [...FACET_ORDER]
            });
        }
    }
}

async function advanceWork(key: string, draft: CurriculumDraft, graph: LearningGraph): Promise<void> {
    const work = draft.queue[0];
    const node = draft.nodes.find(n => n.id === work.nodeId)!;
    if (work.stage === 'knowledge') {
        const knowledge = await prepareKnowledge(key, node);
        node.curriculum = { dimensions: knowledge.dimensions };
        node.definition = knowledge.dimensions!.intuition!;
        work.names = knowledge.prerequisites;
        work.stage = 'dependencies';
        return;
    }

    await advanceDependencies(key, work, node, draft, graph);
}

async function advanceDependencies(key: string, work: Work, node: JourneyNode, draft: CurriculumDraft, graph: LearningGraph): Promise<void> {
    if (work.stage === 'dependencies') {
        work.names = [...new Set([...(work.names ?? []), ...await directDependencies(key, node)])];
        work.stage = 'match';
        return;
    }

    const matches = work.names?.length ? await matchConcepts(key, work.names, [...graph.nodes, ...draft.nodes]) : [];
    applyMatches(matches, node, draft, graph);
    draft.queue.shift();
}

/** One bounded stage per HTTP request; completed stages survive retries and browser reloads. */
export async function advanceCurriculum(key: string, saved: CurriculumDraft, graph: LearningGraph): Promise<CurriculumDraft> {
    const draft = structuredClone(saved);
    if (!draft.nodes.length) {
        await prepareBoss(key, draft, graph);
    } else if (draft.queue.length) {
        await advanceWork(key, draft, graph);
    }

    if (!draft.queue.length) {
        validateJourneyPlan({
            topic: draft.topic,
            nodes: draft.nodes
        }, draft.topic, graph.nodes);
    }

    return draft;
}
