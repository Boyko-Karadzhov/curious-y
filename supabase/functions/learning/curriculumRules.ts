export const BASIC_CONCEPT_RULE = `A prerequisite needs learning only if it is an independently studied idea that cannot be explained briefly through ordinary observation and everyday language to a curious 12-year-old. Ordinary words, and familiar experiences do not need curriculum nodes.`;

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
