import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleJourney } from '../../supabase/functions/learning/journey';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
import type { JourneyNode, LearningGraph } from '../../supabase/functions/_shared/journey';

describe('Question generation through the Gemini transport', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each(['omitted', 'IDs instead of titles'])('issues a question when prerequisite display names are %s', async labels => {
        const plan = starterJourney('Life');
        for (const node of plan.nodes) {
            if (labels === 'omitted') {
                delete node.prerequisiteConcepts;
            } else {
                node.prerequisiteConcepts = node.requires.map(r => r.nodeId);
            }
        }
        const question = {
            question: 'What can food supply for movement?',
            options: ['Chemical energy', 'New energy from nothing', 'A replacement for air', 'A replacement for rest'],
            correctIndex: 0, explanation: 'Food contains chemical energy that cells can use.',
            knowledgeEntry: 'Food supplies chemical energy for activity.',
            optionFeedback: ['Food supplies energy.', 'Energy is transferred, not created.', 'Air still matters.', 'Rest still matters.'],
            assumedConcepts: [], suggestedQuestions: [],
        };
        const replies = [plan, { blockers: [], suggestions: [] }, question];
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(replies.shift()) }] } }],
        })));
        vi.stubGlobal('fetch', fetchMock);
        const graph: LearningGraph & { generation: number } = { nodes: [], progress: {}, generation: 0 };
        const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
            let data: unknown = true;
            if (name === 'load_learning_graph') {
                data = graph;
            }
            if (name === 'save_graph_expansion') {
                const nodes = args.p_nodes as JourneyNode[];
                // Match the database's storage contract, including exact derived titles.
                for (const n of nodes) {
                    expect(n.prerequisiteConcepts).toEqual(n.requires.map(r => nodes.find(p => p.id === r.nodeId)!.title));
                }
                graph.nodes.push(...nodes); data = graph;
            }
            if (name === 'begin_graph_question') {
                data = { lease: 'lease', generation: 0, graph, node: graph.nodes.find(n => n.id === args.p_node) };
            }
            if (name === 'graph_question_history') {
                data = [];
            }
            if (name === 'finish_graph_question') {
                data = { id: 'issued', ...args.p_question as object };
            }
            return { data, error: null };
        }) };
        const result = await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, async () => 'test-key');
        expect(result).toMatchObject({ questionRow: { id: 'issued', question_text: question.question } });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        const request = JSON.parse((fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1].body as string);
        const nodeSchema = request.generationConfig.responseSchema.properties.nodes.items;
        expect(nodeSchema.properties).not.toHaveProperty('prerequisiteConcepts');
        expect(nodeSchema.required).not.toContain('prerequisiteConcepts');
        expect(db.rpc).toHaveBeenLastCalledWith('cancel_question_generation', expect.objectContaining({ p_lease: 'lease' }));
    });
});
