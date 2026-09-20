import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleJourney } from '../../supabase/functions/learning/journey';
import { preparedJourney as starterJourney, sampleQuestion } from './fixtures/preparedJourney';
import type { JourneyNode, LearningGraph } from '../../supabase/functions/_shared/journey';

describe('Question generation through the Gemini transport', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('issues a question using prerequisite edges', async () => {
        const plan = starterJourney('Life');

        const question = sampleQuestion();
        const replies = [question];
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({candidates: [{ content: { parts: [{ text: JSON.stringify(replies.shift()) }] } }],})));
        vi.stubGlobal('fetch', fetchMock);
        const graph: LearningGraph & { generation: number } = {
            nodes: plan.nodes,
            progress: {},
            generation: 0
        };
        const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
            let data: unknown = true;
            if (name === 'load_learning_graph') {
                data = graph;
            }

            if (name === 'save_graph_expansion') {
                const nodes = args.p_nodes as JourneyNode[];
                graph.nodes.push(...nodes); data = graph;
            }

            if (name === 'begin_graph_question') {
                data = {
                    lease: 'lease',
                    generation: 0,
                    node: graph.nodes.find(n => n.id === args.p_node)
                };
            }

            if (name === 'graph_question_history') {
                data = [];
            }

            if (name === 'finish_graph_question') {
                data = {
                    id: 'issued',
                    ...args.p_question as object
                };
            }

            return {
                data,
                error: null
            };
        }) };
        const result = await handleJourney(db, 'user', {
            action: 'journey_practice',
            topic: 'Life'
        }, async () => 'test-key');
        expect(result).toMatchObject({ questionRow: {
            id: 'issued',
            question_text: question.question
        } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const request = JSON.parse((fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1].body as string);
        expect(request.generationConfig.responseSchema.properties).toHaveProperty('correctAnswer');
        expect(request.generationConfig.responseSchema.properties).not.toHaveProperty('options');
        expect(db.rpc).toHaveBeenLastCalledWith('cancel_question_generation', expect.objectContaining({ p_lease: 'lease' }));
    });
});
