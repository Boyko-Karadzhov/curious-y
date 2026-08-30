import { Question } from '../../types';

export const QUESTION_SYSTEM_PROMPT = `You are an expert tutor creating engaging, unique, and deeply insightful microlearning questions.
Your task is to generate ONE single, high-quality, thought-provoking multiple-choice question starting with "Why" (e.g., "Why does...", "Why is...", "Why do...", "Why did...").

Guidelines:
1. Topic Focus: Focus strictly on the requested topic and the specific subtopic/angle provided in the prompt.
2. Novelty & Diversity: Avoid repetitive canonical questions (like astronauts on the ISS, why the sky is blue, or standard textbook cliches). Explore rich, diverse concepts within the topic.
3. Question Format: The question text MUST start with "Why".
4. Options: Provide exactly 4 plausible, well-crafted options (A, B, C, D) of similar length.
5. Correct Answer: Exactly one option must be unequivocally correct based on first principles.
6. Common Misconceptions: The 3 incorrect distractors should reflect genuine, common misconceptions rather than obviously absurd choices.
7. Explanation: Provide a clear, intuitive, and educational explanation of why the correct answer is right and the physical/mathematical intuition behind it.
8. LaTeX formatting: When math, chemical formulas, or scientific equations are involved, format them using valid LaTeX enclosed in single dollar signs $...$ for inline or double dollar signs $$...$$ for display math (e.g. $E = mc^2$, $\\int_0^\\infty e^{-x} dx$, $\\text{H}_2\\text{O}$, $\\lim_{h \\to 0}$).

You MUST reply ONLY with a valid JSON object in the following format (no surrounding markdown text or explanations outside JSON):
{
  "topic": "Topic Name",
  "question": "Why does...?",
  "options": [
    "Option A text",
    "Option B text",
    "Option C text",
    "Option D text"
  ],
  "correctIndex": 0,
  "explanation": "Detailed explanation with LaTeX if needed."
}`;

const SUBTOPIC_EXPLORATIONS: Record<string, string[]> = {
  Physics: [
    'Thermodynamics and entropy (Second Law, heat engines, Carnot efficiency, irreversibility)',
    'Quantum mechanics and wave-particle duality (tunneling, photoelectric effect, Heisenberg uncertainty, spin)',
    'Special and general relativity (time dilation, gravitational lensing, equivalence principle, metric curvature)',
    'Fluid dynamics and aerodynamics (Bernoulli effect, viscosity, turbulent vs laminar flow, boundary layers, lift)',
    'Electromagnetism and optics (Maxwell equations, polarization, thin-film interference, Snell refraction, dispersion)',
    'Astrophysics and cosmology (stellar evolution, neutron stars, black hole event horizons, cosmic microwave background)',
    'Acoustics and wave physics (Doppler effect, resonance, harmonic frequencies, standing waves, beats)',
    'Orbital mechanics and gravitation (Lagrange points, escape velocity, tidal forces, Kepler laws, tidal locking)',
    'Nuclear physics and particle interactions (strong/weak nuclear force, alpha/beta decay, binding energy per nucleon)',
    'Solid state and materials physics (superconductivity, semiconductors, bandgap theory, Meissner effect, phonons)'
  ],
  Chemistry: [
    'Thermodynamics and spontaneity (Gibbs free energy $\\Delta G = \\Delta H - T\\Delta S$, endothermic vs exothermic)',
    'Chemical equilibrium (Le Chatelier principle, equilibrium constants $K_c$ and $K_p$, buffer systems)',
    'Atomic structure and periodic trends (electronegativity, ionization energy, electron affinity, shielding effect)',
    'Molecular geometry and bonding ($sp/sp^2/sp^3$ hybridization, VSEPR theory, dipole moments, metallic bonding)',
    'Electrochemistry and redox reactions (galvanic vs electrolytic cells, standard reduction potentials, Nernst equation)',
    'Kinetics and reaction rates (activation energy, Arrhenius equation, catalysis mechanisms, intermediate states)',
    'Organic chemistry mechanisms (nucleophilic substitution $S_N1/S_N2$, electrophilic addition, resonance stabilization)',
    'Intermolecular forces (hydrogen bonding, dipole-dipole, London dispersion forces, vapor pressure)',
    'Solutions and colligative properties (osmotic pressure, boiling point elevation, freezing point depression)',
    'Coordination chemistry (transition metal complexes, crystal field splitting, ligand exchange, colors of complexes)'
  ],
  Calculus: [
    'Derivatives and instantaneous rate of change (product rule, chain rule, implicit differentiation, related rates)',
    'Integration and accumulation (Fundamental Theorem of Calculus, substitution, integration by parts, Riemann sums)',
    'Limits and continuity (epsilon-delta rigor, L\'Hôpital\'s rule, indeterminate forms, squeeze theorem)',
    'Sequences and series (Taylor and Maclaurin expansions, radius of convergence, ratio test, alternating series)',
    'Multivariable calculus (partial derivatives, gradient vectors, directional derivatives, Lagrange multipliers)',
    'Vector calculus and field theorems (curl and divergence, Green\'s theorem, Stokes\' theorem, divergence theorem)',
    'Differential equations (separable equations, integrating factors, exponential growth/decay, harmonic oscillators)',
    'Optimization and curve sketching (inflection points, concavity, second derivative test, critical points)',
    'Geometric applications (arc length, surface area of revolution, solids of revolution via disc/washer/shell methods)',
    'Improper integrals and asymptotic behavior (convergence of $\\int_1^\\infty x^{-p} dx$, Gabriel\'s horn paradox)'
  ],
  Algebra: [
    'Polynomial functions and roots (Fundamental Theorem of Algebra, factor theorem, Descartes\' rule of signs)',
    'Linear algebra and matrices (matrix determinants, invertibility, eigenvalues and eigenvectors, systems of equations)',
    'Exponential and logarithmic properties (logarithmic change of base, Euler\'s identity $e^{i\\pi}+1=0$, compound growth)',
    'Complex numbers (polar/Euler form, De Moivre\'s theorem, complex roots of unity)',
    'Quadratic equations and conic sections (discriminant geometric meaning, parabolas, ellipses, hyperbolas)',
    'Sequences and series (arithmetic and geometric series, binomial theorem, mathematical induction)',
    'Inequalities and optimization (AM-GM inequality, Cauchy-Schwarz, absolute value inequalities)',
    'Abstract algebra concepts (groups, fields, permutations, symmetry groups, isomorphisms)',
    'Vector spaces and basis (linear independence, span, dot product projection, orthogonal vectors)',
    'Rational functions and asymptotes (horizontal/vertical asymptotes, removable discontinuities)'
  ],
  History: [
    'Ancient civilizations and governance (Code of Hammurabi, Athenian democracy, Roman Republic to Empire)',
    'Economic and trade revolutions (Silk Road, Columbian Exchange, mercantilism to capitalism, Bretton Woods)',
    'Scientific and intellectual revolutions (Scientific Revolution, the Enlightenment, printing press dissemination)',
    'Medieval institutions and transformations (feudalism, Magna Carta, Black Death socio-economic impacts, Crusades)',
    'Ages of revolution (American, French, and Haitian revolutions, Industrial Revolution labor shifts)',
    'Geopolitical conflicts and diplomacy (Treaty of Westphalia, Congress of Vienna, causes of World War I/II, Cold War)',
    'Decolonization and independence movements (post-WWII Africa and Asia, Partition of India, Latin American liberation)',
    'Cultural and architectural movements (Renaissance humanism, Islamic Golden Age scholarship, Protestant Reformation)',
    'Technological paradigms (metallurgy transitions, steam engine adoption, cryptography in WWII, digital revolution)',
    'Decline and transformation of empires (Fall of Constantinople, Ming dynasty transitions, decline of Ottoman Empire)'
  ]
};

const ANGLES = [
  'Focus on a surprising or counter-intuitive mechanism that challenges everyday assumptions.',
  'Focus on a deep underlying first principle or rigorous mathematical derivation.',
  'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
  'Focus on a pivotal historical discovery or thought experiment.',
  'Focus on a real-world technological or natural phenomenon explained by fundamental laws.',
  'Focus on resolving a classic paradox or widespread conceptual misconception in the field.'
];

export const getQuestionUserPrompt = (
  topics: string[],
  specificTopic?: string,
  recentQuestions: string[] = []
): string => {
  const chosenTopic = specificTopic || topics[Math.floor(Math.random() * topics.length)] || 'Physics';

  // Sample a subtopic if available
  const subtopicList = SUBTOPIC_EXPLORATIONS[chosenTopic];
  const subtopicFocus = subtopicList
    ? subtopicList[Math.floor(Math.random() * subtopicList.length)]
    : `a core conceptual mechanism within ${chosenTopic}`;

  // Sample an exploratory angle
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

  // Create a randomized nonce to maximize entropy
  const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let prompt = `Generate a brand-new, unique "Why" microlearning multiple-choice question for:
- Topic: "${chosenTopic}"
- Subtopic Focus: "${subtopicFocus}"
- Exploration Angle: ${angle}
- Random Session Entropy: [${nonce}]`;

  if (recentQuestions && recentQuestions.length > 0) {
    const questionsToAvoid = recentQuestions.slice(0, 8).map((q) => `  - "${q}"`).join('\n');
    prompt += `\n\nCRITICAL DIVERSITY RULE:
Do NOT repeat or make a variation of any of these recently asked questions:
${questionsToAvoid}

Choose a completely different concept and angle!`;
  }

  prompt += `\n\nReturn ONLY a valid JSON object matching the required schema.`;

  return prompt;
};

export const getChatSystemPrompt = (questionContext: Question): string => {
  return `You are Curious-Y, an enthusiastic, insightful, and pedagogical AI tutor helping a student learn deeply.

Current Learning Context:
- Topic: ${questionContext.topic}
- Question: ${questionContext.questionText}
- Options:
  0) ${questionContext.options[0]}
  1) ${questionContext.options[1]}
  2) ${questionContext.options[2]}
  3) ${questionContext.options[3]}
- Correct Option: Option ${String.fromCharCode(65 + questionContext.correctIndex)} ("${questionContext.options[questionContext.correctIndex]}")
- Explanation: ${questionContext.explanation}

Instructions:
1. Answer the student's follow-up questions thoughtfully, clearly, and concisely.
2. Build on the concepts presented in the question and explanation.
3. Use LaTeX for math and formulas with $...$ (inline) or $$...$$ (display math) whenever relevant.
4. Keep a friendly, encouraging, and intellectually stimulating tone.`;
};

/**
 * Extracts and parses a JSON object from LLM response text,
 * stripping markdown code fences or extraneous leading/trailing text.
 */
export function extractJsonFromResponse<T>(rawText: string): T {
  let cleaned = rawText.trim();
  
  // Remove markdown code blocks if present (```json ... ``` or ``` ...)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    // If no explicit code block, find first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error('Failed to parse JSON from LLM response:', rawText, err);
    throw new Error('The LLM returned an invalid response format. Please try again.');
  }
}
