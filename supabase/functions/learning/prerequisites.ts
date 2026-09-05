export interface RegistryConcept {
  canonical_name: string;
  definition: string;
  mastery: string;
  aliases: string[];
  prerequisites: string[];
  is_atomic: boolean;
  topics: Record<string, number>;
  reasoning_track?: Record<string, number>;
}

export interface QuestionRequirements {
  concept: string;
  requiredConcepts: string[];
  isBossQuestion: boolean;
  reasoningComplexity: string;
}

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export function findRegistryConcept(name: string, registry: RegistryConcept[]) {
  const key = normalize(name);
  // Prefer canonical names to avoid an alias shadowing another concept.
  return registry.find((item) => normalize(item.canonical_name) === key)
    ?? registry.find((item) => item.aliases.some((alias) => normalize(alias) === key));
}

const isProficient = (concept: RegistryConcept | undefined) => Boolean(concept && (
  concept.mastery === 'proficient' || concept.mastery === 'mastered'
  || (concept.is_atomic && concept.prerequisites.length === 0)
));

export function checkQuestionPrerequisites(question: QuestionRequirements, registry: RegistryConcept[]) {
  const target = findRegistryConcept(question.concept, registry);
  const canonicalize = (name: string) => findRegistryConcept(name, registry)?.canonical_name ?? name.trim();
  const concept = target?.canonical_name ?? question.concept.trim();
  // The model cannot erase known dependencies by omitting them from its response.
  const requiredConcepts = [...new Set([
    ...question.requiredConcepts.map(canonicalize),
    ...(target?.prerequisites ?? []).map(canonicalize),
  ])].filter((name) => question.isBossQuestion || normalize(name) !== normalize(concept));
  const unmet = requiredConcepts.filter((name) => !isProficient(findRegistryConcept(name, registry)));
  const reasons = unmet.length ? [`Unmet prerequisites: ${unmet.join(', ')}.`] : [];
  if (!concept) reasons.push('A target concept is required.');
  if (question.isBossQuestion && requiredConcepts.length === 0) {
    reasons.push('A boss question must have verified prerequisite concepts.');
  }
  if (!question.isBossQuestion && (!target || target.mastery === 'unseen')
    && question.reasoningComplexity !== 'directInference') {
    reasons.push('An unseen target concept requires directInference.');
  }
  if (!question.isBossQuestion && target?.mastery === 'learning') {
    const track = target.reasoning_track ?? {};
    const core = ['directInference', 'composition', 'discrimination'];
    const ready = core.every(key => (track[key] ?? 0) >= 1) && core.reduce((sum,key) => sum + (track[key] ?? 0),0) >= 5;
    if (!core.includes(question.reasoningComplexity) && !ready) reasons.push('Practice core reasoning before advanced reasoning.');
  }
  return { concept, requiredConcepts, eligible: reasons.length === 0, reasons };
}

/** Retry rejected candidates before anything is persisted or shown to the learner. */
export async function generateEligibleQuestion(
  generate: (prompt: string) => Promise<Record<string, unknown>>,
  prompt: string,
  registry: RegistryConcept[],
  topic: string,
  recentQuestions: string[] = [],
): Promise<Record<string, unknown> & QuestionRequirements & ReturnType<typeof checkQuestionPrerequisites>> {
  const eligibleConcepts = registry.filter((item) => !item.is_atomic && item.mastery !== 'mastered'
    && checkQuestionPrerequisites({
      concept: item.canonical_name, requiredConcepts: [], isBossQuestion: false,
      reasoningComplexity: 'directInference',
    }, registry).eligible);
  const inTopic = eligibleConcepts.filter((item) => (item.topics[topic] ?? 0) > 0);
  const retryTargets = inTopic;
  const questionKey = (value: string) => normalize(value).replace(/[?!.]+$/, '');
  const seenQuestions = new Set(recentQuestions.map(questionKey));
  let feedback = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const generated = await generate(prompt + feedback);
    const validRequirements = typeof generated.concept === 'string'
      && generated.concept.length <= 200
      && typeof generated.isBossQuestion === 'boolean'
      && typeof generated.reasoningComplexity === 'string'
      && Array.isArray(generated.requiredConcepts)
      && generated.requiredConcepts.length <= 6
      && generated.requiredConcepts.every((name) => typeof name === 'string' && name.trim() && name.length <= 200);
    if (!validRequirements) {
      feedback = '\nThe previous candidate had invalid prerequisite metadata. Supply a concept, a boolean isBossQuestion, reasoningComplexity, and a requiredConcepts array of nonempty names.';
      continue;
    }
    const requirements = generated as unknown as QuestionRequirements;
    const checked = checkQuestionPrerequisites(requirements, registry);
    const target = findRegistryConcept(requirements.concept, registry);
    if (generated.topic !== topic || (target && !(target.topics[topic] > 0))) {
      checked.reasons.push(`The question and target concept must belong to ${topic}. Do not relabel a question from another subject.`);
    }
    if (typeof generated.question !== 'string' || !generated.question.trim()) {
      checked.reasons.push('A nonempty question is required.');
    } else if (seenQuestions.has(questionKey(generated.question))) {
      checked.reasons.push('This question has already been shown. Choose a fresh question, not a paraphrase of it.');
    }
    if (checked.reasons.length === 0) return { ...generated, ...requirements, ...checked };
    feedback = `\nThe previous candidate was rejected: ${checked.reasons.join(' ')}
Generate a different, non-boss directInference question in ${topic}. Do not merely remove prerequisites or relabel the same advanced question.
${retryTargets.length
  ? `Choose one of these eligible concepts: ${retryTargets.map((item) => item.canonical_name).join(', ')}.`
  : 'Choose an accessible foundational concept needing no assumed technical knowledge.'}`;
  }
  throw new Error('Could not generate a fresh question in the selected topic with prerequisites you have learned. Please try again.');
}
