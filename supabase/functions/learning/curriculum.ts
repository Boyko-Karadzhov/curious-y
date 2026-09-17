import type { ConceptNode, JourneyNode, LearningGraph, Requirement } from '../_shared/journey.ts';
import { DEFAULT_SUBTOPIC_EXPLORATIONS } from '../_shared/subtopics.ts';
import { ANGLES, BASIC_CONCEPT_RULE, randomItem } from './curriculumRules.ts';
import { ANSWER_RULE, questionSchema, validateQuestionContent, type QuestionContent } from './questionContent.ts';
import { nonempty, objectSchema, stringSchema, structured } from './structured.ts';
import { prepareKnowledge } from './curriculumContent.ts';

export interface IConceptDependency {
    conceptTitle: string;
    conceptFormalDefinition: string;
    conceptIntuition: string;
    dependencies: IConceptDependency[]
}

export type CurriculumExpansion = {
    rootId: string;
    nodes: JourneyNode[]
};

type BossPlan = QuestionContent & { dependencies: IConceptDependency[] };
type DependencyContext = {
    existing: Map<string, ConceptNode>;
    additions: Map<string, ConceptNode>;
    topic: string
};

const MAX_DEPENDENCY_DEPTH = 10;
const MAX_DEPENDENCIES = 128;
const identity = (title: string) => title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const requirements = (nodes: JourneyNode[]): Requirement[] => [...new Set(nodes.map(node => node.id))].map(nodeId => ({ nodeId }));
const mergeRequirements = (current: Requirement[], added: Requirement[]): Requirement[] =>
    [...new Map([...current, ...added].map(edge => [edge.nodeId, edge])).values()];

function dependencySchema(depth = 0): Record<string, unknown> {
    const dependencies = depth === MAX_DEPENDENCY_DEPTH
        ? {
            type: 'ARRAY',
            items: objectSchema({}),
            maxItems: 0
        }
        : {
            type: 'ARRAY',
            items: dependencySchema(depth + 1),
            maxItems: 20
        };
    return objectSchema({
        conceptTitle: stringSchema,
        conceptFormalDefinition: stringSchema,
        conceptIntuition: stringSchema,
        dependencies
    });
}

const bossPlanSchema = objectSchema({
    ...questionSchema.properties,
    dependencies: {
        type: 'ARRAY',
        items: dependencySchema(1),
        maxItems: 20
    }
});

export async function createBoss(key: string, topic: string, graph: LearningGraph): Promise<CurriculumExpansion> {
    const angle = randomItem(ANGLES);
    const subtopic = randomItem(DEFAULT_SUBTOPIC_EXPLORATIONS[topic]);
    const plan = await generateBoss(key, topic, angle, subtopic, graph);
    return buildBossExpansion(topic, angle, subtopic, plan, graph);
}

async function generateBoss(key: string, topic: string, angle: string, subtopic: string, graph: LearningGraph): Promise<BossPlan> {
    const existing = graph.nodes.filter(node => node.kind === 'concept').map(node => ({
        conceptTitle: node.title,
        conceptFormalDefinition: node.definition,
        conceptIntuition: node.dimensions.intuition
    }));
    return structured(key, `Create one meaningful question in ${topic} and its COMPLETE prerequisite concept tree in one response.
Selected subtopic: ${subtopic}. Selected ANGLE: ${angle}. Use exactly this subtopic and angle.
Ask a concrete prediction, comparison, causal explanation, counterfactual or evidence-based judgment that connects ideas. Avoid trivia and mere definition recall. The question need not start with Why.
For each direct prerequisite return an IConceptDependency with conceptTitle, conceptFormalDefinition, conceptIntuition, and its direct dependencies. Recursively continue until every leaf needs no separately studied prerequisite under this rule: ${BASIC_CONCEPT_RULE}
Return direct dependencies only at each level, never the target itself or downstream ideas. Use dependencies: [] for every leaf. Maximum ${MAX_DEPENDENCIES} distinct concepts and ${MAX_DEPENDENCY_DEPTH} dependency levels.
Reuse an exact conceptTitle from this existing graph whenever its meaning matches; do not generate children for a reused concept: ${JSON.stringify(existing)}.
${ANSWER_RULE}`, bossPlanSchema, value => validateBossPlan(value, graph), false);
}

function validateBossPlan(value: unknown, graph: LearningGraph): BossPlan {
    const assessment = validateQuestionContent(value);
    const dependencies = (value as BossPlan)?.dependencies;
    if (!Array.isArray(dependencies)) {
        throw new Error('Return the complete dependency tree.');
    }

    validateDependencies(dependencies);
    validateDependencyGraph(dependencies, graph);
    if (graph.nodes.some(node => node.kind === 'boss' && identity(node.title) === identity(assessment.question))) {
        throw new Error('Choose a fresh boss question.');
    }

    return {
        ...assessment,
        dependencies
    };
}

function validateDependencies(dependencies: IConceptDependency[]): void {
    const state = { count: 0 };
    dependencies.forEach(dependency => validateDependency(dependency, 1, new Set(), state));
}

function validateDependency(dependency: IConceptDependency, depth: number, path: Set<string>, state: { count: number }): void {
    if (!dependency || !nonempty(dependency.conceptTitle, 200)
        || !nonempty(dependency.conceptFormalDefinition, 1800) || !nonempty(dependency.conceptIntuition, 1600)
        || !Array.isArray(dependency.dependencies)) {
        throw new Error('Every dependency needs a title, formal definition, intuition and dependencies.');
    }

    const key = identity(dependency.conceptTitle);
    if (!key || path.has(key) || depth > MAX_DEPENDENCY_DEPTH || ++state.count > MAX_DEPENDENCIES) {
        throw new Error('The dependency tree must be finite, acyclic and within its size limit.');
    }

    const nextPath = new Set(path).add(key);
    dependency.dependencies.forEach(child => validateDependency(child, depth + 1, nextPath, state));
}

function validateDependencyGraph(dependencies: IConceptDependency[], graph: LearningGraph): void {
    const existing = new Set(graph.nodes.filter(node => node.kind === 'concept').map(node => identity(node.title)));
    const edges = new Map<string, Set<string>>();
    dependencies.forEach(dependency => collectDependencyEdges(dependency, edges, existing));
    const visited = new Set<string>();
    if ([...edges.keys()].some(key => hasCycle(key, edges, new Set(), visited))) {
        throw new Error('The dependency tree becomes cyclic after equivalent concepts are merged.');
    }
}

function collectDependencyEdges(dependency: IConceptDependency, edges: Map<string, Set<string>>, existing: Set<string>): void {
    const key = identity(dependency.conceptTitle);
    if (existing.has(key)) {
        return;
    }

    const children = dependency.dependencies.map(child => identity(child.conceptTitle));
    edges.set(key, new Set([...edges.get(key) ?? [], ...children]));
    dependency.dependencies.forEach(child => collectDependencyEdges(child, edges, existing));
}

function hasCycle(key: string, edges: Map<string, Set<string>>, path: Set<string>, visited: Set<string>): boolean {
    if (path.has(key)) {
        return true;
    }

    if (visited.has(key)) {
        return false;
    }

    const nextPath = new Set(path).add(key);
    const cyclic = [...edges.get(key) ?? []].some(child => hasCycle(child, edges, nextPath, visited));
    visited.add(key);
    return cyclic;
}

function buildBossExpansion(topic: string, angle: string, subtopic: string, plan: BossPlan, graph: LearningGraph): CurriculumExpansion {
    const context: DependencyContext = {
        existing: new Map(graph.nodes.filter((node): node is ConceptNode => node.kind === 'concept').map(node => [identity(node.title), node])),
        additions: new Map(),
        topic
    };
    const parents = plan.dependencies.map(dependency => resolveDependency(dependency, context));
    const boss = bossNode(topic, angle, subtopic, plan, parents);
    return {
        rootId: boss.id,
        nodes: [boss, ...context.additions.values()]
    };
}

function resolveDependency(dependency: IConceptDependency, context: DependencyContext): ConceptNode {
    const key = identity(dependency.conceptTitle);
    const existing = context.existing.get(key);
    if (existing) {
        return existing;
    }

    const node = context.additions.get(key) ?? conceptNode(dependency, context.topic);
    context.additions.set(key, node);
    const added = requirements(dependency.dependencies.map(child => resolveDependency(child, context)));
    node.requires = mergeRequirements(node.requires, added);
    return node;
}

function conceptNode(dependency: IConceptDependency, topic: string): ConceptNode {
    return {
        id: `concept-${crypto.randomUUID()}`,
        title: dependency.conceptTitle,
        definition: dependency.conceptFormalDefinition,
        topic,
        topics: [topic],
        kind: 'concept',
        expanded: false,
        dimensions: {
            intuition: dependency.conceptIntuition,
            precision: dependency.conceptFormalDefinition
        },
        requires: []
    };
}

function bossNode(topic: string, angle: string, subtopic: string, plan: BossPlan, parents: ConceptNode[]): JourneyNode {
    const assessment: QuestionContent = {
        question: plan.question,
        correctAnswer: plan.correctAnswer,
        wrongAnswers: plan.wrongAnswers,
        explanation: plan.explanation,
        suggestedQuestions: plan.suggestedQuestions
    };
    return {
        id: `boss-${crypto.randomUUID()}`,
        topic,
        topics: [topic],
        title: assessment.question,
        definition: assessment.correctAnswer.feedback,
        kind: 'boss',
        expanded: true,
        dimensions: {},
        requires: requirements(parents),
        assessment,
        context: {
            angle,
            subtopic
        }
    };
}

export async function expandNode(key: string, source: JourneyNode, _graph: LearningGraph): Promise<CurriculumExpansion> {
    if (source.kind !== 'concept' || source.expanded !== false) {
        throw new Error('Only an unfinished concept can be expanded.');
    }

    const node = structuredClone(source);
    node.dimensions = await prepareKnowledge(key, node);
    node.expanded = true;
    return {
        rootId: node.id,
        nodes: [node]
    };
}
