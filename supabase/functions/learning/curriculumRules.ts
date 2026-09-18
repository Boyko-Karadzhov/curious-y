export const BASIC_CONCEPT_RULE = `A prerequisite needs learning whenever the parent would otherwise assume unexplained domain knowledge. A leaf must have a self-contained intuition that a curious 12-year-old can understand using everyday language and primary-school ideas alone. A short definition does not make a specialist category, structure, process, law, or mathematical operation foundational. If a definition relies on unfamiliar technical nouns or hidden mechanisms, make those ideas direct dependencies. Stop before decomposing ordinary words, familiar experiences, or basic ideas such as counting, comparison, cause and effect, and physical objects.`;

/* novel angles
export const ANGLES = [
    'First principles — explain from fundamental rules',
    'Counterintuitive mechanism — why reality differs from intuition',
    'Micro to macro — how lower-level behavior produces emergence',
    'Paradox — reconcile apparently conflicting facts',
    'Historical discovery — how evidence changed our understanding',
    'Boundary or failure case — where a model stops working and why',
    'Counterfactual — predict what changes under a different assumption',
    'Real-world design — apply an idea to solve a concrete problem',
];
*/

export const ANGLES = [
    'Focus on a surprising or counter-intuitive mechanism that challenges everyday assumptions.',
    'Focus on a deep underlying first principle or rigorous mathematical derivation.',
    'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
    'Focus on a pivotal historical discovery or thought experiment.',
    'Focus on a real-world technological or natural phenomenon explained by fundamental laws.',
    'Focus on resolving a classic paradox or widespread conceptual misconception in the field.'
];

export const randomItem = <T>(items: T[], random = Math.random): T => items[Math.min(Math.floor(random() * items.length), items.length - 1)];
