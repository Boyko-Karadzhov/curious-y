import type { ConceptNode, JourneyNode, LearningGraph } from '../_shared/journey.ts';
import { DEFAULT_SUBTOPIC_EXPLORATIONS } from '../_shared/subtopics.ts';
import { ANGLES, randomItem } from './curriculumRules.ts';
import { ANSWER_RULE, questionSchema, validateQuestionContent } from './questionContent.ts';
import { structured } from './structured.ts';
import { directDependencies, matchConcepts, prepareKnowledge, type ConceptMatch } from './curriculumContent.ts';
import { wouldCreatePrerequisiteCycle } from './curriculumDependencies.ts';

export type CurriculumExpansion = {
    rootId: string;
    nodes: JourneyNode[]
};

const identity = (title: string) => title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export async function createBoss(key: string, topic: string, graph: LearningGraph): Promise<CurriculumExpansion> {
    const angle = randomItem(ANGLES);
    const subtopic = randomItem(DEFAULT_SUBTOPIC_EXPLORATIONS[topic]);
    const assessment = await generateBoss(key, topic, angle, subtopic, graph);
    const boss = bossNode(topic, angle, subtopic, assessment);
    return {
        rootId: boss.id,
        nodes: [boss]
    };
}

async function generateBoss(key: string, topic: string, angle: string, subtopic: string, graph: LearningGraph) {
    return structured(key, `Create one meaningful question in ${topic}.
Selected subtopic: ${subtopic}. Selected ANGLE: ${angle}. Use exactly this subtopic and angle.
Ask a concrete prediction, comparison, causal explanation, counterfactual or evidence-based judgment that connects ideas. Avoid trivia and mere definition recall. The question need not start with Why. Make it worth studying its prerequisites. We will build those prerequisites AFTER saving this question; do not generate a curriculum now.
${ANSWER_RULE}`, questionSchema, value => uniqueBoss(value, graph));
}

function uniqueBoss(value: unknown, graph: LearningGraph) {
    const question = validateQuestionContent(value);
    if (graph.nodes.some(node => node.kind === 'boss' && identity(node.title) === identity(question.question))) {
        throw new Error('Choose a fresh boss question.');
    }

    return question;
}

function bossNode(topic: string, angle: string, subtopic: string, assessment: ReturnType<typeof validateQuestionContent>): JourneyNode {
    return {
        id: `boss-${crypto.randomUUID()}`,
        topic,
        topics: [topic],
        title: assessment.question,
        definition: assessment.correctAnswer.feedback,
        kind: 'boss',
        expanded: false,
        dimensions: {},
        requires: [],
        assessment,
        context: {
            angle,
            subtopic
        },
        preparation: {
            stage: 'dependencies',
            names: []
        }
    };
}

export async function expandNode(key: string, source: JourneyNode, graph: LearningGraph): Promise<CurriculumExpansion> {
    const node = structuredClone(source);
    if (!node.preparation) {
        return prepareConcept(key, node);
    }

    if (node.preparation.stage === 'dependencies') {
        return collectDependencies(key, node);
    }

    return resolveDependencies(key, node, graph);
}

async function prepareConcept(key: string, node: JourneyNode): Promise<CurriculumExpansion> {
    if (node.kind !== 'concept' || node.expanded !== false) {
        throw new Error('Only an unfinished concept can be prepared.');
    }

    const knowledge = await prepareKnowledge(key, node);
    node.dimensions = knowledge.dimensions ?? {};
    node.preparation = {
        stage: 'dependencies',
        names: knowledge.prerequisites
    };
    node.definition = knowledge.dimensions!.intuition!;
    return patch(node);
}

async function collectDependencies(key: string, node: JourneyNode): Promise<CurriculumExpansion> {
    const generated = await directDependencies(key, node);
    node.preparation = {
        stage: 'match',
        names: [...new Set([...node.preparation!.names, ...generated])]
    };
    return patch(node);
}

async function resolveDependencies(key: string, node: JourneyNode, graph: LearningGraph): Promise<CurriculumExpansion> {
    const names = node.preparation!.names;
    const matches = names.length ? await matchConcepts(key, names, graph.nodes) : [];
    const nodes = [node];
    applyMatches(matches, node, nodes, graph);
    finishNode(node);
    return {
        rootId: node.id,
        nodes
    };
}

function patch(node: JourneyNode): CurriculumExpansion {
    return {
        rootId: node.id,
        nodes: [node]
    };
}

function applyMatches(matches: ConceptMatch[], node: JourneyNode, patchNodes: JourneyNode[], graph: LearningGraph): void {
    for (const match of matches) {
        const parent = resolveMatch(match, patchNodes, graph, node.topic);
        const all = mergedNodes(graph.nodes, patchNodes);
        if (parent && !node.requires.some(edge => edge.nodeId === parent.id)
            && !wouldCreatePrerequisiteCycle(node, parent, all)) {
            node.requires.push({ nodeId: parent.id });
        }
    }
}

function resolveMatch(match: ConceptMatch, patchNodes: JourneyNode[], graph: LearningGraph, topic: string): JourneyNode | undefined {
    const all = mergedNodes(graph.nodes, patchNodes);
    const existing = all.find(node => node.kind === 'concept'
        && (node.id === match.existingId || identity(node.title) === identity(match.title || match.name)));
    if (existing || !match.needsLearning) {
        return existing;
    }

    const node = conceptNode(match, topic);
    patchNodes.push(node);
    return node;
}

function conceptNode(match: ConceptMatch, topic: string): ConceptNode {
    return {
        id: `concept-${crypto.randomUUID()}`,
        title: match.title,
        definition: match.definition,
        topic: match.topic,
        topics: [...new Set([match.topic, topic])],
        kind: 'concept',
        expanded: false,
        dimensions: {},
        requires: []
    };
}

function finishNode(node: JourneyNode): void {
    node.expanded = true;
    delete node.preparation;
}

function mergedNodes(saved: JourneyNode[], patchNodes: JourneyNode[]): JourneyNode[] {
    const patched = new Set(patchNodes.map(node => node.id));
    return [...saved.filter(node => !patched.has(node.id)), ...patchNodes];
}
