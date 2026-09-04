import { Concept, TOPICS, TopicName } from '../../types';

/**
 * Curated knowledge base of core scientific and mathematical concepts
 * mapping canonical concept names (lowercase) to their intrinsic multi-topic distribution.
 * Weights always sum to 1.0.
 */
export const CONCEPT_ONTOLOGY: Record<string, Partial<Record<TopicName, number>>> = {
  // Physics & Math / Fluid mechanics / Kinematics
  'velocity': { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
  'fluid dynamics': { 'Physics': 0.8, 'Earth & Space': 0.2 },
  'fluid mechanics': { 'Physics': 0.8, 'Earth & Space': 0.2 },
  'hydrodynamics': { 'Physics': 0.8, 'Earth & Space': 0.2 },
  'acceleration': { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
  'momentum': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'angular momentum': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'conservation of angular momentum': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'inertia': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'moment of inertia': { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
  'torque': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'angular velocity': { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
  'kinetic energy': { 'Physics': 0.9, 'Chemistry': 0.1 },
  'potential energy': { 'Physics': 0.9, 'Chemistry': 0.1 },
  'work': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'power': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'friction': { 'Physics': 0.8, 'Chemistry': 0.2 },
  'viscosity': { 'Physics': 0.7, 'Chemistry': 0.3 },
  "newton's laws of motion": { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  "newton's first law": { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  "newton's second law": { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  "newton's third law": { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },

  // Electromagnetism & Chemistry
  'electric charge': { 'Physics': 0.7, 'Chemistry': 0.3 },
  'electromagnetic radiation': { 'Physics': 0.7, 'Chemistry': 0.3 },
  'electromagnetism': { 'Physics': 0.8, 'Chemistry': 0.2 },
  'electric field': { 'Physics': 0.8, 'Chemistry': 0.2 },
  'magnetic field': { 'Physics': 0.8, 'Earth & Space': 0.2 },
  'electrostatic force': { 'Physics': 0.8, 'Chemistry': 0.2 },
  "coulomb's law": { 'Physics': 0.8, 'Chemistry': 0.2 },
  'coulomb potential': { 'Physics': 0.8, 'Chemistry': 0.2 },
  'lorentz force': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'electromagnetic spectrum': { 'Physics': 0.7, 'Chemistry': 0.3 },
  'photon': { 'Physics': 0.7, 'Chemistry': 0.3 },
  'speed of light': { 'Physics': 0.9, 'Earth & Space': 0.1 },
  'wavelength': { 'Physics': 0.8, 'Chemistry': 0.2 },
  'wave frequency': { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
  'wavefront': { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  'phase velocity': { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
  'refractive index': { 'Physics': 0.8, 'Chemistry': 0.2 },
  "snell's law": { 'Physics': 0.9, 'Mathematics & Logic': 0.1 },
  "fermat's principle": { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },
  'optical path length': { 'Physics': 0.8, 'Mathematics & Logic': 0.2 },

  // Thermodynamics & Statistical Mechanics
  'thermodynamics': { 'Physics': 0.6, 'Chemistry': 0.4 },
  'entropy': { 'Physics': 0.5, 'Chemistry': 0.4, 'Mathematics & Logic': 0.1 },
  'conservation of energy': { 'Physics': 0.7, 'Chemistry': 0.2, 'Earth & Space': 0.1 },
  'ideal gas law': { 'Physics': 0.5, 'Chemistry': 0.5 },
  'brownian motion': { 'Physics': 0.6, 'Chemistry': 0.3, 'Mathematics & Logic': 0.1 },
  'diffusion': { 'Chemistry': 0.5, 'Physics': 0.3, 'Life': 0.2 },
  'osmosis': { 'Life': 0.6, 'Chemistry': 0.3, 'Physics': 0.1 },
  'thermal conductivity': { 'Physics': 0.7, 'Chemistry': 0.3 },
  'specific heat capacity': { 'Physics': 0.6, 'Chemistry': 0.4 },

  // Chemistry Core
  'chemical bond': { 'Chemistry': 0.8, 'Physics': 0.2 },
  'covalent bond': { 'Chemistry': 0.8, 'Physics': 0.2 },
  'ionic bond': { 'Chemistry': 0.8, 'Physics': 0.2 },
  'hydrogen bond': { 'Chemistry': 0.7, 'Life': 0.3 },
  'electronegativity': { 'Chemistry': 0.8, 'Physics': 0.2 },
  'atomic orbital': { 'Chemistry': 0.6, 'Physics': 0.4 },
  'valence electron': { 'Chemistry': 0.8, 'Physics': 0.2 },
  'redox reaction': { 'Chemistry': 0.9, 'Physics': 0.1 },
  'oxidation state': { 'Chemistry': 0.9, 'Physics': 0.1 },
  'activation energy': { 'Chemistry': 0.7, 'Physics': 0.3 },
  'catalysis': { 'Chemistry': 0.8, 'Life': 0.2 },
  'enthalpy': { 'Chemistry': 0.7, 'Physics': 0.3 },
  'gibbs free energy': { 'Chemistry': 0.7, 'Physics': 0.3 },
  'acid-base reaction': { 'Chemistry': 0.9, 'Life': 0.1 },
  'ph scale': { 'Chemistry': 0.8, 'Life': 0.2 },

  // Earth & Space + Physics
  'coriolis effect': { 'Earth & Space': 0.6, 'Physics': 0.4 },
  'atmospheric pressure': { 'Earth & Space': 0.6, 'Physics': 0.4 },
  'atmospheric circulation': { 'Earth & Space': 0.7, 'Physics': 0.3 },
  'ocean current': { 'Earth & Space': 0.7, 'Physics': 0.3 },
  'plate tectonics': { 'Earth & Space': 0.8, 'Physics': 0.2 },
  'seismic waves': { 'Earth & Space': 0.7, 'Physics': 0.3 },
  'gravitational orbit': { 'Earth & Space': 0.6, 'Physics': 0.4 },
  'escape velocity': { 'Physics': 0.6, 'Earth & Space': 0.4 },
  "kepler's laws": { 'Earth & Space': 0.6, 'Physics': 0.4 },
  'stellar evolution': { 'Earth & Space': 0.6, 'Physics': 0.4 },
  'stellar nucleosynthesis': { 'Earth & Space': 0.5, 'Physics': 0.3, 'Chemistry': 0.2 },
  'black hole': { 'Physics': 0.6, 'Earth & Space': 0.4 },
  'supernova': { 'Earth & Space': 0.6, 'Physics': 0.4 },
  'solar wind': { 'Earth & Space': 0.6, 'Physics': 0.4 },

  // Life & Biochemistry
  'dna': { 'Life': 0.8, 'Chemistry': 0.2 },
  'rna': { 'Life': 0.8, 'Chemistry': 0.2 },
  'dna replication': { 'Life': 0.8, 'Chemistry': 0.2 },
  'protein synthesis': { 'Life': 0.8, 'Chemistry': 0.2 },
  'enzyme': { 'Life': 0.7, 'Chemistry': 0.3 },
  'enzyme kinetics': { 'Life': 0.6, 'Chemistry': 0.4 },
  'cellular respiration': { 'Life': 0.7, 'Chemistry': 0.3 },
  'photosynthesis': { 'Life': 0.7, 'Chemistry': 0.3 },
  'atp synthesis': { 'Life': 0.7, 'Chemistry': 0.3 },
  'natural selection': { 'Life': 0.9, 'Society & History': 0.1 },
  'evolution': { 'Life': 0.9, 'Earth & Space': 0.1 },
  'action potential': { 'Life': 0.6, 'Physics': 0.3, 'Mind & Behavior': 0.1 },
  'neuron': { 'Life': 0.6, 'Mind & Behavior': 0.4 },
  'synapse': { 'Life': 0.6, 'Mind & Behavior': 0.4 },
  'neurotransmitter': { 'Life': 0.6, 'Mind & Behavior': 0.3, 'Chemistry': 0.1 },

  // Mathematics & Logic
  'derivative': { 'Mathematics & Logic': 0.8, 'Physics': 0.2 },
  'integral': { 'Mathematics & Logic': 0.8, 'Physics': 0.2 },
  'limits': { 'Mathematics & Logic': 0.9, 'Physics': 0.1 },
  "euler's number": { 'Mathematics & Logic': 1.0 },
  'continuous growth': { 'Mathematics & Logic': 0.8, 'Life': 0.2 },
  'difference quotient': { 'Mathematics & Logic': 0.9, 'Physics': 0.1 },
  'matrix': { 'Mathematics & Logic': 0.7, 'Computer Science': 0.3 },
  'vector': { 'Mathematics & Logic': 0.6, 'Physics': 0.4 },
  'eigenvalue': { 'Mathematics & Logic': 0.7, 'Physics': 0.3 },
  'graph theory': { 'Mathematics & Logic': 0.5, 'Computer Science': 0.5 },
  'probability distribution': { 'Mathematics & Logic': 0.8, 'Computer Science': 0.2 },
  'boolean algebra': { 'Mathematics & Logic': 0.6, 'Computer Science': 0.4 },

  // Computer Science
  'algorithm': { 'Computer Science': 0.8, 'Mathematics & Logic': 0.2 },
  'binary search': { 'Computer Science': 0.9, 'Mathematics & Logic': 0.1 },
  'sorting algorithm': { 'Computer Science': 0.9, 'Mathematics & Logic': 0.1 },
  'hash table': { 'Computer Science': 0.9, 'Mathematics & Logic': 0.1 },
  'computational complexity': { 'Computer Science': 0.7, 'Mathematics & Logic': 0.3 },
  'turing machine': { 'Computer Science': 0.7, 'Mathematics & Logic': 0.3 },
  'neural network': { 'Computer Science': 0.7, 'Mind & Behavior': 0.3 },
  'machine learning': { 'Computer Science': 0.8, 'Mathematics & Logic': 0.2 },
  'recursion': { 'Computer Science': 0.8, 'Mathematics & Logic': 0.2 },

  // Mind & Behavior
  'working memory': { 'Mind & Behavior': 0.8, 'Computer Science': 0.2 },
  'classical conditioning': { 'Mind & Behavior': 0.9, 'Life': 0.1 },
  'operant conditioning': { 'Mind & Behavior': 0.9, 'Life': 0.1 },
  'cognitive dissonance': { 'Mind & Behavior': 0.8, 'Society & History': 0.2 },
  'perception': { 'Mind & Behavior': 0.8, 'Life': 0.2 },

  // Society & History
  'inflation': { 'Society & History': 0.8, 'Mathematics & Logic': 0.2 },
  'supply and demand': { 'Society & History': 0.9, 'Mind & Behavior': 0.1 },
  'division of labor': { 'Society & History': 0.9, 'Mind & Behavior': 0.1 },
};

/**
 * Checks if a string is one of the 8 canonical TopicNames.
 */
export function isCanonicalTopic(name: string): name is TopicName {
  return (TOPICS as readonly string[]).includes(name);
}

/**
 * Finds the closest canonical topic name (case-insensitive and trimmed).
 */
export function matchCanonicalTopic(name: string): TopicName | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const trimmed = name.trim().toLowerCase();
  for (const t of TOPICS) {
    if (t.toLowerCase() === trimmed) return t;
  }
  // Soft matching
  if (trimmed.includes('physic')) return 'Physics';
  if (trimmed.includes('math') || trimmed.includes('logic')) return 'Mathematics & Logic';
  if (trimmed.includes('chem')) return 'Chemistry';
  if (trimmed.includes('life') || trimmed.includes('bio')) return 'Life';
  if (trimmed.includes('comput') || trimmed.includes('cs')) return 'Computer Science';
  if (trimmed.includes('earth') || trimmed.includes('space') || trimmed.includes('astro')) return 'Earth & Space';
  if (trimmed.includes('mind') || trimmed.includes('behav') || trimmed.includes('psych')) return 'Mind & Behavior';
  if (trimmed.includes('society') || trimmed.includes('history') || trimmed.includes('econ')) return 'Society & History';
  return undefined;
}

/**
 * Normalizes weights in a topic record so they sum to 1.0 (rounded to 2 decimal places).
 */
export function roundAndNormalizeWeights(weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([_, w]) => typeof w === 'number' && w > 0);
  if (entries.length === 0) return { 'Physics': 1.0 };

  const sum = entries.reduce((acc, [_, w]) => acc + w, 0);
  if (sum <= 0) return { 'Physics': 1.0 };

  const normalized: Record<string, number> = {};
  let allocated = 0;
  // Sort descending
  entries.sort((a, b) => b[1] - a[1]);

  for (let i = 0; i < entries.length; i++) {
    const [topic, w] = entries[i];
    if (i === entries.length - 1) {
      // Last entry receives the remaining weight to ensure exact 1.0
      const remainder = Math.max(0.05, Math.round((1.0 - allocated) * 100) / 100);
      normalized[topic] = remainder;
    } else {
      const share = Math.round((w / sum) * 100) / 100;
      normalized[topic] = share;
      allocated += share;
    }
  }

  return normalized;
}

/**
 * Checks if a concept has known misclassified topics (e.g. Velocity or Fluid dynamics in Earth & Space,
 * or Electric charge or Electromagnetic radiation solely in Chemistry).
 */
export function isKnownMisclassification(canonicalName: string, topics?: Record<string, number>): boolean {
  if (!topics || Object.keys(topics).length === 0) return true;

  const norm = canonicalName.trim().toLowerCase();
  const topicKeys = Object.keys(topics);
  const primaryTopic = topicKeys.length === 1 ? topicKeys[0] : undefined;

  // Velocity / Fluid dynamics in Earth & Space
  if (
    (norm.includes('velocity') || norm.includes('fluid dynamics') || norm.includes('fluid mechanics')) &&
    primaryTopic === 'Earth & Space'
  ) {
    return true;
  }

  // Electric charge / Electromagnetic radiation in Chemistry (missing Physics as primary)
  if (
    (norm.includes('electric charge') || norm.includes('electromagnetic radiation') || norm.includes('coulomb')) &&
    primaryTopic === 'Chemistry'
  ) {
    return true;
  }

  // If in ontology, check if current primary topic is completely absent from ontology
  const ontologyEntry = CONCEPT_ONTOLOGY[norm];
  if (ontologyEntry) {
    const ontologyPrimary = Object.entries(ontologyEntry).sort((a, b) => b[1] - a[1])[0][0];
    if (primaryTopic && !ontologyEntry[primaryTopic as TopicName] && primaryTopic !== ontologyPrimary) {
      return true;
    }
  }

  return false;
}

/**
 * Domain keywords for heuristic classification of concepts that aren't in the ontology dictionary.
 */
const DOMAIN_KEYWORDS: Record<TopicName, string[]> = {
  'Physics': [
    'velocity', 'acceleration', 'momentum', 'force', 'friction', 'kinetic', 'potential',
    'gravity', 'gravitation', 'quantum', 'wave', 'optics', 'refraction', 'diffraction',
    'interference', 'photon', 'electromagnet', 'magnetic', 'thermodynamic', 'entropy',
    'relativity', 'mass', 'fluid', 'pressure', 'torque', 'oscillation', 'harmonic',
    'frequency', 'wavelength', 'snell', 'fermat', 'bernoulli', 'newton', 'coulomb', 'voltage'
  ],
  'Chemistry': [
    'molecule', 'molecular', 'atom', 'atomic', 'reaction', 'covalent', 'ionic', 'bond',
    'electronegativity', 'redox', 'oxidation', 'reduction', 'acid', 'base', 'ph', 'catalyst',
    'reagent', 'solvent', 'solute', 'orbital', 'valence', 'enthalpy', 'stoichiometry', 'polymer'
  ],
  'Mathematics & Logic': [
    'calculus', 'derivative', 'integral', 'limit', 'function', 'vector', 'matrix',
    'linear algebra', 'probability', 'statistics', 'topology', 'theorem', 'axiom', 'proof',
    'combinatorics', 'euler', 'boolean', 'equation', 'differential'
  ],
  'Life': [
    'cell', 'cellular', 'dna', 'rna', 'protein', 'gene', 'genetic', 'organism', 'species',
    'evolution', 'natural selection', 'photosynthesis', 'respiration', 'membrane', 'neuron',
    'synapse', 'enzyme', 'metabolism', 'pathogen', 'bacteria', 'ecology'
  ],
  'Earth & Space': [
    'earth', 'planet', 'planetary', 'atmosphere', 'atmospheric', 'climate', 'ocean',
    'geology', 'tectonic', 'crust', 'mantle', 'seismic', 'volcano', 'orbit', 'stellar',
    'star', 'galaxy', 'cosmology', 'solar', 'coriolis', 'tide', 'black hole'
  ],
  'Computer Science': [
    'algorithm', 'data structure', 'binary search', 'sorting', 'tree', 'graph', 'compiler',
    'concurrency', 'cryptography', 'database', 'machine learning', 'turing', 'recursion',
    'computational', 'network', 'protocol', 'software'
  ],
  'Mind & Behavior': [
    'cognition', 'cognitive', 'perception', 'psychology', 'memory', 'conditioning',
    'behavior', 'behavioral', 'emotion', 'bias', 'heuristic', 'neuroscience', 'sensory'
  ],
  'Society & History': [
    'economy', 'economic', 'market', 'inflation', 'supply', 'demand', 'society', 'civilization',
    'history', 'government', 'institution', 'trade', 'culture', 'anthropology'
  ],
};

/**
 * Infers a multi-topic distribution for a concept using ontology lookup and keyword heuristics.
 */
export function inferConceptTopics(
  canonicalName: string,
  definition?: string,
  fallbackTopic?: string
): Record<string, number> {
  const normName = canonicalName.trim().toLowerCase();

  // 1. Exact or partial ontology lookup
  if (CONCEPT_ONTOLOGY[normName]) {
    return { ...CONCEPT_ONTOLOGY[normName] };
  }

  for (const [key, dist] of Object.entries(CONCEPT_ONTOLOGY)) {
    if (normName === key || normName.includes(key) || key.includes(normName)) {
      return { ...dist };
    }
  }

  // 2. Keyword score analysis across canonicalName and definition
  const text = `${canonicalName} ${definition || ''}`.toLowerCase();
  const scores: Partial<Record<TopicName, number>> = {};

  for (const [topic, keywords] of Object.entries(DOMAIN_KEYWORDS) as [TopicName, string[]][]) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        // Name matches weigh more than definition matches
        score += normName.includes(kw) ? 3 : 1;
      }
    }
    if (score > 0) {
      scores[topic] = score;
    }
  }

  const scoredEntries = Object.entries(scores) as [TopicName, number][];
  scoredEntries.sort((a, b) => b[1] - a[1]);

  if (scoredEntries.length === 1) {
    // Single strong match
    const primary = scoredEntries[0][0];
    // Check if it's a topic that frequently bridges with Math or Physics
    if (primary === 'Physics') {
      return { 'Physics': 0.8, 'Mathematics & Logic': 0.2 };
    }
    if (primary === 'Earth & Space') {
      return { 'Earth & Space': 0.8, 'Physics': 0.2 };
    }
    if (primary === 'Chemistry') {
      return { 'Chemistry': 0.8, 'Physics': 0.2 };
    }
    if (primary === 'Life') {
      return { 'Life': 0.8, 'Chemistry': 0.2 };
    }
    if (primary === 'Computer Science') {
      return { 'Computer Science': 0.8, 'Mathematics & Logic': 0.2 };
    }
    return { [primary]: 1.0 };
  }

  if (scoredEntries.length >= 2) {
    const primary = scoredEntries[0][0];
    const secondary = scoredEntries[1][0];
    const topSum = scoredEntries[0][1] + scoredEntries[1][1];
    const pWeight = Math.max(0.6, Math.min(0.85, Math.round((scoredEntries[0][1] / topSum) * 100) / 100));
    const sWeight = Math.round((1.0 - pWeight) * 100) / 100;
    return { [primary]: pWeight, [secondary]: sWeight };
  }

  // 3. Fallback to context topic
  const fallback = matchCanonicalTopic(fallbackTopic || '') || 'Physics';
  return { [fallback]: 1.0 };
}

/**
 * Normalizes raw topics from any provider (array format from JSON Schema or object format)
 * into a valid `Record<string, number>` with canonical topic names and weights summing to 1.0.
 * Also corrects known misclassifications like Velocity in Earth & Space.
 */
export function normalizeConceptTopics(
  rawTopics: unknown,
  canonicalName?: string,
  definition?: string,
  fallbackTopic?: string
): Record<string, number> {
  const result: Record<string, number> = {};

  // Case 1: Array of { topic, weight }
  if (Array.isArray(rawTopics)) {
    for (const item of rawTopics) {
      if (item && typeof item === 'object') {
        const rawName = (item as { topic?: unknown; weight?: unknown }).topic;
        const rawWeight = (item as { topic?: unknown; weight?: unknown }).weight;
        if (typeof rawName === 'string') {
          const matched = matchCanonicalTopic(rawName);
          if (matched) {
            const w = typeof rawWeight === 'number' && !isNaN(rawWeight) && rawWeight > 0 ? rawWeight : 0.5;
            result[matched] = (result[matched] || 0) + w;
          }
        }
      }
    }
  }
  // Case 2: Record<string, number>
  else if (rawTopics && typeof rawTopics === 'object') {
    for (const [key, val] of Object.entries(rawTopics as Record<string, unknown>)) {
      const matched = matchCanonicalTopic(key);
      if (matched) {
        const numVal = typeof val === 'number' && !isNaN(val) && val > 0 ? val : 0.5;
        result[matched] = (result[matched] || 0) + numVal;
      }
    }
  }

  // Check if we need to infer or correct
  if (canonicalName && (Object.keys(result).length === 0 || isKnownMisclassification(canonicalName, result))) {
    return inferConceptTopics(canonicalName, definition, fallbackTopic);
  }

  if (Object.keys(result).length === 0) {
    const defaultTopic = matchCanonicalTopic(fallbackTopic || '') || 'Physics';
    return { [defaultTopic]: 1.0 };
  }

  return roundAndNormalizeWeights(result);
}

/**
 * Merges topic distributions when saving a concept, prioritizing richer multi-topic
 * distributions over legacy single-topic assignments and fixing known misclassifications.
 */
export function mergeConceptTopics(
  newTopics?: Record<string, number>,
  prevTopics?: Record<string, number>,
  canonicalName?: string
): Record<string, number> {
  const validNew = newTopics && Object.keys(newTopics).length > 0;
  const validPrev = prevTopics && Object.keys(prevTopics).length > 0;

  if (canonicalName && validPrev && isKnownMisclassification(canonicalName, prevTopics)) {
    if (validNew && !isKnownMisclassification(canonicalName, newTopics)) {
      return roundAndNormalizeWeights(newTopics!);
    }
    return inferConceptTopics(canonicalName);
  }

  if (validNew && Object.keys(newTopics!).length > 1) {
    // New has multi-topic distribution -> prefer it
    return roundAndNormalizeWeights(newTopics!);
  }

  if (!validPrev) {
    return validNew ? roundAndNormalizeWeights(newTopics!) : { 'Physics': 1.0 };
  }

  if (!validNew) {
    return roundAndNormalizeWeights(prevTopics!);
  }

  // Blend weights from both
  const merged: Record<string, number> = { ...prevTopics };
  for (const [t, w] of Object.entries(newTopics!)) {
    merged[t] = (merged[t] || 0) + w;
  }
  return roundAndNormalizeWeights(merged);
}

/**
 * Reclassifies a concept to have an accurate, multi-topic distribution
 * based on ontology knowledge and domain heuristics while preserving all progress.
 */
export function reclassifyConcept(concept: Concept): Concept {
  const updatedTopics = inferConceptTopics(concept.canonicalName, concept.definition);
  return {
    ...concept,
    topics: updatedTopics,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reclassifies an array of concepts.
 */
export function reclassifyConcepts(concepts: Concept[]): Concept[] {
  return concepts.map((c) => reclassifyConcept(c));
}
