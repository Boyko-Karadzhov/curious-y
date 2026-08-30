import { Question, ChatMessage, UserSettings, LLMProvider } from '../../types';
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
    },
  ],
};

export function parseTopicsList(topicsString: string): string[] {
  if (!topicsString || !topicsString.trim()) {
    return ['Physics', 'Chemistry', 'Algebra', 'Calculus', 'History'];
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
  userId: string = 'anonymous'
): Promise<Question> {
  const topics = parseTopicsList(settings.topics);
  const chosenTopic = specificTopic || topics[Math.floor(Math.random() * topics.length)] || 'Physics';

  // Demo user fallback: only Explorer Demo mode can use canned questions
  if (!settings.apiKey || !settings.apiKey.trim()) {
    if (isDemoUser) {
      // Find matching topic (case-insensitive) in SAMPLE_QUESTIONS
      const matchingKey = Object.keys(SAMPLE_QUESTIONS).find(
        (k) => k.toLowerCase() === chosenTopic.toLowerCase()
      );
      const list = (matchingKey ? SAMPLE_QUESTIONS[matchingKey] : null) || SAMPLE_QUESTIONS['Physics'] || Object.values(SAMPLE_QUESTIONS)[0];

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
      return await generateGeminiQuestion(model, apiKey, topics, chosenTopic, recentQuestions, subtopics);
    case 'openai':
      return await generateOpenAIQuestion(model, apiKey, topics, chosenTopic, recentQuestions, subtopics);
    case 'anthropic':
      return await generateAnthropicQuestion(model, apiKey, topics, chosenTopic, recentQuestions, subtopics);
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
