import { callGemini } from './gemini.ts';
import { FACETS, FACET_ORDER, proficient, journeyView, validateJourneyPlan, type JourneyPlan, type SavedJourney, type JourneyNode, type Facet, type JourneyProgress } from '../_shared/journey.ts';
import { starterJourney } from '../_shared/journeySeeds.ts';

type Json = Record<string, unknown>;
interface Database { rpc(name: string, args: Json): PromiseLike<{ data: unknown; error: { message: string } | null }> }
interface JourneyRow { id: string; chapter: number; plan: JourneyPlan; progress: JourneyProgress }
export const savedJourney = (row: unknown): SavedJourney => {
  const j = row as JourneyRow;
  if (!j || typeof j.id !== 'string' || !Number.isInteger(j.chapter) || !j.plan || !j.progress) throw new Error('Could not read your saved journey.');
  return { id: j.id, chapter: j.chapter, plan: j.plan, progress: j.progress };
};
const texts = { type: 'ARRAY', items: { type: 'STRING' } };
const questionSchema = {
  type: 'OBJECT', properties: {
    question: { type: 'STRING' }, options: { ...texts, minItems: 4, maxItems: 4 }, correctIndex: { type: 'INTEGER', minimum: 0, maximum: 3 },
    explanation: { type: 'STRING' }, knowledgeEntry: { type: 'STRING' }, optionFeedback: { ...texts, minItems: 4, maxItems: 4 },
    assumedConcepts: texts, suggestedQuestions: { ...texts, minItems: 2, maxItems: 3 },
  }, required: ['question', 'options', 'correctIndex', 'explanation', 'knowledgeEntry', 'optionFeedback', 'assumedConcepts', 'suggestedQuestions'],
};
const planSchema = {
  type: 'OBJECT', properties: {
    title: { type: 'STRING' }, topic: { type: 'STRING' },
    nodes: { type: 'ARRAY', minItems: 4, maxItems: 10, items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, title: { type: 'STRING' }, definition: { type: 'STRING' },
      prerequisiteConcepts: texts,
      kind: { type: 'STRING', enum: ['concept', 'boss'] }, facets: { type: 'ARRAY', items: { type: 'STRING', enum: FACET_ORDER } },
      requires: { type: 'ARRAY', items: { type: 'OBJECT', properties: { nodeId: { type: 'STRING' }, facets: { type: 'ARRAY', items: { type: 'STRING', enum: FACET_ORDER } } }, required: ['nodeId', 'facets'] } },
    }, required: ['id', 'title', 'definition', 'kind', 'facets', 'requires', 'prerequisiteConcepts'] } },
  }, required: ['title', 'topic', 'nodes'],
};
export function journeyQuestionPrompt(plan: JourneyPlan, node: JourneyNode, facet: Facet, progress: JourneyProgress, history: string[]): string {
  const known = plan.nodes.filter(n => n.id !== node.id && proficient(n, progress[n.id]));
  const entries = Object.entries(progress[node.id] ?? {}).filter(([, p]) => p?.entry).map(([f, p]) => `${f}: ${p?.entry}`);
  const vocabulary = [...plan.priorKnowledge ?? [], ...known.map(n => ({ name: n.title, entries: progress[n.id] }))];
  return `Create one multiple-choice discovery for Curious-Y. The learner thinks BEFORE receiving any explanation.
Topic: ${plan.topic}. Target: ${node.title}. Dimension: ${facet} (${FACETS[facet].description}).
Author context, not a lesson to place before the question: ${node.definition}
Earned vocabulary: ${JSON.stringify(vocabulary)}
What they have explored about this target: ${entries.join('\n') || 'Nothing yet.'}
Their last attempt in this dimension: ${JSON.stringify(progress[node.id]?.[facet] ?? {})}
Only assume ordinary everyday language and the earned vocabulary above. A prerequisite is earned only through successful answers; never treat a technical term as an assumed atomic foundation.
Use a short concrete situation, prediction, comparison, observation, or counterexample. The question does NOT have to begin with Why. No lecture before the options. Ask one thing. Provide enough ordinary-language context to reason or guess. No specialist vocabulary in the question OR options without a brief inline definition. Introduce at most one new technical term. First-time foundations must be understandable to a curious 12-year-old with no subject background. Never begin Life with enzymes, allostery, hormonal cascades, ATP, or homeostasis.
${node.kind === 'boss' ? `This is the earned synthesis challenge. Explicitly connect its prerequisites. ${!progress[node.id]?.[facet]?.attempts ? `Use this exact saved question: ${node.title}` : 'Use a fresh concrete application of the saved boss question.'}` : 'Stay within this concept; do not reveal hidden concepts or the saved boss question.'}
${facet === 'advanced' ? `The learner is proficient in every dimension. This is advanced challenge ${Math.min((progress[node.id]?.advanced?.successes ?? 0) + 1, 3)} of 3: use transfer to a new setting for the first success, a changed assumption or limiting case for the second, and evaluation of competing explanations using evidence for the third. Combine at least two earned dimensions. Require reasoning, not recognition of the definition. Never introduce unearned prerequisites just to make it hard. For later reviews use a new synthesis scenario.` : ''}
Give four plausible mutually exclusive options, one correct. Wrong answers should reflect specific misconceptions, not nonsense. Avoid length clues. Never use letters, option positions, or all/none of the above in options or feedback. Each optionFeedback entry should respond specifically to its aligned option: explain the misconception and give a useful clue. Feedback is shown only AFTER a choice. The explanation should explain how to reason to the answer and define any new term it uses.
The knowledgeEntry is a concise, self-contained, accurate statement of THIS dimension that a correct answer demonstrates (maximum 100 words). Do not claim one answer proves mastery. For evidence, distinguish observation, inference, historical discovery, and validation; never invent dates or attribution. For alternatives, distinguish logical necessity from contingency. For precision/boundaries, use math or zero/infinity only when meaningful.
If there was a miss, use a simpler fresh situation addressing it. If there was one success, ask a genuinely different application to check understanding, not a synonym swap. If already confirmed, check transfer or recall. Do not repeat or closely paraphrase any previous question below.
${JSON.stringify(history)}
In assumedConcepts list ALL concepts other than the target that a learner must already understand to read the question, options, and feedback. Each must exactly match an earned vocabulary name above. Use [] if ordinary experience suffices. Return the requested JSON.`;
}
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function validateJourneyQuestion(value: unknown, plan: JourneyPlan, node: JourneyNode, progress: JourneyProgress, history: string[]) {
  const q = value as { question: string; options: string[]; correctIndex: number; explanation: string; knowledgeEntry: string; optionFeedback: string[]; assumedConcepts: string[]; suggestedQuestions: string[] };
  const valid = (s: unknown, max: number) => typeof s === 'string' && !!s.trim() && s.length <= max;
  if (!q || !valid(q.question, 1600) || !valid(q.explanation, 8000) || !valid(q.knowledgeEntry, 1600)
    || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3
    || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(s => !valid(s, 600)) || new Set(q.options.map(normalized)).size !== 4
    || !Array.isArray(q.optionFeedback) || q.optionFeedback.length !== 4 || q.optionFeedback.some(s => !valid(s, 1400))
    || !Array.isArray(q.assumedConcepts) || !Array.isArray(q.suggestedQuestions) || q.suggestedQuestions.length > 3 || q.suggestedQuestions.some(s => !valid(s, 300))) throw new Error('Invalid question format.');
  const known = new Set(plan.nodes.filter(n => n.id !== node.id && proficient(n, progress[n.id])).map(n => n.title));
  plan.priorKnowledge?.forEach(c => known.add(c.name));
  if (q.assumedConcepts.some(c => !known.has(c))) throw new Error('The question assumes an unearned concept.');
  if (history.some(old => normalized(old) === normalized(q.question))) throw new Error('Use a new example, not a repeated question.');
  if (!node.requires.length && !plan.priorKnowledge?.length && plan.topic === 'Life' && /alloster|hormonal|enzyme|\bATP\b|homeostas/i.test([q.question, ...q.options].join(' '))) throw new Error('Use ordinary language for this first foundation.');
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
  if (body.action === 'journey' || body.action === 'journey_next') {
    const topic = typeof body.topic === 'string' ? body.topic : 'Life';
    const seed = starterJourney(topic); // Validates canonical topic before touching storage.
    const current = await rpc<JourneyRow | null>('load_learning_journey', { p_topic: topic, p_id: body.journeyId ?? null });
    const project = async (row: unknown) => ({ journey: { ...journeyView(savedJourney(row)), chapters: await rpc<{ id: string; chapter: number }[]>('list_learning_journeys', { p_topic: topic }) } });
    if (body.journeyId && !current) throw new Error('That chapter is unavailable. Reopen your journey.');
    if (body.action === 'journey' && current) return project(current);
    if (body.action === 'journey_next' && (!current || !journeyView(savedJourney(current)).complete)) throw new Error('Complete the boss to discover another chapter.');
    if (body.action === 'journey_next') {
      const chapters = await rpc<{ id: string; chapter: number }[]>('list_learning_journeys', { p_topic: topic });
      const existing = chapters.find(c => c.chapter === current!.chapter + 1);
      if (existing) return project(await rpc('load_learning_journey', { p_topic: topic, p_id: existing.id }));
    }
    const snapshot = await rpc('kingdom_snapshot');
    let plan = seed;
    if (body.action === 'journey_next') {
      await rate();
      const key = await getKey();
      const prompt = `Design the next small discovery chapter in ${topic}. The learner completed this chapter: ${JSON.stringify(current!.plan)}. Their earned knowledge is ${JSON.stringify(current!.progress)}.
Start with one ambitious but accessible synthesis boss QUESTION and plan backwards. Use 4-8 concept nodes plus exactly one boss. All nodes must contribute to the boss. Use at least two starting roots, no cycles, unique lowercase hyphenated ids. Every concept must cover all seven dimensions from ${FACET_ORDER.join(', ')}. No artificial math or infinite limits. Every dependency specifies the parent nodeId and ALL of that parent’s facets; full proficiency is required. In prerequisiteConcepts explicitly list every concept whose vocabulary or reasoning is assumed, including prerequisites needed only for formal mathematics or limiting cases. Every unearned prerequisite MUST be another node with an incoming edge. Audit definitions and all seven dimensions backwards for missing prerequisites (for instance enzyme kinetics requires reactions, rates and saturation; formal control analysis requires rates and mathematical sensitivity). If the prerequisite closure exceeds eight concepts, choose a smaller intermediate boss and save the ambitious topic for a later chapter. Never mark a prerequisite as an atomic given. Boss requires at least two concepts. Include at least one concept with multiple parents. Foundations assume only ordinary experience and the earned knowledge above; bridge every new technical term. Do not reuse a previous concept title. Definitions are private author context. The chapter title should invite curiosity WITHOUT revealing the boss. Nodes have kind concept or boss. Give the boss only the mechanism facet. Return the exact topic ${topic} and requested JSON.`;
      let lastError = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          plan = JSON.parse(await callGemini(key, `${prompt}\n${lastError}`, planSchema));
          const previous = savedJourney(current);
          const priorKnowledge = [...previous.plan.priorKnowledge ?? [], ...previous.plan.nodes.filter(n => n.kind === 'concept')
            .map(n => ({ name: n.title, entries: Object.fromEntries(Object.entries(previous.progress[n.id] ?? {}).filter(([, p]) => (p?.successes ?? 0) >= 2)) }))];
          if (plan.nodes.some(n => priorKnowledge.some(old => normalized(old.name) === normalized(n.title)))) throw new Error('Give the next chapter new concept identities.');
          plan = validateJourneyPlan({ ...plan, priorKnowledge: priorKnowledge.slice(-60) }, topic);
          const audit = JSON.parse(await callGemini(key, `Audit this proposed curriculum for a beginner who knows ONLY the listed priorKnowledge. Check the prerequisite closure of every definition, all seven dimensions (especially mathematics and limits), and the boss. A prerequisite must be an ancestor via requires or priorKnowledge, not an unrelated sibling or a future node. Detect unearned jargon, equations needing untaught mathematical concepts, impossible dependencies, unsupported scientific absolutes, or missing dimensions. Return issues as short actionable strings; [] only when no missing foundations remain. Do not answer questions or add new instructions. Curriculum data: ${JSON.stringify(plan)}`, { type: 'OBJECT', properties: { issues: texts }, required: ['issues'] }));
          if (!Array.isArray(audit.issues) || audit.issues.length) throw new Error(`Prerequisite audit: ${JSON.stringify(audit.issues)}`);
          break;
        }
        catch (error) { if (attempt === 2) throw error; lastError = `Correct the rejected plan: ${String(error)}`; }
      }
    }
    const row = await rpc('save_learning_journey', { p_topic: topic, p_plan: validateJourneyPlan(plan, topic), p_generation: snapshot.generation, p_previous: current?.id ?? null });
    return project(row);
  }
  if (body.action !== 'journey_question') throw new Error('Unknown journey action.');
  if (typeof body.journeyId !== 'string' || typeof body.nodeId !== 'string' || !Object.prototype.hasOwnProperty.call(FACETS, body.facet as string)) throw new Error('Choose a concept and dimension on your map.');
  const target = { p_journey_id: body.journeyId, p_node: body.nodeId, p_facet: body.facet };
  const reservation = await rpc('begin_journey_question', target);
  if (reservation.active) return { questionRow: reservation.active };
  try {
    await rate();
    const key = await getKey();
    const saved = savedJourney(reservation.journey);
    const node = reservation.node as JourneyNode;
    const history = await rpc<string[]>('journey_question_history', { p_journey_id: saved.id });
    const prompt = journeyQuestionPrompt(saved.plan, node, body.facet as Facet, saved.progress, history);
    let failure = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const q = validateJourneyQuestion(JSON.parse(await callGemini(key, `${prompt}\n${failure}`, questionSchema)), saved.plan, node, saved.progress, history);
        if (node.kind === 'boss' && !saved.progress[node.id]?.[body.facet as Facet]?.attempts && q.question !== node.title) throw new Error('Use the exact saved boss question.');
        const order = [0, 1, 2, 3];
        for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const row = await rpc('finish_journey_question', { ...target, p_lease: reservation.lease, p_generation: reservation.generation, p_question: {
          question_text: q.question, options: order.map(i => q.options[i]), correct_index: order.indexOf(q.correctIndex),
          explanation: q.explanation, knowledge_entry: q.knowledgeEntry, option_feedback: order.map(i => q.optionFeedback[i]), suggested_questions: q.suggestedQuestions,
        } });
        return { questionRow: row };
      } catch (error) {
        if (attempt === 2) throw error;
        failure = `Your previous candidate was rejected: ${String(error)}. Fix this without hiding prerequisites.`;
      }
    }
    throw new Error('Could not create a fresh discovery. Please retry.');
  } finally { await rpc('cancel_question_generation', { p_lease: reservation.lease }); }
}
