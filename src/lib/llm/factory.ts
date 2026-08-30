import { Question, ChatMessage, UserSettings, LLMProvider, DEFAULT_TOPICS, WrongQuestionContext } from '../../types';
import { generateGeminiQuestion, chatWithGemini, testGeminiKey } from './gemini';
import { generateOpenAIQuestion, chatWithOpenAI, testOpenAIKey } from './openai';
import { generateAnthropicQuestion, chatWithAnthropic, testAnthropicKey } from './anthropic';
import { getOrGenerateSubtopics } from './subtopics';

// Sample questions used EXCLUSIVELY in Explorer Demo mode when no LLM key is configured
const SAMPLE_QUESTIONS: Record<string, Question[]> = {
  Physics: [
    {
      topic: 'Physics',
      subtopic: 'Electromagnetism and optics (Maxwell equations, polarization, thin-film interference, Snell refraction, dispersion)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Examines Fermat\'s principle of least time and wave phase velocity slowing in denser media as the foundational derivation of Snell\'s Law.',
      questionText: 'Why does light bend (refract) when entering a denser medium like water or glass?',
      options: [
        'Because the frequency of light decreases due to resistance in the medium',
        'Because wave crests travel slower in the denser medium, causing the wavefront to pivot (Fermat\'s principle)',
        'Because photons collide with atoms and bounce at a fixed angle',
        'Because gravitational attraction from dense atoms pulls the light ray downward'
      ],
      correctIndex: 1,
      explanation: 'According to Fermat\'s principle of least time and Snell\'s Law ($n_1 \\sin \\theta_1 = n_2 \\sin \\theta_2$), light takes the path that minimizes travel time. In an optically denser medium, light propagates at a lower phase velocity $v = \\frac{c}{n}$. As one side of a wavefront hits the boundary and slows down before the other, the entire beam pivots towards the normal line.',
      suggestedQuestions: [
        'How does the refractive index $n$ relate to the phase velocity $v = \\frac{c}{n}$ in a medium?',
        'How does Fermat\'s principle of least time derive the relationship in Snell\'s Law $n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2$?',
        'Why does light frequency stay constant while wavelength shortens upon entering a denser medium?',
        'What happens to the wavefront angle when the refractive indices of two media are identical?'
      ]
    },
    {
      topic: 'Physics',
      subtopic: 'Classical mechanics (conservation laws, angular momentum, rotational dynamics)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Explores how conservation of angular momentum $L = I\\omega$ strictly dictates rotational acceleration as mass distribution changes without external torque.',
      questionText: 'Why does a spinning ice skater rotate faster when pulling their arms inward?',
      options: [
        'Because their kinetic energy increases due to centrifugal force',
        'Because pulling their arms decreases their moment of inertia $I$, conserving angular momentum $L = I\\omega$',
        'Because air resistance decreases drastically when arms are tucked in',
        'Because muscle contraction generates an external torque that accelerates the rotation'
      ],
      correctIndex: 1,
      explanation: 'In the absence of external torques ($\\tau_{\\text{net}} = 0$), total angular momentum $L = I \\omega$ is conserved. When the skater pulls in their arms, mass moves closer to the rotation axis, drastically decreasing their moment of inertia ($I = \\sum m_i r_i^2$). To keep $L$ constant, angular velocity $\\omega$ must increase.',
      suggestedQuestions: [
        'How does moment of inertia $I = \\sum m_i r_i^2$ depend on the radial distance $r$ from the axis?',
        'Why is angular momentum $L = I\\omega$ conserved while rotational kinetic energy increases?',
        'How does the absence of net external torque ($\\tau_{\\text{net}} = 0$) guarantee constant angular momentum?',
        'What work is done by the skater\'s muscles to pull their arms inward against centrifugal effects?'
      ]
    },
    {
      topic: 'Physics',
      subtopic: 'Orbital mechanics and gravitation (Lagrange points, escape velocity, tidal forces, Kepler laws, tidal locking)',
      angle: 'Focus on resolving a classic paradox or widespread conceptual misconception in the field.',
      angleFit: 'Dispels the widespread misconception that astronauts float due to zero gravity, showing they are in perpetual free-fall with $90\\%$ surface gravity.',
      questionText: 'Why do astronauts aboard the International Space Station float in weightlessness despite Earth\'s gravity being $\\sim 90\\%$ as strong at their altitude?',
      options: [
        'Because the ISS is outside Earth\'s gravitational pull in a vacuum',
        'Because the station and astronauts are in continuous free-fall orbit where gravity acts entirely as centripetal acceleration',
        'Because magnetic shielding on the space station cancels Earth\'s gravitational field',
        'Because atmospheric drag is zero, removing normal gravitational force'
      ],
      correctIndex: 1,
      explanation: 'At an altitude of $\\sim 400\\text{ km}$, Earth\'s gravitational acceleration is still $\\sim 8.7\\text{ m/s}^2$ ($90\\%$ of surface $g$). Astronauts feel weightless because the ISS and everything inside are in continuous orbital free-fall towards Earth at $\\sim 7.66\\text{ km/s}$, meaning no normal contact force ($\\,N = 0\\,$) acts upon them.',
      suggestedQuestions: [
        'How does orbital velocity $v \\approx 7.66\\text{ km/s}$ relate to Earth\'s gravitational acceleration $g$?',
        'What is the difference between gravitational force ($F_g = mg$) and normal contact force ($N$)?',
        'How does Einstein\'s equivalence principle relate an orbiting spacecraft to an elevator in free-fall?',
        'Why does the station remain in orbit rather than falling directly down into the atmosphere?'
      ]
    },
    {
      topic: 'Physics',
      subtopic: 'Electromagnetism and optics (Maxwell equations, polarization, thin-film interference, Snell refraction, dispersion)',
      angle: 'Focus on a real-world technological or natural phenomenon explained by fundamental laws.',
      angleFit: 'Explains atmospheric color transitions via the $\\sigma \\propto \\lambda^{-4}$ Rayleigh scattering relationship for particles smaller than light wavelengths.',
      questionText: 'Why is the daytime clear sky blue while sunsets appear orange and red?',
      options: [
        'Because ozone molecules absorb red light and emit blue photons',
        'Because Rayleigh scattering by air molecules is inversely proportional to the fourth power of wavelength ($\\sigma \\propto \\lambda^{-4}$)',
        'Because water vapor prisms in the atmosphere reflect the blue oceans',
        'Because sunlight loses energy through Doppler shift as it passes through the atmosphere'
      ],
      correctIndex: 1,
      explanation: 'Rayleigh scattering occurs when particles are much smaller than the light\'s wavelength. The scattering intensity scales with $\\frac{1}{\\lambda^4}$. Blue light ($\\lambda \\approx 400\\text{ nm}$) scatters $\\sim 10\\times$ more intensely than red light ($\\lambda \\approx 700\\text{ nm}$). At sunset, sunlight passes through a much thicker atmosphere path, scattering away blue light and leaving unscattered red/orange rays.',
      suggestedQuestions: [
        'How does the $\\sigma \\propto \\lambda^{-4}$ relation make $400\\text{ nm}$ blue light scatter $\\sim 10\\times$ more than $700\\text{ nm}$ red light?',
        'Why does Mie scattering from larger water droplets produce white clouds instead of blue?',
        'How does atmospheric optical path length at sunset relate to the red/orange color spectrum?',
        'Why don\'t human eyes perceive the sky as violet even though violet has an even shorter wavelength?'
      ]
    },
    {
      topic: 'Physics',
      subtopic: 'Special and general relativity (time dilation, gravitational lensing, equivalence principle, metric curvature)',
      angle: 'Focus on a pivotal historical discovery or thought experiment.',
      angleFit: 'Demonstrates Einstein\'s light clock thought experiment where the universal invariance of $c$ geometrically necessitates time dilation $t\' = \\gamma t$.',
      questionText: 'Why does an observer see a moving clock tick slower than an identical clock at rest (special relativistic time dilation)?',
      options: [
        'Because mechanical friction in the moving clock increases with velocity',
        'Because the speed of light $c$ is invariant in all inertial frames, forcing light in a moving frame to trace a longer diagonal path ($t\' = \\gamma t$)',
        'Because the Doppler shift shifts the clock\'s electromagnetic frequency to lower energy',
        'Because atmospheric resistance creates a gravitational time warp around moving objects'
      ],
      correctIndex: 1,
      explanation: 'Einstein\'s second postulate states that $c$ is constant for all inertial observers. In a light clock moving at speed $v$, the light pulse must travel along a hypotenuse $c \\Delta t = \\sqrt{(v \\Delta t)^2 + (c \\Delta t_0)^2}$. Solving for $\\Delta t$ yields the Lorentz time dilation $\\Delta t = \\frac{\\Delta t_0}{\\sqrt{1 - v^2/c^2}} = \\gamma \\Delta t_0$.',
      suggestedQuestions: [
        'How does the constancy of the speed of light $c$ in all frames necessitate the Lorentz factor $\\gamma$?',
        'What is the relationship between proper time $\\Delta t_0$ and dilated time $\\Delta t = \\gamma \\Delta t_0$?',
        'How does relativistic time dilation relate to length contraction along the axis of motion?',
        'Why does the light-clock thought experiment require a diagonal path in the moving observer\'s frame?'
      ]
    },
  ],
  Chemistry: [
    {
      topic: 'Chemistry',
      subtopic: 'Intermolecular forces (hydrogen bonding, dipole-dipole, London dispersion forces, vapor pressure)',
      angle: 'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
      angleFit: 'Connects the open hexagonal crystal lattice of tetrahedral hydrogen bonding at the molecular scale to the macroscopic anomaly of solid ice floating on liquid water.',
      questionText: 'Why does ice float on liquid water, unlike most other substances whose solids sink?',
      options: [
        'Because ice traps atmospheric gases inside its crystal bubbles',
        'Because stable hydrogen bonding forms an open hexagonal lattice with lower density than liquid water',
        'Because water molecules lose mass as they freeze into ice',
        'Because surface tension pushes ice upwards against gravity'
      ],
      correctIndex: 1,
      explanation: 'Liquid water molecules form transient hydrogen bonds. As temperature drops below $4^\\circ\\text{C}$ and freezes at $0^\\circ\\text{C}$, the hydrogen bonds lock into an open, rigid hexagonal crystal cage. This tetrahedral geometry forces molecules farther apart than in the disorganized liquid state, making solid ice $\\sim 9\\%$ less dense than liquid $\\text{H}_2\\text{O}$.',
      suggestedQuestions: [
        'How does tetrahedral hydrogen bonding geometry create an open hexagonal crystal lattice?',
        'Why does liquid water reach its maximum density at $4^\\circ\\text{C}$ rather than at $0^\\circ\\text{C}$?',
        'How does the density difference ($\\sim 9\\%$) between ice and liquid water protect aquatic ecosystems?',
        'What happens to the hydrogen bond network when thermal energy disrupts the crystal lattice during melting?'
      ]
    },
    {
      topic: 'Chemistry',
      subtopic: 'Solutions and colligative properties (osmotic pressure, boiling point elevation, freezing point depression)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Derives boiling point elevation from Raoult\'s law and chemical potential entropy shifts when non-volatile solute particles reduce vapor pressure.',
      questionText: 'Why does adding table salt ($\\text{NaCl}$) to water raise its boiling point (boiling point elevation)?',
      options: [
        'Because sodium ions absorb heat and prevent water from evaporating',
        'Because non-volatile solute particles lower the solvent\'s vapor pressure, requiring a higher temperature for vapor pressure to reach atmospheric pressure',
        'Because $\\text{NaCl}$ reacts with water to produce a dense covalent compound with high boiling point',
        'Because ionic bonds between $\\text{Na}^+$ and $\\text{Cl}^-$ release extra heat into the solution'
      ],
      correctIndex: 1,
      explanation: 'Boiling point elevation ($\\Delta T_b = i K_b m$) is a colligative property. Dissolved non-volatile solute ions decrease the chemical potential and entropy of the solvent, lowering equilibrium vapor pressure (Raoult\'s Law). To overcome atmospheric pressure ($P_{\\text{vap}} = P_{\\text{atm}}$), the temperature must be raised higher.',
      suggestedQuestions: [
        'How does Raoult\'s Law relate solute concentration to solvent vapor pressure lowering?',
        'Why does the van \'t Hoff factor $i = 2$ for $\\text{NaCl}$ double its colligative effect compared to glucose?',
        'How does boiling point elevation $\\Delta T_b = i K_b m$ depend on molality $m$ rather than molarity?',
        'How does the decrease in solvent chemical potential shift the liquid-gas phase equilibrium?'
      ]
    },
    {
      topic: 'Chemistry',
      subtopic: 'Atomic structure and periodic trends (electronegativity, ionization energy, electron affinity, shielding effect)',
      angle: 'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
      angleFit: 'Explains chemical inertness through quantum closed valence subshells ($s^2 p^6$) maximizing ionization energy and thermodynamic stability.',
      questionText: 'Why are noble gases (such as Helium, Neon, and Argon) chemically unreactive under standard conditions?',
      options: [
        'Because their atomic nuclei have no positive protons to attract electrons',
        'Because their outermost valence electron shells are completely filled with stable electron octets ($s^2 p^6$)',
        'Because their electronegativity is infinite, rejecting all covalent sharing',
        'Because they exist solely as plasma at room temperature'
      ],
      correctIndex: 1,
      explanation: 'Noble gases possess completely filled valence subshells ($1s^2$ for $\\text{He}$, $ns^2 np^6$ for others). This closed-shell electronic configuration imparts maximum quantum mechanical stability, extremely high ionization energy, and virtually zero electron affinity, rendering chemical bond formation thermodynamically unfavorable.',
      suggestedQuestions: [
        'How does the closed valence subshell configuration ($s^2 p^6$) maximize ionization energy?',
        'Why is the electron affinity of noble gases effectively zero or slightly endothermic?',
        'How does effective nuclear charge ($Z_{\\text{eff}}$) relate to the chemical stability of Neon and Argon?',
        'Under what extreme conditions can heavier noble gases like Xenon form compounds (e.g., $\\text{XeF}_4$)?'
      ]
    },
    {
      topic: 'Chemistry',
      subtopic: 'Thermodynamics and spontaneity (Gibbs free energy $\\Delta G = \\Delta H - T\\Delta S$, endothermic vs exothermic)',
      angle: 'Focus on a surprising or counter-intuitive mechanism that challenges everyday assumptions.',
      angleFit: 'Challenges the intuition that reactions must release heat to occur, highlighting how high temperatures amplify positive entropy $-T\\Delta S$ to make $\\Delta G < 0$.',
      questionText: 'Why can an endothermic chemical reaction ($\\Delta H > 0$) occur spontaneously at elevated temperatures?',
      options: [
        'Because enthalpy becomes negative when temperature exceeds $100^\\circ\\text{C}$',
        'Because the entropic term $-T\\Delta S$ becomes sufficiently negative to make the overall Gibbs free energy $\\Delta G = \\Delta H - T\\Delta S < 0$',
        'Because catalysts reverse the sign of $\\Delta H$ at high thermal energy',
        'Because the activation energy drops to zero at high temperatures'
      ],
      correctIndex: 1,
      explanation: 'Thermodynamic spontaneity is governed by Gibbs free energy: $\\Delta G = \\Delta H - T \\Delta S$. If a reaction increases system entropy ($\\Delta S > 0$), increasing temperature $T$ scales the negative term $-T \\Delta S$. Above the threshold temperature $T > \\frac{\\Delta H}{\\Delta S}$, $\\Delta G$ becomes negative, making the process spontaneous.',
      suggestedQuestions: [
        'How does temperature $T$ amplify the entropic term $-T\\Delta S$ in the Gibbs equation $\\Delta G = \\Delta H - T\\Delta S$?',
        'What is the threshold temperature $T = \\frac{\\Delta H}{\\Delta S}$ required for an endothermic reaction to become spontaneous?',
        'How does the sign of $\\Delta S$ dictate whether heating or cooling promotes reaction spontaneity?',
        'Why can a reaction with positive enthalpy $\\Delta H > 0$ absorb heat from the surroundings while proceeding spontaneously?'
      ]
    },
    {
      topic: 'Chemistry',
      subtopic: 'Intermolecular forces (hydrogen bonding, dipole-dipole, London dispersion forces, vapor pressure)',
      angle: 'Focus on a real-world technological or natural phenomenon explained by fundamental laws.',
      angleFit: 'Illustrates how amphiphilic surfactants assemble into spherical micelles with hydrophobic cores and hydrophilic exteriors to solubilize grease.',
      questionText: 'Why does soap effectively dissolve and wash away non-polar oil and grease with water?',
      options: [
        'Because soap is an acid that chemically decomposes lipids into carbon dioxide',
        'Because soap molecules are amphiphilic, forming spherical micelles with hydrophobic tails trapping grease and hydrophilic heads facing water',
        'Because soap creates an electrical current in water that repels oil droplets',
        'Because soap lowers the boiling point of grease so it evaporates'
      ],
      correctIndex: 1,
      explanation: 'Soap molecules have an amphiphilic structure: a long non-polar hydrocarbon tail (hydrophobic/lipophilic) and an ionic carboxylate head (hydrophilic). In water, they self-assemble into spherical micelles where hydrophobic tails sequester the non-polar grease in the core, while polar heads face outwards, enabling water to rinse away the emulsion.',
      suggestedQuestions: [
        'How do hydrophobic interactions drive the non-polar hydrocarbon tails to aggregate inward into micelles?',
        'Why do ionic carboxylate heads interact favorably with polar water molecules via ion-dipole forces?',
        'How does the critical micelle concentration (CMC) determine when surfactant cleaning becomes effective?',
        'What happens to the grease-micelle emulsion during mechanical agitation and water rinsing?'
      ]
    },
  ],
  Calculus: [
    {
      topic: 'Calculus',
      subtopic: 'Derivatives and instantaneous rate of change (product rule, chain rule, implicit differentiation, related rates)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Traces the foundational limit definition of the derivative to show why base $e$ is uniquely characterized by $\\lim_{h \\to 0} \\frac{e^h - 1}{h} = 1$.',
      questionText: 'Why is the derivative of the exponential function $\\frac{d}{dx}e^x = e^x$ equal to itself?',
      options: [
        'Because Euler\'s number $e$ is defined such that $\\lim_{h \\to 0} \\frac{e^h - 1}{h} = 1$',
        'Because the tangent slope is always perpendicular to the normal line',
        'Because $e$ is an imaginary number rotation in the complex plane',
        'Because integration and differentiation cancel out unconditionally'
      ],
      correctIndex: 0,
      explanation: 'Using the definition of the derivative: $\\frac{d}{dx}a^x = \\lim_{h \\to 0} \\frac{a^{x+h}-a^x}{h} = a^x \\lim_{h \\to 0} \\frac{a^h-1}{h}$. The base $e \\approx 2.71828$ is specifically the unique constant where $\\lim_{h \\to 0} \\frac{e^h - 1}{h} = 1$, making its instantaneous rate of change exactly proportional to its current value with a factor of 1.',
      suggestedQuestions: [
        'Why is Euler\'s number $e$ uniquely defined by the limit condition $\\lim_{h \\to 0} \\frac{e^h - 1}{h} = 1$?',
        'How does the chain rule apply when differentiating composite exponential functions like $\\frac{d}{dx}e^{g(x)}$?',
        'What is the connection between the exponential function and the differential equation $\\frac{dy}{dx} = y$?',
        'How does the Taylor series expansion $e^x = \\sum_{n=0}^\\infty \\frac{x^n}{n!}$ prove that $\\frac{d}{dx}e^x = e^x$?'
      ]
    },
    {
      topic: 'Calculus',
      subtopic: 'Sequences and series (Taylor and Maclaurin expansions, radius of convergence, ratio test, alternating series)',
      angle: 'Focus on a surprising or counter-intuitive mechanism that challenges everyday assumptions.',
      angleFit: 'Demonstrates the counter-intuitive divergence of a series whose individual terms shrink to zero by comparing it to the unbounded logarithm integral $\\int_1^\\infty \\frac{1}{x} dx$.',
      questionText: 'Why does the harmonic series $\\sum_{n=1}^\\infty \\frac{1}{n} = 1 + \\frac{1}{2} + \\frac{1}{3} + \\dots$ diverge even though $\\lim_{n\\to\\infty} \\frac{1}{n} = 0$?',
      options: [
        'Because the terms oscillate between positive and negative values',
        'Because the terms decay too slowly, and its integral comparison $\\int_1^\\infty \\frac{1}{x} dx = \\lim_{M\\to\\infty} \\ln(M)$ grows unboundedly to infinity',
        'Because the ratio test yields a limit of $\\infty$',
        'Because $\\frac{1}{n}$ is undefined for odd integers'
      ],
      correctIndex: 1,
      explanation: 'While $\\lim_{n \\to \\infty} a_n = 0$ is a necessary condition for convergence, it is not sufficient. By the Integral Test, $\\sum_{n=1}^\\infty \\frac{1}{n} \\ge \\int_1^\\infty \\frac{1}{x} dx = [\\ln x]_1^\\infty = \\infty$. Alternatively, Cauchy grouped terms: $(1/3 + 1/4 > 1/2)$, $(1/5 + \\dots + 1/8 > 1/2)$, summing infinitely many halves.',
      suggestedQuestions: [
        'How does the Integral Test compare the partial sums $\\sum \\frac{1}{n}$ to $\\int_1^\\infty \\frac{1}{x} dx = \\ln(\\infty)$?',
        'Why is $\\lim_{n \\to \\infty} a_n = 0$ a necessary condition but not a sufficient condition for series convergence?',
        'How did Cauchy\'s grouping of terms into powers of two ($(1/3 + 1/4 > 1/2)$) rigorously prove divergence?',
        'How does the $p$-series test delineate the sharp convergence boundary at $p=1$ between $\\sum 1/n$ and $\\sum 1/n^2$?'
      ]
    },
    {
      topic: 'Calculus',
      subtopic: 'Limits and continuity (epsilon-delta rigor, L\'Hôpital\'s rule, indeterminate forms, squeeze theorem)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Applies Cauchy\'s Mean Value Theorem to prove why the ratio of indeterminate limits equals the ratio of tangent slopes in locally linear approximations.',
      questionText: 'Why does L\'Hôpital\'s Rule allow evaluating $\\frac{0}{0}$ indeterminate forms by taking the ratio of derivatives $\\lim_{x\\to c} \\frac{f\'(x)}{g\'(x)}$?',
      options: [
        'Because derivatives convert division into subtraction',
        'Because differentiable functions are locally linear near $c$, so the ratio of functions approaches the ratio of their tangent line slopes via Cauchy\'s Mean Value Theorem',
        'Because higher-order derivatives eliminate all horizontal asymptotes',
        'Because limits commute with differentiation for any arbitrary relation'
      ],
      correctIndex: 1,
      explanation: 'When $f(c) = g(c) = 0$, Cauchy\'s Mean Value Theorem proves $\\frac{f(x) - f(c)}{g(x) - g(c)} = \\frac{f\'(\\xi)}{g\'(\\xi)}$ for some $\\xi$ between $x$ and $c$. As $x \\to c$, $\\xi \\to c$. Geometrically, near $x=c$ both curves are approximated by linear tangents $f(x) \\approx f\'(c)(x-c)$ and $g(x) \\approx g\'(c)(x-c)$, whose ratio is $\\frac{f\'(c)}{g\'(c)}$.',
      suggestedQuestions: [
        'How does Cauchy\'s Mean Value Theorem $\\frac{f(x)-f(c)}{g(x)-g(c)} = \\frac{f\'(\\xi)}{g\'(\\xi)}$ prove L\'Hôpital\'s Rule?',
        'Why does local linear approximation $f(x) \\approx f\'(c)(x-c)$ justify taking the ratio of derivatives?',
        'Why does L\'Hôpital\'s Rule fail if the limit is not an indeterminate form ($\\frac{0}{0}$ or $\\frac{\\infty}{\\infty}$)?',
        'How can indeterminate products like $0 \\cdot \\infty$ or differences $\\infty - \\infty$ be algebraically transformed to apply the rule?'
      ]
    },
    {
      topic: 'Calculus',
      subtopic: 'Multivariable calculus (partial derivatives, gradient vectors, directional derivatives, Lagrange multipliers)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Uses gradient orthogonality to level sets to demonstrate why constrained extrema require parallel normal vectors $\\nabla f = \\lambda \\nabla g$.',
      questionText: 'Why does setting the gradient $\\nabla f = \\lambda \\nabla g$ find extrema subject to constraint $g(x,y) = k$ in Lagrange multipliers?',
      options: [
        'Because the constraint line must always be parallel to the x-axis',
        'Because at a constrained optimum, the level curve of $f$ is tangent to the constraint curve $g=k$, meaning their normal vectors must be collinear',
        'Because the cross product of two orthogonal vectors is always zero',
        'Because $\\lambda$ represents the arc length of the contour boundary'
      ],
      correctIndex: 1,
      explanation: 'If the level curve of $f(x,y)$ crossed through the constraint curve $g(x,y) = k$, one could move along $g=k$ to increase or decrease $f$. Extrema occur only where moving along $g=k$ produces zero directional derivative in $f$—i.e., where the curves are tangent. Since gradient vectors $\\nabla f$ and $\\nabla g$ are perpendicular to their level sets, they must be parallel: $\\nabla f = \\lambda \\nabla g$.',
      suggestedQuestions: [
        'Why are gradient vectors $\\nabla f$ and $\\nabla g$ perpendicular to their respective level curves?',
        'How does the tangency condition of level curves require normal vectors to be collinear ($\\nabla f = \\lambda \\nabla g$)?',
        'What is the economic/physical interpretation of the Lagrange multiplier $\\lambda = \\frac{\\partial f^*}{\\partial k}$ as shadow price?',
        'What happens if the constraint gradient $\\nabla g = \\mathbf{0}$ at a candidate critical point?'
      ]
    },
    {
      topic: 'Calculus',
      subtopic: 'Optimization and curve sketching (inflection points, concavity, second derivative test, critical points)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Explains how a positive second derivative guarantees an increasing slope through zero, establishing the geometric intuition of local minima.',
      questionText: 'Why does the second derivative test determine that $f\'\'(c) > 0$ at a critical point ($f\'(c) = 0$) corresponds to a local minimum?',
      options: [
        'Because $f\'\'(c) > 0$ means the function value is positive at $c$',
        'Because the slope $f\'(x)$ is strictly increasing through zero, transitioning from negative before $c$ to positive after $c$',
        'Because the inflection point rotates clockwise in the upper half plane',
        'Because the area under the curve is convex'
      ],
      correctIndex: 1,
      explanation: 'The second derivative $f\'\'(x)$ represents the rate of change of the slope $f\'(x)$. If $f\'\'(c) > 0$, the first derivative $f\'(x)$ is increasing. At a critical point where $f\'(c) = 0$, $f\'(x)$ changes from negative (decreasing function) before $c$ to positive (increasing function) after $c$, creating a local minimum ("concave up").',
      suggestedQuestions: [
        'How does $f\'\'(c) > 0$ imply that the first derivative $f\'(x)$ is strictly increasing through zero?',
        'Why does a transition of slope from negative to positive create a local minimum geometrically?',
        'What information does the second derivative test provide if $f\'\'(c) = 0$, and what test is used instead?',
        'How does concavity relate to inflection points where $f\'\'(x)$ changes sign?'
      ]
    },
  ],
  Algebra: [
    {
      topic: 'Algebra',
      subtopic: 'Quadratic equations and conic sections (discriminant geometric meaning, parabolas, ellipses, hyperbolas)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Derives the discriminant $\\Delta = b^2 - 4ac$ from completing the square to show how the radical term governs real vs complex root outcomes.',
      questionText: 'Why does the quadratic formula have a discriminant $\\Delta = b^2 - 4ac$ that determines the number of real roots?',
      options: [
        'Because $\\Delta$ is inside the square root $\\sqrt{b^2 - 4ac}$; square roots of negative numbers have no real solutions',
        'Because $b^2 - 4ac$ represents the focal length of a hyperbola',
        'Because matrices require non-zero determinants for row reduction',
        'Because polynomials of degree 2 must always cross the y-axis twice'
      ],
      correctIndex: 0,
      explanation: 'From completing the square on $ax^2 + bx + c = 0$, we arrive at $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$. The term under the radical $\\Delta = b^2 - 4ac$ dictates the reality of roots: if $\\Delta > 0$, $\\sqrt{\\Delta}$ yields two distinct real values; if $\\Delta = 0$, exactly one real root $x = -b/(2a)$; if $\\Delta < 0$, $\\sqrt{\\Delta}$ is imaginary, yielding two complex conjugate roots.',
      suggestedQuestions: [
        'How does completing the square on $ax^2 + bx + c = 0$ isolate the radical term $\\sqrt{b^2 - 4ac}$?',
        'Why does $\\Delta < 0$ produce a conjugate pair of complex roots with no real x-intercepts?',
        'What is the geometric meaning of the vertex coordinate $x = -\\frac{b}{2a}$ when $\\Delta = 0$?',
        'How does the discriminant relate to the factoring of quadratic polynomials over the real numbers?'
      ]
    },
    {
      topic: 'Algebra',
      subtopic: 'Abstract algebra concepts (groups, fields, permutations, symmetry groups, isomorphisms)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Proves $(-a)(-b) = ab$ rigorously using ring axioms and the distributive law $a(b + (-b)) = 0$ to preserve arithmetic consistency.',
      questionText: 'Why does multiplying two negative numbers yield a positive number ($(-a) \\cdot (-b) = ab$)?',
      options: [
        'Because negative numbers cancel each other out due to parity laws',
        'Because the distributive property $a(b + (-b)) = 0$ and ring axioms require it for arithmetic consistency',
        'Because geometric areas in the Cartesian plane can never be negative',
        'Because division is defined as inverse modular multiplication'
      ],
      correctIndex: 1,
      explanation: 'By the distributive property of rings: $(-a)(b + (-b)) = (-a)(0) = 0$. Expanding: $(-a)(b) + (-a)(-b) = 0$. Since $(-a)(b) = -(ab)$, adding $ab$ to both sides yields: $-(ab) + (-a)(-b) + ab = 0 + ab \\implies (-a)(-b) = ab$. This is essential for preserving the distributive law.',
      suggestedQuestions: [
        'How does the distributive law $a(b + (-b)) = 0$ necessitate $(-a)(-b) = ab$ for algebraic consistency?',
        'What ring axioms would be violated if $(-1) \\cdot (-1)$ were defined to equal $-1$?',
        'How does rotation by $180^\\circ$ on the complex plane geometrically represent multiplication by $-1$?',
        'How does the additive inverse property $x + (-x) = 0$ interact with scalar multiplication?'
      ]
    },
    {
      topic: 'Algebra',
      subtopic: 'Exponential and logarithmic properties (logarithmic change of base, Euler\'s identity $e^{i\\pi}+1=0$, compound growth)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Explains zero-exponentiation via algebraic quotient consistency $\\frac{x^n}{x^n} = x^{n-n} = x^0 = 1$.',
      questionText: 'Why is any non-zero number raised to the zero power equal to $1$ ($x^0 = 1$ for $x \\neq 0$)?',
      options: [
        'Because zero has no prime factors',
        'Because the quotient rule for exponents $x^a / x^b = x^{a-b}$ implies $x^n / x^n = x^{n-n} = x^0 = 1$',
        'Because exponentiation is defined as matrix trace operation',
        'Because logarithms of zero are defined to be one'
      ],
      correctIndex: 1,
      explanation: 'To maintain consistency of exponent arithmetic rules like $\\frac{x^a}{x^b} = x^{a-b}$, setting $a = b = n$ gives $\\frac{x^n}{x^n} = x^{n-n} = x^0$. Since any non-zero quantity divided by itself is $1$, $x^0$ must equal $1$.',
      suggestedQuestions: [
        'How does the quotient rule $\\frac{x^a}{x^b} = x^{a-b}$ dictate that $\\frac{x^n}{x^n} = x^0 = 1$?',
        'Why is $0^0$ considered an indeterminate form in calculus while $x^0 = 1$ for all $x \\neq 0$?',
        'How does the empty product convention in algebra relate to $x^0 = 1$ and $0! = 1$?',
        'What pattern in successive division by $x$ illustrates negative and zero exponents on a number line?'
      ]
    },
    {
      topic: 'Algebra',
      subtopic: 'Linear algebra and matrices (matrix determinants, invertibility, eigenvalues and eigenvectors, systems of equations)',
      angle: 'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
      angleFit: 'Interprets the determinant as a geometric space transformation volume factor where zero determinant collapses dimensions and destroys invertibility.',
      questionText: 'Why does a square matrix $A$ have a unique inverse $A^{-1}$ if and only if its determinant $\\det(A) \\neq 0$?',
      options: [
        'Because matrix addition is non-commutative',
        'Because $\\det(A)$ represents the geometric volume scaling factor; $\\det(A) = 0$ collapses space into lower dimensions, losing invertible information',
        'Because eigenvalue traces must sum to an odd integer',
        'Because inverse matrices require orthogonal basis projections'
      ],
      correctIndex: 1,
      explanation: 'The determinant $\\det(A)$ represents the signed volume transformation factor of the linear mapping $T(\\mathbf{v}) = A\\mathbf{v}$. If $\\det(A) = 0$, the transformation collapses full $n$-dimensional space into a lower-dimensional subspace (kernel dimension $> 0$), mapping multiple distinct vectors to the same output, making a unique inverse mapping impossible.',
      suggestedQuestions: [
        'How does the determinant $\\det(A)$ measure the signed volume scaling factor of a linear transformation?',
        'Why does $\\det(A) = 0$ indicate that the kernel (null space) of the matrix has dimension $> 0$?',
        'How does matrix invertibility relate to the linear independence of column vectors in $A$?',
        'What is the relationship between the eigenvalues $\\lambda_i$ and the determinant $\\det(A) = \\prod \\lambda_i$?'
      ]
    },
    {
      topic: 'Algebra',
      subtopic: 'Complex numbers (polar/Euler form, De Moivre\'s theorem, complex roots of unity)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Applies complex conjugation across real-coefficient polynomial equations to show that $\\overline{P(z)} = P(\\overline{z}) = 0$.',
      questionText: 'Why do non-real complex roots of polynomials with real coefficients always occur in conjugate pairs ($a \\pm bi$)?',
      options: [
        'Because complex numbers only exist in pairs of orthogonal vectors',
        'Because applying complex conjugation to $P(z) = 0$ leaves all real coefficients invariant, ensuring $P(\\overline{z}) = \\overline{P(z)} = 0$',
        'Because De Moivre\'s theorem only works for symmetric angles',
        'Because quadratic reciprocity dictates conjugate symmetry'
      ],
      correctIndex: 1,
      explanation: 'For a polynomial $P(z) = \\sum a_k z^k$ with real coefficients $a_k \\in \\mathbb{R}$, taking the complex conjugate yields $\\overline{P(z)} = \\sum \\overline{a_k} (\\overline{z})^k = \\sum a_k (\\overline{z})^k = P(\\overline{z})$. If $z_0$ is a root ($P(z_0) = 0$), then $P(\\overline{z_0}) = \\overline{0} = 0$, meaning $\\overline{z_0}$ is necessarily a root as well.',
      suggestedQuestions: [
        'How does complex conjugation $\\overline{P(z)} = P(\\overline{z})$ hold because all polynomial coefficients are real?',
        'Why can an odd-degree polynomial with real coefficients never have only non-real complex roots?',
        'How does factoring $(z - (a+bi))(z - (a-bi))$ produce an irreducible real quadratic factor $z^2 - 2az + (a^2+b^2)$?',
        'What happens if polynomial coefficients are complex numbers instead of real numbers?'
      ]
    },
  ],
  History: [
    {
      topic: 'History',
      subtopic: 'Cultural and architectural movements (Renaissance humanism, Islamic Golden Age scholarship, Protestant Reformation)',
      angle: 'Focus on resolving a classic paradox or widespread conceptual misconception in the field.',
      angleFit: 'Replaces the single-catastrophe myth with historical evidence of gradual institutional erosion across centuries of political purges and budget cuts.',
      questionText: 'Why did the Library of Alexandria gradually decline rather than being destroyed in a single catastrophic fire?',
      options: [
        'Because Roman legions systematically transported all papyrus scrolls to Rome in 48 BCE',
        'Because centuries of budget cuts, imperial purges, changing rulers, and multiple smaller fires eroded its scholarly support',
        'Because the Nile flooded and washed away the entire royal quarter in 365 CE',
        'Because scholars voluntarily disbanded and moved to the House of Wisdom in Baghdad'
      ],
      correctIndex: 1,
      explanation: 'Contrary to the popular myth of a single apocalypse, historians trace the library\'s decline across centuries: partial fires during Julius Caesar\'s civil war (48 BCE), expulsion of intellectuals under Ptolemy VIII, imperial budget cuts under Roman rule, Aurelian\'s siege (270s CE), and decree of Theodosius I (391 CE).',
      suggestedQuestions: [
        'How did Roman imperial budget cuts and civic instability erode Alexandrian scholarly institutions over centuries?',
        'What role did political purges (such as Ptolemy VIII expelling intellectuals) play in dispersing scholars?',
        'How does historical evidence contrast the single catastrophic fire myth with multi-century administrative decay?',
        'How did shifting intellectual centers (like Antioch, Rome, and later Baghdad) absorb Alexandria\'s scholarly tradition?'
      ]
    },
    {
      topic: 'History',
      subtopic: 'Economic and trade revolutions (Silk Road, Columbian Exchange, mercantilism to capitalism, Bretton Woods)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Applies economic history models demonstrating Britain\'s unique price structure of high wages paired with cheap, accessible surface coal.',
      questionText: 'Why did the Industrial Revolution originate in 18th-century Great Britain rather than other wealthy contemporary empires like China or France?',
      options: [
        'Because Britain had an absolute monarchy that mandated factory production',
        'Because Britain uniquely combined high wages (incentivizing labor-saving machinery), cheap surface coal near waterways, and secure property rights',
        'Because Britain had completely exhausted all its agricultural farmland',
        'Because the steam engine was kept a state military secret for 200 years'
      ],
      correctIndex: 1,
      explanation: 'Economic historians (notably Robert Allen) highlight Britain\'s unique economic structure: very high real wages compared to capital and energy costs. This made investing in fuel-intensive, labor-saving steam machinery economically profitable only in Britain, where vast, accessible surface coal deposits lay close to water transport networks.',
      suggestedQuestions: [
        'How did Robert Allen\'s high-wage, cheap-coal price model incentivize capital machinery in Britain?',
        'Why was investing in fuel-inefficient early Newcomen steam engines economically unviable in France or China?',
        'How did Britain\'s accessible surface coal deposits near navigable waterways lower transport costs?',
        'What institutional factors (property rights, patent systems, commercial laws) reinforced technological adoption?'
      ]
    },
    {
      topic: 'History',
      subtopic: 'Ancient civilizations and governance (Code of Hammurabi, Athenian democracy, Roman Republic to Empire)',
      angle: 'Focus on resolving a classic paradox or widespread conceptual misconception in the field.',
      angleFit: 'Analyzes complex systems failure across interconnected palace economies where climate stress and supply disruptions cascaded into systemic collapse.',
      questionText: 'Why did the Late Bronze Age collapse (~1200 BCE) abruptly topple multiple major Eastern Mediterranean civilizations simultaneously?',
      options: [
        'Because a massive asteroid struck the Aegean Sea',
        'Because hyper-specialized, highly interdependent palace economies suffered systemic collapse from simultaneous droughts, trade breakdown, and Sea Peoples raids',
        'Because iron weapons instantly made all bronze armies obsolete in a single year',
        'Because the Black Death wiped out 80% of the Mediterranean population'
      ],
      correctIndex: 1,
      explanation: 'The Late Bronze Age world (Mycenaeans, Hittites, New Kingdom Egypt, Ugarit) was a tightly interconnected trade and diplomatic ecosystem dependent on long-distance tin and copper supply chains. A combination of climate change (prolonged drought), earthquake storms, internal rebellions, and Sea Peoples migration triggered a domino effect: the collapse of one palace economy brought down trade for all others.',
      suggestedQuestions: [
        'How did hyper-specialized palace economies create brittle supply chain dependencies for tin and copper?',
        'What evidence links prolonged multi-decadal mega-droughts to simultaneous agricultural failures across the Aegean?',
        'How did the Sea Peoples raids act as a catalyst on already destabilized trade and political networks?',
        'Why did the collapse of one trade hub (like Ugarit or Mycenae) trigger cascading failures throughout the Mediterranean?'
      ]
    },
    {
      topic: 'History',
      subtopic: 'Ancient civilizations and governance (Code of Hammurabi, Athenian democracy, Roman Republic to Empire)',
      angle: 'Focus on a pivotal historical discovery or thought experiment.',
      angleFit: 'Traces the Marian military reforms and senatorial land consolidation that transformed citizen militias into warlord-loyal professional legions.',
      questionText: 'Why did the Roman Republic transition into the autocratic Roman Empire under Augustus?',
      options: [
        'Because the Roman Senate unanimously voted to abolish democracy after the Punic Wars',
        'Because rapid territorial expansion enriched senatorial oligarchs, impoverished plebeian farmers, and created professional legions loyal to warlord generals',
        'Because Carthage conquered Rome and installed an emperor',
        'Because Roman law prohibited consul elections during wartime'
      ],
      correctIndex: 1,
      explanation: 'Imperial conquests flooded Rome with wealth and enslaved laborers, undermining peasant farmers who formed the citizen militia. The Marian reforms created landless professional soldiers dependent on generals (like Marius, Sulla, Pompey, Caesar) for retirement land. The Republic was torn apart by civil wars between warlord factions until Octavian consolidated sole power.',
      suggestedQuestions: [
        'How did the Marian military reforms tie soldiers\' economic retirement to generals rather than the Senate?',
        'How did vast conquests flood Rome with enslaved labor and latifundia, bankrupting plebeian citizen-farmers?',
        'Why did the political gridlock and violence between Optimates and Populares undermine republican norms?',
        'How did Octavian (Augustus) disguise autocratic imperial power under traditional republican magistracies (the Principate)?'
      ]
    },
    {
      topic: 'History',
      subtopic: 'Economic and trade revolutions (Silk Road, Columbian Exchange, mercantilism to capitalism, Bretton Woods)',
      angle: 'Focus on resolving a classic paradox or widespread conceptual misconception in the field.',
      angleFit: 'Explains the Triffin Dilemma where supplying global dollar liquidity inevitably depleted US gold reserve ratios, culminating in the 1971 Nixon shock.',
      questionText: 'Why did the post-WWII Bretton Woods monetary system of fixed exchange rates collapse in 1971?',
      options: [
        'Because gold mining was banned globally by the United Nations',
        'Because the Triffin Dilemma caused US foreign dollar liabilities to vastly exceed US gold reserves, forcing the Nixon shock',
        'Because the European Union created the Euro and demanded gold repatriation',
        'Because hyperinflation in Japan forced the closure of currency markets'
      ],
      correctIndex: 1,
      explanation: 'Under Bretton Woods, the USD was pegged to gold at $35/oz and other currencies pegged to the USD. Under the Triffin Dilemma, supplying global liquidity required continuous US balance-of-payments deficits. By 1971, foreign dollar holdings vastly exceeded US gold reserves at Fort Knox. When nations (like France) requested gold redemptions, President Nixon unilaterally suspended dollar-gold convertibility.',
      suggestedQuestions: [
        'How does the Triffin Dilemma explain the paradox between supplying global reserve currency and maintaining gold reserves?',
        'Why did US balance-of-payments deficits and Vietnam War spending cause foreign dollar claims to exceed Fort Knox gold?',
        'What precipitated European central banks (notably France) demanding gold redemptions at $35/oz?',
        'How did the unilateral 1971 Nixon shock transition the global economy into a fiat, floating exchange rate system?'
      ]
    },
  ],
  Biology: [
    {
      topic: 'Biology',
      subtopic: 'Cellular respiration and bioenergetics (ATP synthase chemiosmosis, proton gradient $\\Delta \\mu_{H^+}$, Krebs cycle, oxidative phosphorylation)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Examines Peter Mitchell\'s chemiosmotic hypothesis and how electrochemical proton gradients mechanical drive ATP synthesis rotation.',
      questionText: 'Why does ATP synthase synthesize ATP by utilizing a proton concentration gradient across the inner mitochondrial membrane rather than direct chemical coupling?',
      options: [
        'Because chemical bonds cannot store more than 1 calorie of thermal energy',
        'Because the electrochemical proton-motive force ($\\Delta p = \\Delta \\psi - \\frac{2.3RT}{F}\\Delta\\text{pH}$) drives mechanical rotation of the $F_0/F_1$ rotor complex (chemiosmotic theory)',
        'Because oxygen molecules directly bind to ADP inside the cytosol',
        'Because mitochondria lack enzymes required for substrate-level phosphorylation'
      ],
      correctIndex: 1,
      explanation: 'Peter Mitchell\'s chemiosmotic hypothesis demonstrated that the electron transport chain pumps protons ($H^+$) into the intermembrane space, generating a steep electrochemical potential (proton-motive force). Protons flow back down this gradient through the $F_0$ subunit of ATP synthase, driving mechanical rotary catalysis in the $F_1$ catalytic domain to phosphorylate $\\text{ADP} + \\text{P}_i \\to \\text{ATP}$.',
      suggestedQuestions: [
        'How does the proton-motive force combine both electrical membrane potential ($\\Delta\\psi$) and pH gradient ($\\Delta\\text{pH}$)?',
        'How did Peter Mitchell\'s chemiosmotic hypothesis overturn the chemical intermediate theory of oxidative phosphorylation?',
        'What is the mechanical mechanism of rotational catalysis in the $F_1$ headpiece of ATP synthase?',
        'How do uncoupling agents like 2,4-dinitrophenol (DNP) dissipate the proton gradient as heat?'
      ]
    },
    {
      topic: 'Biology',
      subtopic: 'Neurobiology and synaptic transmission (action potential voltage-gated ion channels, Nernst/Goldman potential, neurotransmitters)',
      angle: 'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
      angleFit: 'Explains how the voltage-gated sodium channel inactivation ball-and-chain mechanism enforces unidirectional propagation.',
      questionText: 'Why does an action potential travel strictly unidirectional down an axon towards the synaptic terminal without back-propagating?',
      options: [
        'Because the electrical resistance of the axon only permits forward current',
        'Because voltage-gated sodium channels enter a transient inactivated state (refractory period) immediately after opening',
        'Because myelin sheaths absorb backwards electrical impulses',
        'Because synaptic vesicles push neurotransmitters in one direction'
      ],
      correctIndex: 1,
      explanation: 'After depolarizing and opening, voltage-gated $\\text{Na}^+$ channels rapidly close their inactivation gate (ball-and-chain mechanism), entering an absolute refractory state. During this time, they cannot reopen regardless of membrane voltage, preventing backwards propagation of the depolarizing wave and enforcing unidirectional signal transmission.',
      suggestedQuestions: [
        'How does the inactivation gate (\'ball and chain\') mechanism in voltage-gated $\\text{Na}^+$ channels enforce the absolute refractory period?',
        'What is the difference between the absolute and relative refractory periods in terms of ion channel states?',
        'How does saltatory conduction across nodes of Ranvier accelerate action potential velocity in myelinated axons?',
        'How does the Goldman-Hodgkin-Katz equation describe the transition from resting potential to peak depolarization?'
      ]
    },
    {
      topic: 'Biology',
      subtopic: 'Molecular genetics and central dogma (DNA replication fidelity, CRISPR-Cas9, transcription factors, mRNA translation)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Connects the extra hydrogen bond and aromatic stacking stability of GC pairs to thermodynamic melting temperature.',
      questionText: 'Why do adenine-thymine ($\\text{A-T}$) base pairs require less thermal energy to denature (melt) than guanine-cytosine ($\\text{G-C}$) base pairs in DNA?',
      options: [
        'Because adenine is a purine while cytosine is a pyrimidine',
        'Because $\\text{A-T}$ pairs form only 2 hydrogen bonds whereas $\\text{G-C}$ pairs form 3 hydrogen bonds and stronger base stacking',
        'Because $\\text{A-T}$ pairs have covalent linkages that degrade at lower temperatures',
        'Because thymine contains an extra methyl group that repels the phosphate backbone'
      ],
      correctIndex: 1,
      explanation: 'Watson-Crick base pairing dictates that $\\text{A-T}$ pairs share 2 complementary hydrogen bonds, whereas $\\text{G-C}$ pairs form 3 hydrogen bonds. Additionally, $\\text{G-C}$ base pairs exhibit favorable $\\pi$-$\\pi$ aromatic stacking interactions with adjacent bases, raising the melting temperature ($T_m$) of GC-rich DNA duplexes.',
      suggestedQuestions: [
        'How does the third hydrogen bond in $\\text{G-C}$ base pairs significantly increase duplex stability and melting temperature ($T_m$)?',
        'What role do aromatic $\\pi$-$\\pi$ base-stacking interactions play in stabilizing the double helix relative to hydrogen bonding?',
        'How do high-temperature organisms (thermophiles) utilize elevated GC content to stabilize their genomes?',
        'How does the nearest-neighbor thermodynamic model calculate the exact melting temperature of DNA oligonucleotides?'
      ]
    },
    {
      topic: 'Biology',
      subtopic: 'Photosynthesis and plant physiology (light reactions, Calvin cycle, Rubisco oxygenase tradeoff, C4/CAM adaptations)',
      angle: 'Focus on a surprising or counter-intuitive mechanism that challenges everyday assumptions.',
      angleFit: 'Analyzes Rubisco\'s catalytic oxygenase flaw and the evolutionary adaptation of spatial/temporal $\\text{CO}_2$ concentration pumps.',
      questionText: 'Why do C4 and CAM plants utilize specialized carbon fixation pathways instead of standard C3 photosynthesis in arid climates?',
      options: [
        'Because C3 plants cannot absorb red and blue wavelengths of light',
        'Because the primary enzyme Rubisco mistakenly binds $\\text{O}_2$ instead of $\\text{CO}_2$ (photorespiration) at high temperatures, wasting metabolic energy',
        'Because C4 plants do not require water for the light-dependent reactions',
        'Because stomata must remain open 24 hours a day to prevent nitrogen poisoning'
      ],
      correctIndex: 1,
      explanation: 'Rubisco has both carboxylase and oxygenase activity. At higher temperatures or when stomata close to conserve water (lowering internal $\\text{CO}_2$), Rubisco fixes $\\text{O}_2$, initiating wasteful photorespiration. C4 plants use PEP carboxylase to concentrate $\\text{CO}_2$ in bundle-sheath cells, while CAM plants fix $\\text{CO}_2$ at night, drastically minimizing water loss and photorespiratory energy waste.',
      suggestedQuestions: [
        'Why does the oxygenase activity of Rubisco produce toxic 2-phosphoglycolate that requires costly salvage pathways?',
        'How does PEP carboxylase achieve high substrate specificity for bicarbonate without binding oxygen?',
        'How do Kranz anatomy and spatial separation of enzymes protect C4 plants from photorespiration?',
        'What temporal separation mechanism allows CAM plants to open stomata exclusively at night?'
      ]
    },
    {
      topic: 'Biology',
      subtopic: 'Immunology and pathogen defense (MHC antigen presentation, antibody somatic hypermutation, innate vs adaptive immunity)',
      angle: 'Focus on a real-world technological or natural phenomenon explained by fundamental laws.',
      angleFit: 'Demonstrates combinatorial and junctional somatic recombination generating immense receptor diversity from a compact genome.',
      questionText: 'Why can the human adaptive immune system generate billions of distinct antibody antigen-binding receptors from a limited number of genes?',
      options: [
        'Because each antibody is synthesized by reverse-transcribing foreign viral RNA',
        'Because somatic V(D)J recombination, junctional diversity, and somatic hypermutation enzymatically rearrange gene segments',
        'Because antibodies change their amino acid sequence dynamically upon touching an antigen',
        'Because every single human cell contains a trillion unique antibody genes inherited at birth'
      ],
      correctIndex: 1,
      explanation: 'Through V(D)J recombination driven by RAG1/RAG2 recombinases, developing lymphocytes randomly combine Variable (V), Diversity (D), and Joining (J) gene segments. Terminal deoxynucleotidyl transferase (TdT) adds random nucleotides at junctions, creating immense combinatorial and junctional diversity exceeding $10^{11}$ unique antibody specificities before somatic hypermutation further refines affinity.',
      suggestedQuestions: [
        'How do RAG1 and RAG2 recombinases recognize recombination signal sequences (RSS) during V(D)J recombination?',
        'What role does Terminal deoxynucleotidyl transferase (TdT) play in generating junctional diversity?',
        'How does activation-induced cytidine deaminase (AID) drive somatic hypermutation and affinity maturation in germinal centers?',
        'How does negative selection in the thymus and bone marrow eliminate autoreactive receptors to maintain self-tolerance?'
      ]
    }
  ],
  'WH40k: Horus Heresy': [
    {
      topic: 'WH40k: Horus Heresy',
      subtopic: 'The Istvaan massacres and the betrayal (Dropsite Massacre at Istvaan V, Istvaan III virus bombing, Eisenstein escape)',
      angle: 'Focus on a pivotal historical discovery or thought experiment.',
      angleFit: 'Analyzes Horus\'s strategic necessity to exterminate loyalist Space Marines within traitor legions before launching his galactic rebellion.',
      questionText: 'Why did Warmaster Horus execute the virus bombing of Istvaan III before openly marching on Terra?',
      options: [
        'To test the destructive yield of life-eater viruses against Orks',
        'To systematically purge and exterminate the loyalist elements within the four traitor legions (Sons of Horus, World Eaters, Death Guard, Emperor\'s Children)',
        'Because the planet was overrun by a Tyranid hive fleet invasion',
        'To fulfill a treaty signed with the Dark Mechanicum of Mars'
      ],
      correctIndex: 1,
      explanation: 'Before Horus could openly turn his forces against the Emperor, he had to purge his own ranks of Space Marines whose loyalty to the Imperium superseded their devotion to their Primarchs. He sent the loyalist contingents of the Sons of Horus, World Eaters, Death Guard, and Emperor\'s Children down to Istvaan III under the guise of pacification, then unleashed life-eater virus bombs and firestorms to destroy them.',
      suggestedQuestions: [
        'How did Captain Saul Tarvitz and Nathaniel Garro discover and respond to Horus\'s planned betrayal on Istvaan III?',
        'How did the frigate Eisenstein escape the Istvaan system to bring warning of the betrayal to Terra?',
        'Why did Angron deploy directly to the surface of Istvaan III against Horus\'s strategic wishes?',
        'What long-term psychological impact did surviving Istvaan III have on the shattered loyalist remnants?'
      ]
    },
    {
      topic: 'WH40k: Horus Heresy',
      subtopic: 'The Webway Project and Council of Nikaea (The Imperial Webway, Magnus\'s folly, psychic edicts, the Golden Throne burden)',
      angle: 'Focus on resolving a classic paradox or widespread conceptual misconception in the field.',
      angleFit: 'Examines the catastrophic unintended consequence of Magnus breaching Terra\'s psychic wards to deliver a warning.',
      questionText: 'Why did Magnus the Red\'s psychic warning to the Emperor unintentionally doom the Imperial Webway Project?',
      options: [
        'Because the message was intercepted and altered by the Alpha Legion',
        'Because Magnus cast an immense psychic sorcery that shattered the Emperor\'s psychic wards shielding the human Webway, flooding it with daemons',
        'Because Magnus accidentally teleported Prospero into the center of the Sol system',
        'Because the message drained the power from the astronomican permanently'
      ],
      correctIndex: 1,
      explanation: 'In an attempt to warn the Emperor of Horus\'s treachery, Magnus accepted power from Tzeentch to breach the psychic wards surrounding Terra. This catastrophic breach shattered the human Webway project the Emperor was secretly constructing under the Imperial Palace, allowing endless hordes of Warp daemons to invade Terra and permanently chaining the Emperor to the Golden Throne.',
      suggestedQuestions: [
        'Why was the Imperial Webway project critical to humanity\'s long-term independence from the Warp and Astropaths?',
        'How did the Edict of Nikaea impact Magnus the Red\'s actions and the fate of the Thousand Sons?',
        'How did the breach under the Imperial Palace necessitate the Emperor remaining anchored to the Golden Throne throughout the Heresy?',
        'How did Horus manipulate Leman Russ\'s orders regarding the censure and burning of Prospero?'
      ]
    },
    {
      topic: 'WH40k: Horus Heresy',
      subtopic: 'The Istvaan massacres and the betrayal (Dropsite Massacre at Istvaan V, Istvaan III virus bombing, Eisenstein escape)',
      angle: 'Focus on a pivotal historical discovery or thought experiment.',
      angleFit: 'Examines the grand tactical ambush of the second wave traitor reinforcements at the Dropsite Massacre.',
      questionText: 'Why was the Dropsite Massacre at Istvaan V so devastating to the loyalist Legions?',
      options: [
        'Because the Emperor forbade the use of Terminator armor in the battle',
        'Because four reinforcing legions (Iron Warriors, Night Lords, Word Bearers, and Alpha Legion) secretly turned traitor and annihilated the vanguard loyalists from behind',
        'Because a solar flare disabled all communications and power armor batteries',
        'Because the Space Wolves attacked the wrong legion by mistake'
      ],
      correctIndex: 1,
      explanation: 'The loyalist vanguard (Iron Hands, Salamanders, and Raven Guard) made initial landings and pushed back Horus\'s first wave. When they fell back to the drop zones to allow the second wave of reinforcing legions—the Iron Warriors, Night Lords, Word Bearers, and Alpha Legion—to take the front line, the reinforcements opened fire on the loyalists from behind, utterly slaughtering them and killing Primarch Ferrus Manus.',
      suggestedQuestions: [
        'How did the death of Ferrus Manus and the Dropsite Massacre lead to the formation of the Shattered Legions?',
        'How did Corvus Corax and Vulkan survive the encirclement at Istvaan V?',
        'Why had Lorgar and the Word Bearers secretly organized the conspiracy among the second wave legions years in advance?',
        'What asymmetric warfare tactics did the Shattered Legions employ to slow Horus\'s advance toward Terra?'
      ]
    },
    {
      topic: 'WH40k: Horus Heresy',
      subtopic: 'The Siege of Terra and the Solar War (Solar System defenses, orbital bombardment, breach of the Eternity Gate, the Imperial Palace)',
      angle: 'Focus on a pivotal historical discovery or thought experiment.',
      angleFit: 'Explores Sanguinius\'s heroic defense of the Eternity Gate knowing his fatal foresight.',
      questionText: 'Why did Sanguinius, Primarch of the Blood Angels, hold the Eternity Gate during the Siege of Terra despite knowing his prophesied death?',
      options: [
        'Because he believed Horus would surrender if challenged to single combat',
        'Because his foresight revealed that buying time for the Imperial Palace was vital for the Emperor\'s final confrontation, embodying unwavering duty over fatalism',
        'Because he had lost all faith in the Emperor and sought suicide in combat',
        'Because Rogal Dorn ordered him to execute a tactical retreat into the Warp'
      ],
      correctIndex: 1,
      explanation: 'Sanguinius possessed prophetic precognition and knew his ultimate fate was to die at Horus\'s hand aboard the Vengeful Spirit. Despite this tragic knowledge, he stood alone holding the Eternity Gate against Ka\'Bandha, Angron, and legions of traitor forces, ensuring the inner sanctum of the Imperial Palace survived until the Emperor could launch the final strike on Horus\'s flagship.',
      suggestedQuestions: [
        'How did Sanguinius\'s duel with Ka\'Bandha and Angron at the Eternity Gate turn the tide of the ground battle for the inner palace?',
        'How did Sanguinius\'s death at the hands of Horus leave a permanent psychic trauma (the Black Rage) in the Blood Angels\' gene-seed?',
        'How did Rogal Dorn\'s defense architecture and fortress design delay the traitor forces across the Solar War?',
        'What was the strategic significance of Horus lowering the shields of the Vengeful Spirit during the final hours of the Siege?'
      ]
    },
    {
      topic: 'WH40k: Horus Heresy',
      subtopic: 'The Great Crusade and the Imperial Truth (Emperor\'s secular crusade, unification of Terra, compliance vs eradication of alien civilizations)',
      angle: 'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
      angleFit: 'Examines the theological and metaphysical rationale behind the Imperial Truth starving the Ruinous Powers of psychic energy.',
      questionText: 'Why did the Emperor strictly enforce the secular \'Imperial Truth\' and ban religion across the Great Crusade?',
      options: [
        'Because he wanted to establish himself as the sole living deity of mankind',
        'To starve the Chaos entities in the Warp of psychic resonance, worship, and emotional empowerment generated by religious veneration',
        'Because religious texts interfered with the mechanical maintenance of Space Marine power armor',
        'Because the Mechanicum of Mars demanded total suppression of spiritual thought outside the Cult of the Omnissiah'
      ],
      correctIndex: 1,
      explanation: 'The Emperor understood that entities of the Warp (the Chaos Gods) draw immense strength, cohesion, and psychic energy from the conscious worship, faith, rituals, and emotional fanaticism of sentient beings. By enforcing a rationalist, secular doctrine that denied the existence of gods and daemons, he sought to starve the Warp pantheon of power while mankind expanded and mastered the Webway.',
      suggestedQuestions: [
        'Why did the Monarchia censure of the Word Bearers directly trigger Lorgar\'s pilgrimage into the Eye of Terror?',
        'How did the Imperial Truth\'s suppression of knowledge regarding the Warp leave the Primarchs vulnerable to Chaos deception?',
        'How did Euphrati Keeler and the Lectitio Divinitatus lay the foundations for the future Imperial Cult despite the Imperial Truth?',
        'How does the relationship between human psychic emotion and Warp entities explain the nature of Chaos incursions?'
      ]
    }
  ],
  'Computer Science': [
    {
      topic: 'Computer Science',
      subtopic: 'Computational complexity and algorithm analysis (P vs NP, NP-completeness, Cook-Levin theorem, Big-O asymptotic notation)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Examines why polynomial-time certification differs fundamentally from search space exploration in deterministic Turing machines.',
      questionText: 'Why does verifying a candidate solution to an NP-complete problem take polynomial time while finding the solution is believed to require superpolynomial time?',
      options: [
        'Because computers can only execute deterministic instructions in reverse order',
        'Because verifying only requires evaluating a fixed deterministic circuit/verifier on given certificates, whereas finding a solution may require exploring an exponentially large search space without known shortcuts (P vs NP)',
        'Because NP-complete problems cannot be represented in binary logic',
        'Because Turing machines have finite tape memory'
      ],
      correctIndex: 1,
      explanation: 'By definition, the complexity class $\\text{NP}$ consists of decision problems whose positive instances possess certificates verifiable in polynomial time by a deterministic Turing machine. However, finding such a certificate deterministically may require traversing a state space of size $\\mathcal{O}(2^n)$ in the worst case unless $\\text{P} = \\text{NP}$.',
      suggestedQuestions: [
        'How does the Cook-Levin theorem prove that SAT (Boolean satisfiability) is NP-complete?',
        'What is the difference between a verifier relation $V(x, w)$ and a solver algorithm $A(x)$ in complexity theory?',
        'How would a polynomial-time algorithm for any one NP-complete problem prove $\\text{P} = \\text{NP}$?',
        'What are the cryptographic consequences if an efficient solver for NP-complete problems is discovered?'
      ]
    },
    {
      topic: 'Computer Science',
      subtopic: 'Data structures and memory layouts (hash collision resolution, balanced B-trees/Red-Black trees, heap invariant, cache locality)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Analyzes Simple Uniform Hashing Assumption (SUHA) vs worst-case chaining collision degeneration.',
      questionText: 'Why do hash tables achieve $\\mathcal{O}(1)$ average-case lookup time but can degrade to $\\mathcal{O}(n)$ in worst-case scenarios?',
      options: [
        'Because hash tables reallocate memory after every insertion',
        'Because uniform hashing distributes keys evenly across buckets in $\\mathcal{O}(1)$ average time, but adversarial or clustered keys causing hash collisions can collapse elements into a single linked chain of length $n$',
        'Because CPU caches cannot read prime number indices',
        'Because binary search is required to locate the hash table root'
      ],
      correctIndex: 1,
      explanation: 'Under the Simple Uniform Hashing Assumption (SUHA), keys are distributed uniformly across $m$ slots with load factor $\\alpha = n/m$, yielding $\\mathcal{O}(1 + \\alpha)$ expected lookup time. However, if multiple keys produce identical hash values (pigeonhole principle or malicious hash collision attacks), all entries chain into a single bucket, requiring linear search through $n$ elements.',
      suggestedQuestions: [
        'How does universal hashing with randomly chosen hash families prevent worst-case $\\mathcal{O}(n)$ algorithmic complexity attacks?',
        'What is the difference in cache locality and probe sequence between open addressing (linear probing) and separate chaining?',
        'How does the load factor threshold (e.g., $\\alpha = 0.75$) trigger dynamic rehashing and array resizing?',
        'How does Robin Hood hashing reduce variance in lookup probe length?'
      ]
    },
    {
      topic: 'Computer Science',
      subtopic: 'Operating systems and virtualization (virtual memory paging, TLB caches, context switching, interrupt handlers, scheduling)',
      angle: 'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
      angleFit: 'Explains how the MMU hardware page table translation provides process protection, defragmentation, and demand paging.',
      questionText: 'Why do modern operating systems use virtual memory with page tables instead of giving programs direct access to physical RAM addresses?',
      options: [
        'Because physical RAM cannot store 64-bit integer values directly',
        'To provide hardware-enforced memory isolation between processes, eliminate fragmentation via contiguous virtual mapping to non-contiguous physical frames, and enable transparent disk swapping',
        'Because CPUs require all program memory to be stored on magnetic disks',
        'Because direct physical addressing causes electrical interference on motherboard bus lanes'
      ],
      correctIndex: 1,
      explanation: 'Virtual memory decouples a process\'s address space from physical RAM. The Memory Management Unit (MMU) translates virtual pages to physical frames via multi-level page tables cached by the TLB. This prevents processes from corrupting each other\'s memory, enforces read/write/execute permissions, eliminates external fragmentation, and allows overcommitting memory through on-demand paging and swap space.',
      suggestedQuestions: [
        'How does a Translation Lookaside Buffer (TLB) cache reduce the overhead of multi-level page table traversals?',
        'How do page faults trigger demand paging to bring disk pages into physical RAM frames?',
        'What is the difference between internal and external fragmentation in memory management?',
        'How does the NX (No-Execute) bit in page table entries prevent buffer overflow arbitrary code execution?'
      ]
    },
    {
      topic: 'Computer Science',
      subtopic: 'Distributed systems and consensus (CAP theorem, Raft and Paxos consensus, Byzantine fault tolerance, eventual consistency)',
      angle: 'Focus on resolving a classic paradox or widespread conceptual misconception in the field.',
      angleFit: 'Examines why network partitions force an inescapable choice between availability and linearizable consistency.',
      questionText: 'Why can a distributed data store not simultaneously guarantee Consistency, Availability, and Partition Tolerance according to the CAP Theorem?',
      options: [
        'Because network cables cannot transfer more than 1 gigabit per second during partitions',
        'Because when a network partition ($P$) occurs, the system must choose between returning stale data/rejecting writes (sacrificing $A$) or allowing conflicting updates across partitions (sacrificing $C$)',
        'Because distributed nodes cannot synchronize clocks beyond microsecond precision',
        'Because Paxos and Raft algorithms only work on single-core processors'
      ],
      correctIndex: 1,
      explanation: 'When a network partition ($P$) divides nodes so they cannot communicate, a client write to one partition creates an inescapable tradeoff: to maintain linearizable Consistency ($C$), the system must refuse to acknowledge writes or reads until connectivity is restored, sacrificing Availability ($A$); to maintain Availability ($A$), nodes must accept writes locally, creating inconsistent divergent state.',
      suggestedQuestions: [
        'How does PACELC theorem expand on CAP by addressing the Latency vs Consistency tradeoff in the absence of partitions?',
        'How does the Raft consensus algorithm use leader heartbeats and quorum majorities ($N/2 + 1$) to survive network partitions?',
        'What is the difference between strong linearizability and eventual consistency in distributed databases?',
        'How do Vector Clocks and Conflict-Free Replicated Data Types (CRDTs) resolve concurrent partition writes in AP systems?'
      ]
    },
    {
      topic: 'Computer Science',
      subtopic: 'Cryptography and information security (RSA public-key primes, elliptic-curve Diffie-Hellman, SHA-256 collision resistance, zero-knowledge proofs)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Demonstrates the one-way trapdoor property of prime multiplication and modular inversion vs integer factorization.',
      questionText: 'Why does RSA public-key cryptography rely on the product of two large prime numbers ($N = pq$) for secure encryption?',
      options: [
        'Because prime numbers are impervious to electromagnetic radiation',
        'Because multiplying two large primes is computationally trivial ($\\mathcal{O}(n^2)$), but factoring their composite product $N$ without knowing $p$ and $q$ is believed to be computationally intractable (the integer factorization trapdoor)',
        'Because prime numbers have no binary representation in floating point registers',
        'Because modular exponentiation cannot be inverted even if $p$ and $q$ are known'
      ],
      correctIndex: 1,
      explanation: 'RSA relies on the one-way trapdoor function of integer factorization. Computing $N = p \\times q$ and Euler\'s totient $\\phi(N) = (p-1)(q-1)$ allows deriving public key $e$ and private decryption key $d \\equiv e^{-1} \\pmod{\\phi(N)}$ via the Extended Euclidean Algorithm. An eavesdropper knowing only $N$ and $e$ cannot compute $\\phi(N)$ without factoring $N$, which has no known classical polynomial-time solution.',
      suggestedQuestions: [
        'How does Euler\'s totient theorem ($a^{\\phi(N)} \\equiv 1 \\pmod N$) guarantee that $(m^e)^d \\equiv m \\pmod N$ decrypts the ciphertext?',
        'Why does Shor\'s quantum algorithm factor large integers in polynomial time $\\mathcal{O}((\\log N)^3)$, threatening RSA security?',
        'How does optimal asymmetric encryption padding (OAEP) protect RSA from deterministic chosen-ciphertext attacks?',
        'What is the difference in key size and computational efficiency between 2048-bit RSA and 256-bit Elliptic Curve Cryptography (ECC)?'
      ]
    }
  ],
};

export function parseTopicsList(topicsString: string): string[] {
  if (!topicsString || !topicsString.trim()) {
    return DEFAULT_TOPICS.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
  }
  return topicsString
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export async function generateWhyQuestion(
  settings: UserSettings,
  specificTopic?: string,
  isDemoUser: boolean = false,
  recentQuestions: string[] = [],
  userId: string = 'anonymous',
  wrongQuestionContext?: WrongQuestionContext
): Promise<Question> {
  const topics = parseTopicsList(settings.topics);
  const chosenTopic = specificTopic || (wrongQuestionContext ? wrongQuestionContext.topic : topics[Math.floor(Math.random() * topics.length)]) || 'Physics';

  // Demo user fallback: only Explorer Demo mode can use canned questions
  if (!settings.apiKey || !settings.apiKey.trim()) {
    if (isDemoUser) {
      // Find matching topic (case-insensitive) in SAMPLE_QUESTIONS
      const matchingKey = Object.keys(SAMPLE_QUESTIONS).find(
        (k) =>
          k.toLowerCase() === chosenTopic.toLowerCase() ||
          (k.includes('Horus Heresy') &&
            (chosenTopic.toLowerCase().includes('heresy') ||
              chosenTopic.toLowerCase().includes('wh40k') ||
              chosenTopic.toLowerCase().includes('warhammer'))) ||
          (k === 'Computer Science' &&
            (chosenTopic.toLowerCase().includes('computer') || chosenTopic.toLowerCase() === 'cs'))
      );
      const list = (matchingKey ? SAMPLE_QUESTIONS[matchingKey] : null) || SAMPLE_QUESTIONS['Physics'] || Object.values(SAMPLE_QUESTIONS)[0];

      if (wrongQuestionContext) {
        // Filter out the wrong question itself
        const pool = list.filter((q) => q.questionText !== wrongQuestionContext.questionText);
        const available = pool.length > 0 ? pool : list;

        // Score candidates based on relevance to the explanation / subtopic
        const explanationWords = wrongQuestionContext.explanation
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3);

        let bestMatch = available[0];
        let maxScore = -1;

        for (const candidate of available) {
          let score = 0;
          const candidateContent = `${candidate.questionText} ${candidate.explanation} ${candidate.subtopic || ''}`.toLowerCase();
          for (const word of explanationWords) {
            if (candidateContent.includes(word)) score++;
          }
          if (score > maxScore) {
            maxScore = score;
            bestMatch = candidate;
          }
        }

        const chosen = bestMatch || available[0];
        return {
          ...chosen,
          topic: chosenTopic,
          isReinforcement: true,
          reinforcementSourceQuestion: wrongQuestionContext.questionText,
        };
      }

      // Filter out recent questions to ensure freshness and prevent repetitions
      const unseen = list.filter((q) => !recentQuestions.includes(q.questionText));
      // If all questions in this topic have been seen recently, exclude at least the most recently asked question
      const pool = unseen.length > 0 ? unseen : list.filter((q) => recentQuestions[0] !== q.questionText);
      const candidates = pool.length > 0 ? pool : list;
      const sample = candidates[Math.floor(Math.random() * candidates.length)];
      return {
        ...sample,
        topic: chosenTopic,
      };
    }

    // Real users must configure their own LLM API key
    throw new Error(
      `Please configure your ${settings.provider.toUpperCase()} API Key in Settings to generate questions with ${settings.model}.`
    );
  }

  const apiKey = settings.apiKey.trim();
  const model = settings.model;

  // Retrieve or dynamically generate & cache subtopics for this topic
  const subtopics = await getOrGenerateSubtopics(settings, chosenTopic, userId, isDemoUser);

  switch (settings.provider) {
    case 'gemini':
      return await generateGeminiQuestion(model, apiKey, topics, chosenTopic, recentQuestions, subtopics, wrongQuestionContext);
    case 'openai':
      return await generateOpenAIQuestion(model, apiKey, topics, chosenTopic, recentQuestions, subtopics, wrongQuestionContext);
    case 'anthropic':
      return await generateAnthropicQuestion(model, apiKey, topics, chosenTopic, recentQuestions, subtopics, wrongQuestionContext);
    default:
      throw new Error(`Unsupported LLM provider: ${settings.provider}`);
  }
}

export async function sendChatMessage(
  settings: UserSettings,
  context: Question,
  history: ChatMessage[],
  newMessage: string,
  isDemoUser: boolean = false
): Promise<string> {
  if (!settings.apiKey || !settings.apiKey.trim()) {
    if (isDemoUser) {
      return `**Great question about ${context.topic}!**\n\nTo have full interactive conversations with live AI models (ChatGPT, Claude, or Gemini), please configure your API key in **Settings** (top right).\n\nIn the meantime: The core principle here is based on **${context.topic}**. Notice how the explanation points to: *${context.explanation}*`;
    }

    throw new Error(
      `Please configure your ${settings.provider.toUpperCase()} API Key in Settings to chat with ${settings.model}.`
    );
  }

  const apiKey = settings.apiKey.trim();
  const model = settings.model;

  switch (settings.provider) {
    case 'gemini':
      return await chatWithGemini(model, apiKey, context, history, newMessage);
    case 'openai':
      return await chatWithOpenAI(model, apiKey, context, history, newMessage);
    case 'anthropic':
      return await chatWithAnthropic(model, apiKey, context, history, newMessage);
    default:
      throw new Error(`Unsupported LLM provider: ${settings.provider}`);
  }
}

export async function testLLMConnection(
  provider: LLMProvider,
  model: string,
  apiKey: string
): Promise<{ success: boolean; message: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, message: 'Please enter an API key to test.' };
  }

  switch (provider) {
    case 'gemini':
      return await testGeminiKey(model, apiKey);
    case 'openai':
      return await testOpenAIKey(model, apiKey);
    case 'anthropic':
      return await testAnthropicKey(model, apiKey);
    default:
      return { success: false, message: 'Unknown provider.' };
  }
}
