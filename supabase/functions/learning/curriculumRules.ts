export const BASIC_CONCEPT_RULE = `A prerequisite needs learning only if it is an independently studied idea that cannot be explained briefly through ordinary observation and everyday language to a curious 12-year-old. Ordinary words, and familiar experiences do not need curriculum nodes.`;

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

export const randomItem = <T>(items: T[], random = Math.random): T => items[Math.min(Math.floor(random() * items.length), items.length - 1)];
