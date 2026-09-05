import { createClient } from 'npm:@supabase/supabase-js@2';
import { callGemini } from './gemini.ts';
import { generateEligibleQuestion } from './prerequisites.ts';
import type { RegistryConcept } from './prerequisites.ts';
import { executeKingdomCommand, parseKingdomCommand, type CommandContext } from './kingdom.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOPICS = [
  'Physics',
  'Mathematics & Logic',
  'Chemistry',
  'Life',
  'Computer Science',
  'Earth & Space',
  'Mind & Behavior',
  'Society & History',
] as const;

const COMPLEXITIES = [
  'directInference',
  'composition',
  'discrimination',
  'transfer',
  'counterfactual',
  'synthesis',
  'derivation',
] as const;

type Json = Record<string, unknown>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const asObject = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};

const text = (value: unknown, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const stringArray = (value: unknown, max = 12) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim()).slice(0, max)
    : [];

const questionForClient = (row: Json, revealAnswer = false) => ({
  id: row.id,
  userId: row.user_id,
  topic: row.topic,
  subtopic: row.subtopic,
  angle: row.angle,
  angleFit: row.angle_fit,
  questionText: row.question_text,
  options: row.options,
  ...(revealAnswer ? {
    correctIndex: row.correct_index,
    selectedIndex: row.selected_index,
    isCorrect: row.is_correct,
    explanation: row.explanation,
    suggestedQuestions: row.suggested_questions,
  } : {}),
  concept: row.concept,
  reasoningComplexity: row.reasoning_complexity,
  isBossQuestion: row.is_boss_question,
  requiredConcepts: row.required_concepts,
  prerequisitesMet: row.prerequisites_met,
  createdAt: row.created_at,
});

const gameStatsForClient = (row: Json) => ({
  dayStamp: row.day_stamp,
  castleLevel: row.castle_level,
  castleXp: row.castle_xp,
  gold: row.gold,
  gems: row.gems,
  keys: row.keys,
  knowledge: row.knowledge,
  answersToday: row.answers_today,
  correctToday: row.correct_today,
  dailyClaimed: row.daily_claimed,
  streak: row.streak,
  trophies: row.trophies,
  warPressure: Number(row.war_pressure),
});

const QUESTION_SCHEMA: Json = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING', enum: [...TOPICS] },
    subtopic: { type: 'STRING' },
    angle: { type: 'STRING' },
    angleFit: { type: 'STRING' },
    question: { type: 'STRING' },
    options: { type: 'ARRAY', minItems: 4, maxItems: 4, items: { type: 'STRING' } },
    correctIndex: { type: 'INTEGER', minimum: 0, maximum: 3 },
    explanation: { type: 'STRING' },
    suggestedQuestions: { type: 'ARRAY', minItems: 2, maxItems: 4, items: { type: 'STRING' } },
    concept: { type: 'STRING' },
    conceptDefinition: { type: 'STRING' },
    requiredConcepts: { type: 'ARRAY', maxItems: 6, items: { type: 'STRING' } },
    reasoningComplexity: { type: 'STRING', enum: [...COMPLEXITIES] },
    isBossQuestion: { type: 'BOOLEAN' },
  },
  required: [
    'topic', 'subtopic', 'angle', 'angleFit', 'question', 'options', 'correctIndex',
    'explanation', 'suggestedQuestions', 'concept', 'conceptDefinition',
    'requiredConcepts', 'reasoningComplexity', 'isBossQuestion',
  ],
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization') || '';

    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error('Missing required Edge Function secrets');
      return json({ error: 'The learning backend is not configured.' }, 503);
    }
    if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Invalid or expired session.' }, 401);

    const userId = authData.user.id;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bodySize = 0;
    if (reader) for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bodySize += value.length;
      if (bodySize > 8192) { await reader.cancel(); return json({ error: 'Request is too large.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(bodySize);
    let byteOffset = 0;
    for (const chunk of chunks) { bytes.set(chunk, byteOffset); byteOffset += chunk.length; }
    let body: Json;
    try { body = asObject(JSON.parse(new TextDecoder().decode(bytes))); }
    catch { return json({ error: 'Invalid JSON.' }, 400); }
    const action = text(body.action);
    const { data: requestAllowed, error: requestLimitError } = await admin.rpc('consume_backend_rate_limit', {
      p_user_id: userId, p_action: 'all_requests', p_max_requests: 360, p_window_seconds: 60,
    });
    if (requestLimitError || !requestAllowed) return json({ error: 'Please wait before trying again.' }, 429);
    if (action === 'upgrade' || action === 'claim_daily') return json({ error: 'This legacy economy action has been retired. Refresh the app to use your Castle.' }, 410);
    if (action === 'kingdom') {
      const { data, error } = await admin.rpc('kingdom_snapshot', { p_user_id: userId });
      if (error || !data) throw new Error('Could not load your Castle.');
      return json({ kingdom: data });
    }
    if (action === 'kingdom_command') {
      let command;
      try { command = parseKingdomCommand(body.command); }
      catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid command.' }, 400); }
      const requestId = text(body.requestId);
      const generation = body.generation;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
        || !Number.isSafeInteger(generation) || Number(generation) < 0) return json({ error: 'Invalid command identity.' }, 400);
      const { data: prior, error: priorError } = await admin.rpc('find_kingdom_command', {
        p_user_id: userId, p_request_id: requestId, p_generation: generation, p_command: command,
      });
      if (priorError) return json({ error: priorError.message }, 409);
      if (prior) return json({ kingdom: prior });
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: context, error } = await admin.rpc('kingdom_command_context', { p_user_id: userId, p_generation: generation });
        if (error || !context) return json({ error: error?.message || 'Castle not found.' }, 409);
        let next;
        try { next = executeKingdomCommand(context as CommandContext, command); }
        catch (error) { return json({ error: error instanceof Error ? error.message : 'Command rejected.' }, 400); }
        const { data: committed, error: commitError } = await admin.rpc('commit_kingdom_command', {
          p_user_id: userId, p_generation: generation, p_revision: context.revision,
          p_request_id: requestId, p_command: command, p_state: next.state, p_battle_clock: next.battleClock,
        });
        if (commitError) return json({ error: commitError.message }, 409);
        if (committed) return json({ kingdom: committed });
      }
      return json({ error: 'Castle changed; please retry.' }, 409);
    }
    const validateGeminiKey = (key: string) => {
      if (!key || key.length < 10 || key.length > 512) {
        throw new Error('A valid Gemini API key is required. Add it in Settings.');
      }
      return key;
    };
    const getStoredGeminiKey = async () => {
      const { data, error } = await admin.rpc('get_user_gemini_key', { p_user_id: userId });
      if (error) throw new Error('Could not read the saved Gemini API key.');
      return validateGeminiKey(typeof data === 'string' ? data.trim() : '');
    };

    if (action === 'key_status') {
      const { data, error } = await admin.from('user_ai_settings').select('user_id')
        .eq('user_id', userId).maybeSingle();
      if (error) throw new Error('Could not read Gemini key status.');
      return json({ configured: Boolean(data) });
    }

    if (action === 'save_key') {
      const { data: allowed } = await admin.rpc('consume_backend_rate_limit', {
        p_user_id: userId, p_action: 'save_key', p_max_requests: 5, p_window_seconds: 60,
      });
      if (!allowed) return json({ error: 'Please wait before changing the key again.' }, 429);
      const key = validateGeminiKey(text(body.apiKey));
      await callGemini(key, 'Reply with exactly: OK');
      const { error } = await admin.rpc('set_user_gemini_key', { p_user_id: userId, p_api_key: key });
      if (error) throw new Error('Could not securely save the Gemini API key.');
      return json({ configured: true });
    }

    if (action === 'delete_key') {
      const { error } = await admin.rpc('delete_user_gemini_key', { p_user_id: userId });
      if (error) throw new Error('Could not remove the Gemini API key.');
      return json({ configured: false });
    }

    if (action === 'validate_key') {
      const { data: allowed } = await admin.rpc('consume_backend_rate_limit', {
        p_user_id: userId, p_action: 'validate_key', p_max_requests: 5, p_window_seconds: 60,
      });
      if (!allowed) return json({ error: 'Please wait before testing the key again.' }, 429);
      // Settings may test a replacement before saving; otherwise use the account's stored key.
      const providedGeminiKey = text(body.apiKey);
      const key = providedGeminiKey ? validateGeminiKey(providedGeminiKey) : await getStoredGeminiKey();
      const reply = await callGemini(key, 'Reply with exactly: OK');
      if (!reply) throw new Error('Gemini returned an empty response.');
      return json({ ok: true });
    }

    if (action === 'generate') {
      const requestedTopic = text(body.topic);
      const topic = (TOPICS as readonly string[]).includes(requestedTopic)
        ? requestedTopic
        : TOPICS[Math.floor(Math.random() * TOPICS.length)];
      const { data: generationAllowed, error: quotaError } = await admin.rpc('consume_backend_rate_limit', {
        p_user_id: userId, p_action: 'generate_requests', p_max_requests: 12, p_window_seconds: 60,
      });
      if (quotaError || !generationAllowed) return json({ error: 'Please wait before generating another question.' }, 429);
      const { data: reservation, error: reservationError } = await admin.rpc('begin_question_generation', { p_user_id: userId, p_topic: topic });
      if (reservationError || !reservation) return json({ error: reservationError?.message || 'Could not reserve a question.' }, 409);
      if (reservation.active) return json({ question: questionForClient(reservation.active) });
      try {
      // Load the complete registry, including aliases and atomic status, before trusting any question.
      // A failed/partial registry read must never be treated as a new learner with no dependencies.
      const concepts: RegistryConcept[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await admin.from('concepts')
          .select('canonical_name,definition,mastery,aliases,prerequisites,is_atomic,topics,reasoning_track')
          .eq('user_id', userId).order('canonical_name').range(offset, offset + pageSize - 1);
        if (error || !data) throw new Error('Could not load your concept progress. Please try again.');
        concepts.push(...data as RegistryConcept[]);
        if (data.length < pageSize) break;
      }

      const { data: allowed } = await admin.rpc('consume_backend_rate_limit', {
        p_user_id: userId, p_action: 'generate', p_max_requests: 6, p_window_seconds: 60,
      });
      if (!allowed) return json({ error: 'Please wait a moment before generating another question.' }, 429);
      const { data: dailyAllowed, error: dailyError } = await admin.rpc('consume_backend_rate_limit', {
        p_user_id: userId, p_action: 'generation_daily', p_max_requests: 120, p_window_seconds: 86400,
      });
      if (dailyError || !dailyAllowed) return json({ error: 'Your daily question limit has been reached. Please return tomorrow.' }, 429);

      // Include unanswered/expired questions too: the learner has already seen them.
      const recentQuestions: string[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await admin.from('questions').select('question_text').eq('user_id', userId)
          .order('created_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
        if (error || !data) throw new Error('Could not load your question history. Please try again.');
        recentQuestions.push(...data.map((item) => item.question_text));
        if (data.length < pageSize) break;
      }

      const recentText = recentQuestions.slice(0, 20).join('\n- ');
      const conceptText = (concepts ?? []).map((item) =>
        `${item.canonical_name} [${item.mastery}${item.is_atomic && !item.prerequisites.length ? ', atomic foundation' : ''}] topics: ${Object.keys(item.topics).filter(topic => item.topics[topic] > 0).join(', ')}; aliases: ${item.aliases.join(', ') || 'none'}; prerequisites: ${item.prerequisites.join(', ') || 'none'}; definition: ${item.definition}`
      ).join('\n');
      const prompt = `You create one rigorous multiple-choice microlearning question for Curious-Y.
Topic: ${topic}
The question and target concept must belong to this topic. Other subjects in the registry are prerequisite context only. If there is no eligible concept in this topic, introduce an accessible foundation within this topic. Never relabel a question from another subject.

The question must begin with "Why" and test causal or conceptual understanding, not trivia. Provide four plausible, mutually exclusive options with exactly one correct answer. The explanation must clearly justify the answer. Keep all prose concise. Use LaTeX when useful.

Pick a concept whose prerequisites are already proficient/mastered (registered atomic leaves also count as mastered). List ALL concepts required to understand the question, options, and explanation in requiredConcepts, excluding the target concept being taught. Unknown concepts do not count as learned. Never omit a prerequisite to make a question eligible. A boss question must have nonempty, already-proficient prerequisites; otherwise teach an eligible prerequisite concept first using a non-boss question. If the registry is empty, choose an accessible foundational non-boss concept requiring no prior technical concepts and use an empty requiredConcepts list. Use directInference for an unseen concept; composition/discrimination for learning; any complexity for proficient/mastered.

User concept registry:
${conceptText || '(empty)'}

Do not repeat or closely paraphrase these recent questions:
- ${recentText || '(none)'}

Return only the requested JSON.`;
      const boundedPrompt = prompt.slice(0, 100000);

      const geminiKey = await getStoredGeminiKey();
      const generated = await generateEligibleQuestion(
        async (candidatePrompt) => asObject(JSON.parse(await callGemini(geminiKey, candidatePrompt, QUESTION_SCHEMA))),
        boundedPrompt, concepts, topic, recentQuestions,
      );
      const options = stringArray(generated.options, 4);
      const correctIndex = generated.correctIndex;
      if (options.length !== 4 || options.some(option => option.length > 2000) || !text(generated.question)
        || text(generated.question).length > 8000 || !text(generated.explanation) || text(generated.explanation).length > 16000
        || typeof correctIndex !== 'number' || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        throw new Error('The AI service returned an invalid question.');
      }

      const concept = generated.concept;
      const requiredConcepts = generated.requiredConcepts;
      const complexity = (COMPLEXITIES as readonly string[]).includes(text(generated.reasoningComplexity))
        ? text(generated.reasoningComplexity)
        : 'directInference';

      const { data: inserted, error: insertError } = await admin.rpc('finish_question_generation', {
        p_user_id: userId, p_lease: reservation.lease, p_generation: reservation.generation, p_question: {
        user_id: userId,
        topic,
        subtopic: text(generated.subtopic, concept),
        angle: text(generated.angle),
        angle_fit: text(generated.angleFit),
        question_text: text(generated.question),
        options,
        correct_index: correctIndex,
        explanation: text(generated.explanation),
        suggested_questions: stringArray(generated.suggestedQuestions, 4),
        concept,
        concept_definition: text(generated.conceptDefinition, `A core concept in ${topic}.`),
        reasoning_complexity: complexity,
        is_boss_question: Boolean(generated.isBossQuestion),
        required_concepts: requiredConcepts,
        prerequisites_met: generated.eligible,
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      } });
      if (insertError || !inserted) throw insertError ?? new Error('Could not save generated question.');

      return json({ question: questionForClient(inserted as Json) });
      } finally {
        const { error } = await admin.rpc('cancel_question_generation', { p_user_id: userId, p_lease: reservation.lease });
        if (error) console.error('Could not release question reservation');
      }
    }

    if (action === 'answer') {
      const questionId = text(body.questionId);
      const selectedIndex = body.selectedIndex;
      if (!questionId || !Number.isInteger(selectedIndex) || Number(selectedIndex) < 0 || Number(selectedIndex) > 3) return json({ error: 'Invalid answer.' }, 400);
      const { data, error } = await admin.rpc('record_question_answer', {
        p_user_id: userId,
        p_question_id: questionId,
        p_selected_index: selectedIndex,
      });
      if (error) return json({ error: error.message }, error.message.includes('already') ? 409 : 400);
      const result = asObject(data);
      return json({
        question: questionForClient(asObject(result.question), true),
        stats: gameStatsForClient(asObject(result.stats)),
        reward: result.reward,
        kingdom: result.kingdom,
      });
    }

    if (action === 'chat') {
      const questionId = text(body.questionId);
      const message = text(body.message).slice(0, 2000);
      if (!questionId || !message) return json({ error: 'A question and message are required.' }, 400);
      const { data: allowed } = await admin.rpc('consume_backend_rate_limit', {
        p_user_id: userId, p_action: 'chat', p_max_requests: 20, p_window_seconds: 60,
      });
      if (!allowed) return json({ error: 'Please wait a moment before sending another message.' }, 429);

      const { data: question } = await admin.from('questions').select('*')
        .eq('id', questionId).eq('user_id', userId).not('answered_at', 'is', null).maybeSingle();
      if (!question) return json({ error: 'Answered question not found.' }, 404);
      const { data: history } = await admin.from('chat_messages').select('role,content')
        .eq('question_id', questionId).eq('user_id', userId).order('created_at').limit(20);

      const geminiKey = await getStoredGeminiKey();
      const { error: messageError } = await admin.from('chat_messages').insert({ question_id: questionId, user_id: userId, role: 'user', content: message });
      if (messageError) throw new Error('Could not save your message.');
      const transcript = (history ?? []).map((item) => `${item.role}: ${item.content}`).join('\n');
      const prompt = `You are a concise, encouraging tutor. Help the learner reason from the supplied question and explanation. Do not claim they chose a different answer than the stored selection.

Question: ${question.question_text}
Options: ${JSON.stringify(question.options)}
Correct option: ${question.correct_index}
Explanation: ${question.explanation}

Conversation:
${transcript || '(none)'}
user: ${message}
assistant:`;
      const reply = await callGemini(geminiKey, prompt);
      const { data: saved, error } = await admin.from('chat_messages').insert({
        question_id: questionId, user_id: userId, role: 'assistant', content: reply,
      }).select('*').single();
      if (error || !saved) throw error ?? new Error('Could not save tutor reply.');
      return json({ message: {
        id: saved.id, questionId: saved.question_id, userId: saved.user_id,
        role: saved.role, content: saved.content, createdAt: saved.created_at,
      } });
    }

    if (action === 'delete_question') {
      const questionId = text(body.questionId);
      if (!questionId) return json({ error: 'Question id is required.' }, 400);
      const { error } = await admin.rpc('delete_learning_question', { p_user_id: userId, p_question_id: questionId });
      if (error) throw new Error('Could not delete question.');
      return json({ ok: true });
    }

    if (action === 'reset') {
      if (!Number.isSafeInteger(body.generation) || Number(body.generation) < 0) return json({ error: 'Refresh the app before resetting progress.' }, 400);
      const { data, error } = await admin.rpc('reset_learning_progress', { p_user_id: userId, p_generation: body.generation });
      if (error || !data) throw new Error('Could not reset progress.');
      return json({ stats: gameStatsForClient(data.stats), kingdom: data.kingdom });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
