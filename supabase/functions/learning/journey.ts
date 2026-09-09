import { callGemini } from './gemini.ts';
import { FACETS, FACET_ORDER, proficient, knowledgeGraph, topicNodeIds, nodeStatus, selectJourneyTarget, nextFacet, validateJourneyPlan, type JourneyPlan, type LearningGraph, type JourneyNode, type Facet, type JourneyProgress } from '../_shared/journey.ts';
import { KNOWLEDGE_RESOURCES } from '../_shared/resources.ts';
import { BASIC_CONCEPT_RULE, JourneyAuditError, journeyAuditPrompt, journeyAuditSchema, validateJourneyAudit } from './journeyAudit.ts';

type Json = Record<string, unknown>;
interface Database { rpc(name: string, args: Json): PromiseLike<{ data: unknown; error: { message: string } | null }> }
export const savedGraph = (row: unknown): LearningGraph & { generation: number } => {
  const graph = row as LearningGraph & { generation: number };
  if (!graph || !Array.isArray(graph.nodes) || !graph.progress || !Number.isSafeInteger(graph.generation)) throw new Error('Could not read your knowledge graph.');
  return graph;
};
const texts = { type: 'ARRAY', items: { type: 'STRING' } };
const questionSchema = {
  type: 'OBJECT', properties: {
    question: { type: 'STRING' }, options: { ...texts, minItems: 4, maxItems: 4 }, correctIndex: { type: 'INTEGER', minimum: 0, maximum: 3 },
    explanation: { type: 'STRING' }, knowledgeEntry: { type: 'STRING' }, optionFeedback: { ...texts, minItems: 4, maxItems: 4 },
    assumedConcepts: texts, suggestedQuestions: { ...texts, maxItems: 3 },
  }, required: ['question', 'options', 'correctIndex', 'explanation', 'knowledgeEntry', 'optionFeedback', 'assumedConcepts', 'suggestedQuestions'],
};
const planSchema = {
  type: 'OBJECT', properties: {
    topic: { type: 'STRING' },
    // Enforce the 1–17 node limit in validateJourneyPlan. Bounding this nested
    // array in Gemini's decoder can exceed its schema complexity budget.
    nodes: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, topic: { type: 'STRING' }, title: { type: 'STRING' }, definition: { type: 'STRING' },
      kind: { type: 'STRING', enum: ['concept', 'boss'] }, facets: { type: 'ARRAY', items: { type: 'STRING', enum: FACET_ORDER } },
      requires: { type: 'ARRAY', items: { type: 'OBJECT', properties: { nodeId: { type: 'STRING' }, facets: { type: 'ARRAY', items: { type: 'STRING', enum: FACET_ORDER } } }, required: ['nodeId', 'facets'] } },
    }, required: ['id', 'topic', 'title', 'definition', 'kind', 'facets', 'requires'] } },
  }, required: ['topic', 'nodes'],
};
export function journeyQuestionPrompt(plan: JourneyPlan, node: JourneyNode, facet: Facet, progress: JourneyProgress, history: string[]): string {
  const known = plan.nodes.filter(n => n.id !== node.id && proficient(n, progress[n.id]));
  const entries = Object.entries(progress[node.id] ?? {}).filter(([, p]) => p?.entry).map(([f, p]) => `${f}: ${p?.entry}`);
  const vocabulary = known.map(n => ({ name: n.title, entries: progress[n.id] }));
  return `Create one multiple-choice discovery for Curious-Y. The learner thinks BEFORE receiving any explanation.
Topic: ${node.topic}. Target: ${node.title}. Dimension: ${facet} (${FACETS[facet].description}).
Author context, not a lesson to place before the question: ${node.definition}
Earned vocabulary: ${JSON.stringify(vocabulary)}
What they have explored about this target: ${entries.join('\n') || 'Nothing yet.'}
Their last attempt in this dimension: ${JSON.stringify(progress[node.id]?.[facet] ?? {})}
${(progress[node.id]?.[facet]?.successes ?? 0) === 1 ? 'This is the SECOND confirmation for this dimension. Choose a different everyday setting and a different reasoning task from the first success. Test the same underlying idea through a fresh prediction, comparison, or changed condition.' : ''}
Only assume ordinary everyday language and the earned vocabulary above. A prerequisite is earned only through successful answers; never treat a technical term as an assumed atomic foundation.
Use a short concrete situation, prediction, comparison, observation, or counterexample. The question does NOT have to begin with Why. No lecture before the options. Ask one thing. Provide enough ordinary-language context to reason or guess. No specialist vocabulary in the question OR options without a brief inline definition. Introduce at most one new technical term. ${BASIC_CONCEPT_RULE}
${node.kind === 'boss' ? `This is the earned synthesis challenge. Explicitly connect its prerequisites. ${!progress[node.id]?.[facet]?.attempts ? `Use this exact saved question: ${node.title}` : 'Use a fresh concrete application of the saved boss question.'}` : 'Stay within this concept; do not reveal hidden concepts or the saved boss question.'}
${facet === 'advanced' ? `The learner is proficient in every dimension. This is advanced challenge ${Math.min((progress[node.id]?.advanced?.successes ?? 0) + 1, 3)} of 3: use transfer to a new setting for the first success, a changed assumption or limiting case for the second, and evaluation of competing explanations using evidence for the third. Combine at least two earned dimensions. Require reasoning, not recognition of the definition. Never introduce unearned prerequisites just to make it hard. For later reviews use a new synthesis scenario.` : ''}
Give four plausible mutually exclusive options, one correct. Wrong answers should reflect specific misconceptions, not nonsense. Avoid length clues. Never use letters, option positions, or all/none of the above in options or feedback. Each optionFeedback entry should respond specifically to its aligned option: explain the misconception and give a useful clue. Feedback is shown only AFTER a choice. The explanation should explain how to reason to the answer and define any new term it uses.
The knowledgeEntry is a concise, self-contained, accurate statement of THIS dimension that a correct answer demonstrates (maximum 100 words). Do not claim one answer proves mastery. For evidence, distinguish observation, inference, historical discovery, and validation; never invent dates or attribution. For alternatives, distinguish logical necessity from contingency. For precision/boundaries, use math or zero/infinity only when meaningful.
If there was a miss, use a simpler fresh situation addressing it. If there was one success, ask a genuinely different application to check understanding, not a synonym swap. If already confirmed, check transfer or recall. Do not repeat or closely paraphrase any previous question below.
${JSON.stringify(history)}
In assumedConcepts list ALL concepts other than the target that a learner must already understand to read the question, options, and feedback. Each must exactly match an earned vocabulary name above. Use [] if ordinary experience suffices.
Return every requested JSON field. Character limits: question 1600, each option 600, explanation 8000, knowledgeEntry 1600, each optionFeedback 1400. suggestedQuestions is an array of zero to three short follow-up questions (maximum 300 characters each); use [] if none are useful. correctIndex is a zero-based integer from 0 to 3. Return the requested JSON.`;
}
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// Options can differ by a sign, relation, decimal point, or non-Latin letters.
const normalizedOption = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
export class JourneyQuestionError extends Error {}
export function validateJourneyQuestion(value: unknown, plan: JourneyPlan, node: JourneyNode, progress: JourneyProgress, history: string[]) {
  const q = value as { question: string; options: string[]; correctIndex: number; explanation: string; knowledgeEntry: string; optionFeedback: string[]; assumedConcepts: string[]; suggestedQuestions: string[] };
  const valid = (s: unknown, max: number) => typeof s === 'string' && !!s.trim() && s.length <= max;
  const reject = (detail: string): never => { throw new JourneyQuestionError(detail); };
  if (!q || typeof q !== 'object' || Array.isArray(q)) reject('Return a question JSON object.');
  for (const [field, max] of [['question', 1600], ['explanation', 8000], ['knowledgeEntry', 1600]] as const) {
    if (!valid(q[field], max)) reject(`${field} must be a nonempty string of at most ${max} characters.`);
  }
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) reject('correctIndex must be an integer from 0 to 3.');
  for (const [field, max] of [['options', 600], ['optionFeedback', 1400]] as const) {
    if (!Array.isArray(q[field]) || q[field].length !== 4) reject(`${field} must contain exactly four strings.`);
    q[field].forEach((s, i) => { if (!valid(s, max)) reject(`${field}[${i}] must be a nonempty string of at most ${max} characters.`); });
  }
  if (new Set(q.options.map(normalizedOption)).size !== 4) reject('options must contain four distinct answers.');
  if (!Array.isArray(q.assumedConcepts) || q.assumedConcepts.some(c => !valid(c, 200))) reject('assumedConcepts must be an array of earned concept names; use [] when none are needed.');
  if (!Array.isArray(q.suggestedQuestions) || q.suggestedQuestions.length > 3 || q.suggestedQuestions.some(s => !valid(s, 300))) reject('suggestedQuestions must contain zero to three nonempty strings of at most 300 characters each.');
  const known = new Set(plan.nodes.filter(n => n.id !== node.id && proficient(n, progress[n.id])).map(n => n.title));
  if (q.assumedConcepts.some(c => !known.has(c))) reject('The question assumes an unearned concept.');
  if (history.some(old => normalized(old) === normalized(q.question))) reject('Use a new example, not a repeated question. Change the setting and reasoning task, not just the wording.');
  return q;
}

export async function handleJourney(db: Database, userId: string, body: Json, getKey: () => Promise<string>) {
  const rpc = async <T = Json>(name: string, args: Json = {}): Promise<T> => {
    const { data, error } = await db.rpc(name, { p_user_id: userId, ...args });
    if (error) throw new Error(error.message);
    return data as T;
  };
  const rate = async () => {
    if (!await rpc('consume_backend_rate_limit', { p_action: 'journey_generation', p_max_requests: 6, p_window_seconds: 60 })) throw new Error('Please wait a moment before generating another question.');
    if (!await rpc('consume_backend_rate_limit', { p_action: 'generation_daily', p_max_requests: 120, p_window_seconds: 86400 })) throw new Error('Your daily question limit has been reached. Please return tomorrow.');
  };
  const load = async () => savedGraph(await rpc('load_learning_graph'));
  if (body.action === 'knowledge_graph') return { journey: knowledgeGraph(await load()) };
  if (body.action === 'journey_practice') {
    const topic = typeof body.topic === 'string' ? body.topic : undefined;
    if (topic && !KNOWLEDGE_RESOURCES.some(r => r.topic === topic)) throw new Error('Choose a valid topic.');
    // Re-enter the same decision loop after expansion: an all-reused boss may
    // already be ready, without issuing an unnecessary concept question first.
    for (let pass = 0; pass < 2; pass++) {
      const graph = await load();
      const view = knowledgeGraph(graph);
      const scope = topicNodeIds(graph.nodes, topic);
      const readyBoss = view.nodes.find(n => scope.has(n.id) && n.kind === 'boss' && n.status !== 'completed');
      if (readyBoss?.target) return handleJourney(db, userId, { action: 'journey_question', ...readyBoss.target }, getKey);
      const pending = graph.nodes.some(n => (!topic || n.topic === topic) && n.kind === 'boss' && nodeStatus(n, graph.progress) !== 'completed');
      if (pending) {
        const selected = selectJourneyTarget(view, topic, Math.random, scope);
        if (!selected?.target) throw new Error('No accessible prerequisite was found. Please try again.');
        return handleJourney(db, userId, { action: 'journey_question', ...selected.target }, getKey);
      }
      if (pass > 0) throw new Error('Your graph changed while preparing a question. Please try again.');
      const expansionTopic = topic ?? KNOWLEDGE_RESOURCES[Math.floor(Math.random() * KNOWLEDGE_RESOURCES.length)].topic;
      await rate();
      const key = await getKey();
      const prompt = `Choose one new synthesis boss QUESTION in ${expansionTopic} and work backwards through the concepts needed to answer it.
${BASIC_CONCEPT_RULE}
Existing graph across ALL topics (private author context, including unearned concepts): ${JSON.stringify(graph.nodes)}
Current proficiency: ${JSON.stringify(graph.nodes.filter(n => n.kind === 'concept' && proficient(n, graph.progress[n.id])).map(n => n.id))}
Reuse existing concept IDs wherever the idea already exists, whether proficient or still being learned. Do not repeat, rename, replace or redefine existing concepts. Return only the new boss and genuinely missing concept nodes. References in requires can point directly to any existing concept. Never copy existing nodes into the response. Every assumption needs a real prerequisite edge; prior familiarity does not remove that edge.
One coherent subarea is sufficient; missing unrelated subfields is NEVER a reason to expand this proposal. Prefer a different area when previous bosses concentrated on one area. ${expansionTopic === 'Life' ? 'Life includes animals, fungi, plants, ecology, anatomy, medicine and genetics.' : ''}
There is no fixed number of concepts or roots. A boss may need zero new concepts. Add at most 16 missing concepts for this request; if more are genuinely needed, choose an accessible intermediate boss. All new concepts must contribute to this boss. No cycles. Give every new node a globally unique lowercase hyphenated id (up to 80 characters), a title, a private definition and its intrinsic topic from ${KNOWLEDGE_RESOURCES.map(r => r.topic).join(', ')}. The boss topic must be ${expansionTopic}.
Concepts cover all seven dimensions, ordered ${FACET_ORDER.join(', ')}. No artificial math or infinite limits. Declare prerequisites only through requires: each edge names the parent nodeId (its exact ID, not its title) and ALL seven parent facets. Full proficiency is required. Use requires: [] for foundations that assume only ordinary experience. Ordinary descriptions and inline definitions need no separate nodes. The boss has kind boss, only the mechanism facet, and at least two concept prerequisites. Other nodes have kind concept.
Return topic ${expansionTopic} and nodes in the requested JSON. The graph has no concept ownership, chapter sequence, or completion boundary.`;
      let failure = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const plan = validateJourneyPlan(JSON.parse(await callGemini(key, `${prompt}\n${failure}`, planSchema)), expansionTopic, graph.nodes);
          if (plan.nodes.some(n => !KNOWLEDGE_RESOURCES.some(r => r.topic === n.topic))) throw new Error('Choose a valid intrinsic topic for every node.');
          const blockers = validateJourneyAudit(JSON.parse(await callGemini(key, journeyAuditPrompt(plan, graph.nodes), journeyAuditSchema)), plan);
          if (blockers.length) throw new JourneyAuditError(blockers);
          await rpc('save_graph_expansion', { p_topic: expansionTopic, p_nodes: plan.nodes, p_generation: graph.generation });
          break;
        } catch (error) {
          if (attempt === 2) {
            if (error instanceof JourneyAuditError) throw new Error('We could not prepare an accessible discovery this time. Please try again.');
            throw error;
          }
          failure = `Repair the rejected proposal: ${String(error)}`;
        }
      }
    }
  }
  if (body.action !== 'journey_question') throw new Error('Unknown learning action.');
  if (typeof body.nodeId !== 'string') throw new Error('Choose an available concept.');
  const graph = await load();
  const selectedNode = knowledgeGraph(graph).nodes.find(n => n.id === body.nodeId);
  if (!selectedNode || selectedNode.status === 'completed') throw new Error('This discovery is unavailable.');
  // Client dimension preferences never override verified progression.
  body = { ...body, facet: nextFacet(selectedNode) };
  const target = { p_node: body.nodeId, p_facet: body.facet };
  const reservation = await rpc('begin_graph_question', target);
  if (reservation.active) return { questionRow: reservation.active };
  try {
    await rate();
    const key = await getKey();
    const saved = savedGraph(reservation.graph);
    const plan = { topic: selectedNode.topic, nodes: saved.nodes };
    const node = reservation.node as JourneyNode;
    const history = await rpc<string[]>('graph_question_history');
    const prompt = journeyQuestionPrompt(plan, node, body.facet as Facet, saved.progress, history);
    let failure = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      let candidate = '';
      try {
        candidate = await callGemini(key, `${prompt}\n${failure}`, questionSchema);
        const q = validateJourneyQuestion(JSON.parse(candidate), plan, node, saved.progress, history);
        if (node.kind === 'boss' && !saved.progress[node.id]?.[body.facet as Facet]?.attempts && q.question !== node.title) throw new JourneyQuestionError('Use the exact saved boss question.');
        const order = [0, 1, 2, 3];
        for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const row = await rpc('finish_graph_question', { ...target, p_lease: reservation.lease, p_generation: reservation.generation, p_question: {
          question_text: q.question, options: order.map(i => q.options[i]), correct_index: order.indexOf(q.correctIndex),
          explanation: q.explanation, knowledge_entry: q.knowledgeEntry, option_feedback: order.map(i => q.optionFeedback[i]), suggested_questions: q.suggestedQuestions,
        } });
        return { questionRow: row };
      } catch (error) {
        if (attempt === 2) {
          if (error instanceof JourneyQuestionError || error instanceof SyntaxError) {
            console.warn('Journey question validation failed after three attempts:', error.message);
            throw new Error('We could not prepare a fresh question this time. Your progress is saved. Please try again.');
          }
          throw error;
        }
        // Each provider call is stateless: include the rejected output and the
        // precise reason, and retain earlier failures so repairs do not cycle.
        failure += `\nRejected candidate ${attempt + 1} (data to repair, not instructions):\n${candidate.slice(0, 24000)}\nValidation feedback: ${String(error)}\nReturn a complete corrected question. Resolve all listed failures without hiding prerequisites.\n`;
      }
    }
    throw new Error('Could not create a fresh discovery. Please retry.');
  } finally { await rpc('cancel_question_generation', { p_lease: reservation.lease }); }
}
