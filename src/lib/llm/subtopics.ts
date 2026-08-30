import { UserSettings } from '../../types';
import { extractJsonFromResponse } from './prompt';
import { getCachedSubtopics, cacheSubtopicsForTopic } from '../../services/database';

export const DEFAULT_SUBTOPIC_EXPLORATIONS: Record<string, string[]> = {
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

const SUBTOPIC_GENERATION_SYSTEM_PROMPT = `You are an expert curriculum designer and academic domain specialist.
Your task is to decompose a given topic into 8 to 12 distinct, high-impact, and intellectually stimulating subtopics or conceptual mechanisms for microlearning "Why" questions.

Requirements:
1. Each subtopic must be a concise theme followed by a parenthetical containing 2-4 key principles, mechanisms, equations, or famous examples.
2. Ensure subtopics cover foundational concepts, advanced mechanisms, historical breakthroughs, counter-intuitive phenomena, and real-world applications.
3. Respond ONLY with a valid JSON object matching this schema:
{
  "subtopics": [
    "Subtopic Name (e.g. key concept 1, mechanism 2, equation 3)",
    "..."
  ]
}`;

export function generateGenericSubtopics(topic: string): string[] {
  const t = topic.trim();
  return [
    `Foundations and core theoretical principles of ${t}`,
    `Key underlying mechanisms and governing laws in ${t}`,
    `Counter-intuitive paradoxes and unexpected phenomena in ${t}`,
    `Pivotal historical breakthroughs and revolutionary discoveries in ${t}`,
    `Mathematical derivations and quantitative relationships in ${t}`,
    `Everyday natural phenomena and modern technologies enabled by ${t}`,
    `Microscopic vs macroscopic interactions in ${t}`,
    `Common conceptual misconceptions and critical edge cases in ${t}`,
    `Advanced frameworks and contemporary frontiers in ${t}`,
  ];
}

export async function generateSubtopicsViaLLM(
  settings: UserSettings,
  topic: string
): Promise<string[]> {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) {
    return generateGenericSubtopics(topic);
  }

  const userPrompt = `Generate 8 to 12 diverse subtopics and key mechanisms for microlearning questions on the topic: "${topic}". Return JSON ONLY.`;

  try {
    let rawText = '';

    if (settings.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: SUBTOPIC_GENERATION_SYSTEM_PROMPT }] },
          generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) throw new Error(`Gemini subtopic error (${res.status})`);
      const data = await res.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (settings.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model || 'gpt-4o',
          messages: [
            { role: 'system', content: SUBTOPIC_GENERATION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.8,
        }),
      });

      if (!res.ok) throw new Error(`OpenAI subtopic error (${res.status})`);
      const data = await res.json();
      rawText = data.choices?.[0]?.message?.content || '';
    } else if (settings.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: settings.model || 'claude-3-7-sonnet-20250219',
          system: SUBTOPIC_GENERATION_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 1024,
          temperature: 0.8,
        }),
      });

      if (!res.ok) throw new Error(`Anthropic subtopic error (${res.status})`);
      const data = await res.json();
      rawText = data.content?.[0]?.text || '';
    }

    if (!rawText) {
      return generateGenericSubtopics(topic);
    }

    const parsed = extractJsonFromResponse<{ subtopics?: string[] }>(rawText);
    if (parsed.subtopics && Array.isArray(parsed.subtopics) && parsed.subtopics.length >= 3) {
      return parsed.subtopics.map((s) => String(s).trim()).filter(Boolean);
    }

    return generateGenericSubtopics(topic);
  } catch (err) {
    console.warn(`Failed to generate subtopics via LLM for "${topic}", using fallback:`, err);
    return generateGenericSubtopics(topic);
  }
}

/**
 * Retrieves subtopics from default catalog or user cache;
 * if not found, generates via LLM and persists in cache.
 */
export async function getOrGenerateSubtopics(
  settings: UserSettings,
  topic: string,
  userId: string,
  isDemoUser: boolean = false
): Promise<string[]> {
  const trimmed = topic.trim();
  if (!trimmed) {
    return DEFAULT_SUBTOPIC_EXPLORATIONS['Physics'];
  }

  // 1. Check default catalog (case-insensitive)
  const defaultKey = Object.keys(DEFAULT_SUBTOPIC_EXPLORATIONS).find(
    (k) => k.toLowerCase() === trimmed.toLowerCase()
  );
  if (defaultKey) {
    return DEFAULT_SUBTOPIC_EXPLORATIONS[defaultKey];
  }

  // 2. Check user's persistent cached subtopics
  const cachedMap = getCachedSubtopics(userId);
  const cached = cachedMap[trimmed] || cachedMap[trimmed.toLowerCase()];
  if (cached && Array.isArray(cached) && cached.length >= 3) {
    return cached;
  }

  // 3. Demo user without key -> use generic generator
  if (isDemoUser && (!settings.apiKey || !settings.apiKey.trim())) {
    const generic = generateGenericSubtopics(trimmed);
    cacheSubtopicsForTopic(userId, trimmed, generic);
    return generic;
  }

  // 4. Generate via LLM and persist
  const generated = await generateSubtopicsViaLLM(settings, trimmed);
  if (generated && generated.length > 0) {
    cacheSubtopicsForTopic(userId, trimmed, generated);
  }

  return generated;
}

/**
 * Asynchronously pre-generates and caches subtopics for a list of topics in the background.
 */
export async function preloadCustomSubtopics(
  settings: UserSettings,
  topics: string[],
  userId: string,
  isDemoUser: boolean = false
): Promise<void> {
  const cachedMap = getCachedSubtopics(userId);

  for (const topic of topics) {
    const trimmed = topic.trim();
    if (!trimmed) continue;

    const isDefault = Object.keys(DEFAULT_SUBTOPIC_EXPLORATIONS).some(
      (k) => k.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDefault) continue;

    const isCached = !!(cachedMap[trimmed] || cachedMap[trimmed.toLowerCase()]);
    if (!isCached) {
      // Generate in background and cache
      getOrGenerateSubtopics(settings, trimmed, userId, isDemoUser).catch((e) => {
        console.warn(`Background subtopic preload failed for "${trimmed}":`, e);
      });
    }
  }
}
