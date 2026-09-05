import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as prerequisites from '../../supabase/functions/learning/prerequisites';

// Run the actual Edge handler with its Deno/npm boundary replaced by in-memory services.
const handlerCode = ts.transpileModule(
  readFileSync('supabase/functions/learning/index.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

const concept = (name: string, dependencies: string[] = []) => ({
  canonical_name: name, prerequisites: dependencies, definition: name, aliases: [],
  mastery: 'unseen', is_atomic: false, topics: { Physics: 1 },
});
const registry = [
  concept('Speed of light'), concept('Time dilation', ['Speed of light']),
  concept('Spacetime interval', ['Speed of light', 'Time dilation']),
];
const candidate = {
  topic: 'Physics', concept: 'Spacetime interval', requiredConcepts: ['Speed of light', 'Time dilation'],
  reasoningComplexity: 'synthesis', isBossQuestion: true, question: 'Why is the spacetime interval invariant?',
  options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'Explanation.',
};
const safeCandidate = {
  ...candidate, concept: 'Speed of light', requiredConcepts: [],
  reasoningComplexity: 'directInference', isBossQuestion: false,
};

function setup({
  concepts = registry,
  active = null,
  registryError = false,
}: {
  concepts?: typeof registry;
  active?: Record<string, unknown> | null;
  registryError?: boolean;
} = {}) {
  const inserted: Record<string, unknown>[] = [];
  const retired: Record<string, unknown>[] = [];
  const ranges: number[][] = [];
  const generate = vi.fn().mockResolvedValue(JSON.stringify(safeCandidate));
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'learner' } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'begin_question_generation') return { data: {
        active: active?.trusted_issuance ? active : null, lease: 'lease', generation: 0,
      } };
      if (name === 'finish_question_generation') {
        inserted.push(args.p_question as Record<string, unknown>);
        return { data: { ...args.p_question as object, id: 'new-question' } };
      }
      return { data: name === 'get_user_gemini_key' ? 'test-gemini-key' : true };
    },
    from: (table: string) => {
      let operation = 'read';
      let payload: Record<string, unknown> = {};
      let range = [0, 499];
      const result = () => {
        if (table === 'concepts') return {
          data: registryError ? null : concepts.slice(range[0], range[1] + 1),
          error: registryError ? new Error('Unavailable') : null,
        };
        if (operation === 'insert') {
          inserted.push(payload);
          return { data: { ...payload, id: 'new-question' }, error: null };
        }
        if (operation === 'update') retired.push(payload);
        return { data: [], error: null };
      };
      const query = {
        select: () => query, eq: () => query, is: () => query, gt: () => query,
        not: () => query, order: () => query, limit: () => query,
        range: (start: number, end: number) => { range = [start, end]; ranges.push(range); return query; },
        insert: (value: Record<string, unknown>) => { operation = 'insert'; payload = value; return query; },
        update: (value: Record<string, unknown>) => { operation = 'update'; payload = value; return query; },
        maybeSingle: async () => ({ data: active, error: null }),
        single: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
  let handler!: (request: Request) => Promise<Response>;
  new Function('require', 'exports', 'Deno', handlerCode)(
    (name: string) => {
      if (name === './prerequisites.ts') return prerequisites;
      if (name === './kingdom.ts') return {};
      if (name === './gemini.ts') return { callGemini: generate };
      if (name === 'npm:@supabase/supabase-js@2') return { createClient: () => admin };
      throw new Error(`Unexpected import: ${name}`);
    },
    {},
    { env: { get: () => 'configured' }, serve: (value: typeof handler) => { handler = value; } },
  );
  return {
    inserted, retired, ranges, generate,
    run: () => handler(new Request('https://example.test/learning', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', topic: 'Physics' }),
    })),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Learning generate endpoint', () => {
  it('never persists or serves the rejected boss, and saves the verified retry', async () => {
    const app = setup();
    app.generate.mockResolvedValueOnce(JSON.stringify(candidate));
    const response = await app.run();
    expect(response.status).toBe(200);
    expect((await response.json()).question).toMatchObject({
      concept: 'Speed of light', isBossQuestion: false, prerequisitesMet: true,
    });
    expect(app.generate).toHaveBeenCalledTimes(2);
    expect(app.inserted).toHaveLength(1);
    expect(app.inserted[0]).toMatchObject({ concept: 'Speed of light', prerequisites_met: true });
  });

  it('retires a cached invalid boss even when it was stored with prerequisites_met=true', async () => {
    const app = setup({ active: {
      id: 'bad-boss', topic: 'Physics', concept: 'Spacetime interval',
      required_concepts: [], is_boss_question: true, reasoning_complexity: 'synthesis', prerequisites_met: true,
    } });
    expect((await app.run()).status).toBe(200);
    expect(app.inserted).toHaveLength(1);
    expect(app.generate).toHaveBeenCalledTimes(1);
  });

  it('reuses an eligible active question without spending another Gemini call', async () => {
    const app = setup({ active: {
      id: 'safe', trusted_issuance: true, topic: 'Physics', concept: 'Speed of light', required_concepts: [],
      is_boss_question: false, reasoning_complexity: 'directInference', prerequisites_met: true,
    } });
    expect((await (await app.run()).json()).question.id).toBe('safe');
    expect(app.generate).not.toHaveBeenCalled();
    expect(app.inserted).toEqual([]);
  });

  it('loads dependencies beyond the first page before validating a candidate', async () => {
    const concepts = [
      ...Array.from({ length: 500 }, (_, index) => ({ ...concept(`Foundation ${index}`), mastery: 'mastered' })),
      ...registry,
    ];
    const app = setup({ concepts });
    app.generate.mockResolvedValueOnce(JSON.stringify({ ...candidate, requiredConcepts: [] }));
    expect((await app.run()).status).toBe(200);
    expect(app.ranges).toEqual([[0, 499], [500, 999]]);
    expect(app.generate).toHaveBeenCalledTimes(2);
    expect(app.inserted[0].is_boss_question).toBe(false);
  });

  it('fails closed when progress cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = setup({ registryError: true });
    expect((await app.run()).status).toBe(500);
    expect(app.generate).not.toHaveBeenCalled();
    expect(app.inserted).toEqual([]);
  });

  it('saves nothing when every generation attempt has unmet prerequisites', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = setup();
    app.generate.mockResolvedValue(JSON.stringify(candidate));
    expect((await app.run()).status).toBe(500);
    expect(app.generate).toHaveBeenCalledTimes(3);
    expect(app.inserted).toEqual([]);
  });
});
