import type { RegistryConcept } from './prerequisites.ts';

const conceptDescription = (item: RegistryConcept) =>
    `${item.canonical_name} [${item.mastery}${item.is_atomic && !item.prerequisites.length ? ', atomic foundation' : ''}] topics: ${Object.keys(item.topics).filter(topic => item.topics[topic] > 0).join(', ')}; aliases: ${item.aliases.join(', ') || 'none'}; prerequisites: ${item.prerequisites.join(', ') || 'none'}; definition: ${item.definition}`;

export function generationPrompt(topic: string, concepts: RegistryConcept[], recentQuestions: string[]) {
    const recentText = recentQuestions.slice(0, 20).join('\n- ');
    const conceptText = concepts.map(conceptDescription).join('\n');
    return `You create one rigorous multiple-choice microlearning question for Curious-Y.
Topic: ${topic}
The question and target concept must belong to this topic. Other subjects in the registry are prerequisite context only. If there is no eligible concept in this topic, introduce an accessible foundation within this topic. Never relabel a question from another subject.

The question must begin with "Why" and test causal or conceptual understanding, not trivia. Provide four plausible, mutually exclusive options with exactly one correct answer. Options will be shuffled: do not prefix them with letters or numbers, refer to option positions, or use "all/none of the above". The explanation must clearly justify the answer by its content, without referring to option letters or positions. Keep all prose concise. Use LaTeX when useful.

Pick a concept whose prerequisites are already proficient/mastered (registered atomic leaves also count as mastered). List ALL concepts required to understand the question, options, and explanation in requiredConcepts, excluding the target concept being taught. Unknown concepts do not count as learned. Never omit a prerequisite to make a question eligible. A boss question must have nonempty, already-proficient prerequisites; otherwise teach an eligible prerequisite concept first using a non-boss question. If the registry is empty, choose an accessible foundational non-boss concept requiring no prior technical concepts and use an empty requiredConcepts list. For non-boss questions, follow the server-selected reasoning progression below, including advanced reasoning when the core track is ready even if mastery is still learning.

User concept registry:
${conceptText || '(empty)'}

Do not repeat or closely paraphrase these recent questions:
- ${recentText || '(none)'}

For a new target concept, provide topicWeights with positive finite numbers for its intrinsic disciplines, using only the eight topic names. Include the selected topic. For an existing concept, reuse its canonical identity; the server will preserve its registered weights. Reward distribution does not relax topic membership or prerequisites.
Return only the requested JSON.`.slice(0, 100000);
}
