export const REASONING_COMPLEXITY_INFO = {
    directInference: {
        name: 'Direct inference',
        description: 'Apply one mastered concept to obtain a consequence.'
    },
    composition: {
        name: 'Composition',
        description: 'Combine several mastered concepts into a reasoning chain.'
    },
    discrimination: {
        name: 'Discrimination',
        description: 'Distinguish between plausible competing explanations.'
    },
    transfer: {
        name: 'Transfer',
        description: 'Recognize and apply concepts in an unfamiliar context.'
    },
    counterfactual: {
        name: 'Counterfactual',
        description: 'Change or remove an assumption and reason through the consequences.'
    },
    synthesis: {
        name: 'Synthesis',
        description: 'Integrate multiple concepts to resolve a complex phenomenon.'
    },
    derivation: {
        name: 'Derivation',
        description: 'Reconstruct a result from deeper principles with minimal assumptions.'
    }
} as const;

export type ReasoningComplexity = keyof typeof REASONING_COMPLEXITY_INFO;
export const REASONING_COMPLEXITIES = Object.keys(REASONING_COMPLEXITY_INFO) as ReasoningComplexity[];
