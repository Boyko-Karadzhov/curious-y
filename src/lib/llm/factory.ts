import {
  Question,
  ChatMessage,
  UserSettings,
  LLMProvider,
  TOPICS,
  WrongQuestionContext,
  Concept,
  ReasoningComplexity,
  REASONING_COMPLEXITIES,
  REASONING_COMPLEXITY_INFO,
} from '../../types';
import { generateGeminiQuestion, chatWithGemini, testGeminiKey } from './gemini';
import { generateOpenAIQuestion, chatWithOpenAI, testOpenAIKey } from './openai';
import { generateAnthropicQuestion, chatWithAnthropic, testAnthropicKey } from './anthropic';
import { getOrGenerateSubtopics } from './subtopics';
import { getUserConcepts, saveUserConcepts } from '../../services/database';
import {
  getEligibleConcepts,
  getPrimaryTopic,
  isAllConceptsMasteredOrEmpty,
  selectConceptForQuestion,
} from '../concepts/registry';
import { selectReasoningComplexity } from '../concepts/mastery';
import { buildQuestionDAG } from '../concepts/dag';

// Sample questions used EXCLUSIVELY in Explorer Demo mode when no LLM key is configured
const SAMPLE_QUESTIONS: Record<string, Question[]> = {
  Physics: [
    {
      topic: 'Physics',
      subtopic: 'Electromagnetism',
      angle: 'First principles — explain from fundamental rules',
      angleFit: 'Examines Fermat\'s principle of least time and phase velocity in denser media.',
      questionText: 'Why does light bend (refract) when entering a denser medium like water or glass?',
      options: [
        'Because the frequency of light decreases due to resistance in the medium',
        'Because wave crests travel slower in the denser medium, causing the wavefront to pivot (Fermat\'s principle)',
        'Because photons collide with atoms and bounce at a fixed angle',
        'Because gravitational attraction from dense atoms pulls the light ray downward'
      ],
      correctIndex: 1,
      explanation: 'According to Fermat\'s principle of least time and Snell\'s Law ($n_1 \\sin \\theta_1 = n_2 \\sin \\theta_2$), light takes the path that minimizes travel time. In an optically denser medium, light propagates at a lower phase velocity $v = \\frac{c}{n}$, causing the wavefront to pivot towards the normal line.',
      suggestedQuestions: [
        'How does the refractive index $n$ relate to the phase velocity $v = \\frac{c}{n}$ in a medium?',
        'How does Fermat\'s principle derive Snell\'s Law?',
        'Why does light frequency stay constant while wavelength shortens in a denser medium?'
      ]
    },
    {
      topic: 'Physics',
      subtopic: 'Energy, symmetry & conservation',
      angle: 'First principles — explain from fundamental rules',
      angleFit: 'Explores how conservation of angular momentum $L = I\\omega$ dictates rotational acceleration.',
      questionText: 'Why does a spinning ice skater rotate faster when pulling their arms inward?',
      options: [
        'Because their kinetic energy increases due to centrifugal force',
        'Because pulling their arms decreases their moment of inertia $I$, conserving angular momentum $L = I\\omega$',
        'Because air resistance decreases drastically when arms are tucked in',
        'Because muscle contraction generates an external torque that accelerates rotation'
      ],
      correctIndex: 1,
      explanation: 'In the absence of external torques ($\\tau_{\\text{net}} = 0$), total angular momentum $L = I \\omega$ is conserved. When the skater pulls in their arms, moment of inertia decreases ($I = \\sum m_i r_i^2$), so angular velocity $\\omega$ must increase.',
      suggestedQuestions: [
        'How does moment of inertia depend on radial distance from the rotation axis?',
        'Why is angular momentum conserved while rotational kinetic energy increases?'
      ]
    },
    {
      topic: 'Physics',
      subtopic: 'Relativity & gravitation',
      angle: 'Counterintuitive mechanism — why reality differs from intuition',
      angleFit: 'Dispels the zero-gravity misconception for astronauts in orbital free-fall.',
      questionText: 'Why do astronauts aboard the International Space Station float in weightlessness despite Earth\'s gravity being $\\sim 90\\%$ as strong at their altitude?',
      options: [
        'Because the ISS is outside Earth\'s gravitational pull in deep space',
        'Because the station and astronauts are in continuous orbital free-fall towards Earth with no normal contact force',
        'Because magnetic shielding on the space station cancels Earth\'s gravity',
        'Because atmospheric drag is zero, removing normal gravitational pull'
      ],
      correctIndex: 1,
      explanation: 'At an altitude of $\\sim 400\\text{ km}$, Earth\'s gravity is still $\\sim 90\\%$ of surface $g$. Astronauts feel weightless because the ISS is in perpetual orbital free-fall, meaning normal contact force ($N = 0$) is zero.',
      suggestedQuestions: [
        'How does orbital velocity balance gravitational acceleration to maintain orbit?',
        'What is the difference between gravitational force and normal contact force?'
      ]
    }
  ],
  'Mathematics & Logic': [
    {
      topic: 'Mathematics & Logic',
      subtopic: 'Calculus & continuous change',
      angle: 'First principles — explain from fundamental rules',
      angleFit: 'Traces the foundational limit definition showing why base $e$ uniquely satisfies $\\lim_{h \\to 0} \\frac{e^h - 1}{h} = 1$.',
      questionText: 'Why is the derivative of the natural exponential function $\\frac{d}{dx}e^x = e^x$ equal to itself?',
      options: [
        'Because Euler\'s number $e$ is uniquely defined such that $\\lim_{h \\to 0} \\frac{e^h - 1}{h} = 1$',
        'Because the tangent slope is always perpendicular to the normal line',
        'Because $e$ is an imaginary number rotation in the complex plane',
        'Because integration and differentiation cancel out unconditionally'
      ],
      correctIndex: 0,
      explanation: 'From the limit definition of the derivative: $\\frac{d}{dx}a^x = a^x \\lim_{h \\to 0} \\frac{a^h-1}{h}$. The base $e$ is specifically chosen so that this limit equals $1$, making the rate of change equal to the value of the function.',
      suggestedQuestions: [
        'How does Euler\'s number $e$ arise from compound interest and limits?',
        'How does the Taylor series of $e^x$ confirm this derivative identity?'
      ]
    },
    {
      topic: 'Mathematics & Logic',
      subtopic: 'Numbers & arithmetic structures',
      angle: 'Counterintuitive mechanism — why reality differs from intuition',
      angleFit: 'Demonstrates divergence of harmonic series despite terms tending to zero.',
      questionText: 'Why does the harmonic series $\\sum_{n=1}^\\infty \\frac{1}{n} = 1 + \\frac{1}{2} + \\frac{1}{3} + \\dots$ diverge even though $\\lim_{n\\to\\infty} \\frac{1}{n} = 0$?',
      options: [
        'Because terms alternate in sign',
        'Because terms decay too slowly, and the integral comparison $\\int_1^\\infty \\frac{1}{x} dx$ grows unboundedly to infinity',
        'Because the ratio test limit is infinite',
        'Because $\\frac{1}{n}$ is undefined for prime numbers'
      ],
      correctIndex: 1,
      explanation: 'While terms shrink to zero, by the Integral Test $\\sum_{n=1}^\\infty \\frac{1}{n} \\ge \\int_1^\\infty \\frac{1}{x} dx = [\\ln x]_1^\\infty = \\infty$. The partial sums grow without bound.',
      suggestedQuestions: [
        'Why is $\\lim a_n = 0$ necessary but not sufficient for convergence?',
        'How did Oresme/Cauchy prove divergence by grouping powers of 2?'
      ]
    },
    {
      topic: 'Mathematics & Logic',
      subtopic: 'Linear algebra',
      angle: 'Micro → macro — how lower-level behavior produces emergence',
      angleFit: 'Interprets the determinant as geometric volume scaling factor where zero determinant collapses dimensionality.',
      questionText: 'Why does a square matrix $A$ have an inverse $A^{-1}$ if and only if its determinant $\\det(A) \\neq 0$?',
      options: [
        'Because matrix multiplication is non-commutative',
        'Because $\\det(A)$ represents the signed volume transformation factor; $\\det(A) = 0$ collapses space into fewer dimensions, destroying invertibility',
        'Because eigenvalue traces must sum to an odd integer',
        'Because transpose operations require orthogonal basis vectors'
      ],
      correctIndex: 1,
      explanation: 'The determinant $\\det(A)$ measures how $A$ scales $n$-dimensional volumes. If $\\det(A) = 0$, the transformation collapses space into a lower dimension, mapping distinct vectors to the same output and making inverse reconstruction impossible.',
      suggestedQuestions: [
        'How does $\\det(A) = 0$ relate to linear dependence of column vectors?',
        'What is the relationship between the determinant and eigenvalues of $A$?'
      ]
    }
  ],
  Chemistry: [
    {
      topic: 'Chemistry',
      subtopic: 'Bonding & molecular structure',
      angle: 'Micro → macro — how lower-level behavior produces emergence',
      angleFit: 'Connects tetrahedral hydrogen bonding geometry to the lower density of solid ice.',
      questionText: 'Why does solid ice float on liquid water, unlike most other substances whose solid phases sink?',
      options: [
        'Because ice traps microscopic air bubbles inside its crystal lattice',
        'Because hydrogen bonds lock into an open hexagonal crystal lattice that is less dense than disordered liquid water',
        'Because water molecules lose mass when freezing',
        'Because surface tension pushes ice upwards against gravity'
      ],
      correctIndex: 1,
      explanation: 'As water freezes at $0^\\circ\\text{C}$, hydrogen bonds arrange water molecules into a rigid, open hexagonal lattice. This geometry holds molecules further apart than in the liquid state, making ice $\\sim 9\\%$ less dense.',
      suggestedQuestions: [
        'Why does liquid water reach maximum density at $4^\\circ\\text{C}$?',
        'How does ice floating protect aquatic ecosystems in winter?'
      ]
    },
    {
      topic: 'Chemistry',
      subtopic: 'Chemical thermodynamics',
      angle: 'Counterintuitive mechanism — why reality differs from intuition',
      angleFit: 'Shows how positive entropy term $-T\\Delta S$ overcomes endothermic enthalpy $\\Delta H > 0$.',
      questionText: 'Why can an endothermic chemical reaction ($\\Delta H > 0$) occur spontaneously at elevated temperatures?',
      options: [
        'Because enthalpy becomes negative when heated',
        'Because the entropic term $-T\\Delta S$ becomes sufficiently negative to make Gibbs free energy $\\Delta G = \\Delta H - T\\Delta S < 0$',
        'Because catalysts reverse the sign of enthalpy at high temperatures',
        'Because activation energy vanishes at high thermal energy'
      ],
      correctIndex: 1,
      explanation: 'Spontaneity is governed by Gibbs free energy: $\\Delta G = \\Delta H - T \\Delta S$. When entropy increases ($\\Delta S > 0$), sufficiently high temperature makes $-T \\Delta S$ dominate $\\Delta H$, yielding $\\Delta G < 0$.',
      suggestedQuestions: [
        'What is the threshold temperature $T = \\Delta H / \\Delta S$ for spontaneity?',
        'How does the second law of thermodynamics connect to Gibbs free energy?'
      ]
    }
  ],
  Life: [
    {
      topic: 'Life',
      subtopic: 'Molecular & cellular biology',
      angle: 'Micro → macro — how lower-level behavior produces emergence',
      angleFit: 'Explains how the proton electrochemical gradient drives ATP synthase rotation.',
      questionText: 'Why do mitochondria require a proton gradient across the inner membrane to synthesize ATP (chemiosmosis)?',
      options: [
        'Because protons act as chemical fuel consumed directly in ATP hydrolysis',
        'Because the proton-motive force drives the mechanical rotary motor of ATP synthase to phosphorylate ADP into ATP',
        'Because protons neutralize toxic mitochondrial acids',
        'Because proton accumulation breaks down glucose directly'
      ],
      correctIndex: 1,
      explanation: 'The electron transport chain pumps protons ($H^+$) into the intermembrane space, generating an electrochemical gradient (proton-motive force). Protons flow back into the matrix through ATP synthase, driving mechanical conformational rotation that binds ADP and $P_i$ into ATP.',
      suggestedQuestions: [
        'How does Peter Mitchell\'s chemiosmotic hypothesis explain bioenergetics?',
        'What happens when uncoupling proteins allow protons to bypass ATP synthase?'
      ]
    },
    {
      topic: 'Life',
      subtopic: 'Evolution & population genetics',
      angle: 'Counterintuitive mechanism — why reality differs from intuition',
      angleFit: 'Highlights heterozygote advantage maintaining a deleterious allele in malaria-endemic regions.',
      questionText: 'Why does the sickle-cell allele persist at high frequencies in populations exposed to malaria despite causing severe disease when homozygous?',
      options: [
        'Because the sickle-cell gene mutates at exceptionally high rates',
        'Because heterozygous individuals ($HbA/HbS$) gain survival advantage and resistance against Plasmodium falciparum malaria (heterozygote advantage)',
        'Because the sickle-cell allele is dominant in all environmental conditions',
        'Because sickle-cell red blood cells carry twice as much oxygen'
      ],
      correctIndex: 1,
      explanation: 'In regions with endemic malaria, heterozygous carriers ($HbA/HbS$) experience balancing selection: their red blood cells sickle prematurely when infected by malaria parasites, destroying the parasite and conferring survival advantage.',
      suggestedQuestions: [
        'How does balancing selection maintain polymorphism in a gene pool?',
        'What is the molecular mechanism of hemoglobin S aggregation under low oxygen?'
      ]
    }
  ],
  'Computer Science': [
    {
      topic: 'Computer Science',
      subtopic: 'Operating systems & systems programming',
      angle: 'Micro → macro — how lower-level behavior produces emergence',
      angleFit: 'Explains how MMU page tables isolate memory address spaces between processes.',
      questionText: 'Why do modern operating systems use virtual memory with page tables instead of direct physical RAM addresses?',
      options: [
        'Because physical RAM cannot store 64-bit integer values',
        'To provide hardware-enforced memory isolation between processes, eliminate fragmentation, and enable transparent demand paging',
        'Because CPUs require all program memory to reside on magnetic disks',
        'Because direct physical addressing causes electrical bus interference'
      ],
      correctIndex: 1,
      explanation: 'Virtual memory isolates process address spaces, preventing programs from reading or corrupting each other\'s memory. The MMU translates virtual pages to arbitrary physical frames via page tables cached in the TLB.',
      suggestedQuestions: [
        'How does the Translation Lookaside Buffer (TLB) speed up memory access?',
        'What happens during a page fault in demand paging?'
      ]
    },
    {
      topic: 'Computer Science',
      subtopic: 'Distributed & concurrent systems',
      angle: 'Paradox / apparent contradiction — reconcile conflicting-looking facts',
      angleFit: 'Demonstrates the unavoidable tradeoff between consistency and availability during network partitions.',
      questionText: 'Why can a distributed data store not simultaneously guarantee Consistency, Availability, and Partition Tolerance according to the CAP Theorem?',
      options: [
        'Because network cables cannot transfer packets during partitions',
        'Because during a network partition, a system must choose between returning stale data/rejecting writes (sacrificing A) or allowing divergent conflicting writes (sacrificing C)',
        'Because distributed nodes cannot synchronize clocks beyond microsecond precision',
        'Because consensus algorithms only operate on single cores'
      ],
      correctIndex: 1,
      explanation: 'When a network partition ($P$) occurs, nodes in different partitions cannot communicate. To guarantee linearizable consistency ($C$), the system must refuse writes/reads in partitioned nodes (sacrificing $A$). To guarantee availability ($A$), it must accept writes, producing inconsistent state.',
      suggestedQuestions: [
        'How does Raft consensus achieve strong consistency with a majority quorum?',
        'What is eventual consistency in AP distributed databases?'
      ]
    },
    {
      topic: 'Computer Science',
      subtopic: 'Cryptography & security',
      angle: 'First principles — explain from fundamental rules',
      angleFit: 'Explains the one-way trapdoor asymmetry between prime multiplication and integer factorization.',
      questionText: 'Why does RSA public-key cryptography rely on the product of two large prime numbers ($N = pq$) for secure encryption?',
      options: [
        'Because prime numbers cannot be represented in binary registers',
        'Because multiplying two primes is computationally trivial, but factoring their composite product $N$ without knowing $p$ and $q$ has no known efficient classical algorithm',
        'Because modular exponentiation is impossible to compute without quantum gates',
        'Because prime numbers prevent electromagnetic side-channel attacks'
      ],
      correctIndex: 1,
      explanation: 'RSA is built on the integer factorization trapdoor function. Multiplying two large primes $p$ and $q$ is fast ($\\mathcal{O}(n^2)$), but computing Euler\'s totient $\\phi(N) = (p-1)(q-1)$ to find private key $d$ requires factoring $N$, which is computationally intractable classically.',
      suggestedQuestions: [
        'How does Euler\'s totient theorem guarantee decryption in RSA?',
        'Why does Shor\'s quantum algorithm factor integers in polynomial time?'
      ]
    }
  ],
  'Earth & Space': [
    {
      topic: 'Earth & Space',
      subtopic: 'Cosmology & the universe',
      angle: 'Historical discovery — why an idea was needed / how thinking changed',
      angleFit: 'Explains how the discovery of the Cosmic Microwave Background provided decisive observational proof of the Big Bang over the Steady State theory.',
      questionText: 'Why was the discovery of the Cosmic Microwave Background (CMB) considered decisive proof of the Big Bang theory?',
      options: [
        'Because it proved space is completely filled with dark matter stars',
        'Because it is the redshifted relic thermal radiation predicted from the hot, dense early universe recombination epoch',
        'Because it showed galaxies are stationary and not expanding',
        'Because it detected sound waves traveling through interplanetary vacuum'
      ],
      correctIndex: 1,
      explanation: 'The CMB is the remnant thermal blackbody radiation ($T \\approx 2.725\\text{ K}$) emitted when the early universe cooled to $\\sim 3000\\text{ K}$ (recombination epoch), allowing photons to decouple from electrons. Its near-uniform existence across the sky confirmed the universe expanded from an extremely hot, dense origin.',
      suggestedQuestions: [
        'Why did photon decoupling occur when neutral hydrogen atoms formed?',
        'What do slight temperature anisotropies ($10^{-5}$) in the CMB reveal about cosmic structure formation?'
      ]
    },
    {
      topic: 'Earth & Space',
      subtopic: 'Stellar astrophysics',
      angle: 'Boundary / failure case — where a model stops working and why',
      angleFit: 'Shows why electron degeneracy pressure fails above the Chandrasekhar limit of $\\sim 1.44 M_\\odot$.',
      questionText: 'Why cannot a white dwarf star exceed the Chandrasekhar mass limit ($\\sim 1.44 M_\\odot$) without collapsing?',
      options: [
        'Because nuclear fusion becomes too intense, blowing the star apart',
        'Because degenerate electrons become relativistic, meaning electron degeneracy pressure can no longer scale fast enough to balance gravitational inward pull',
        'Because the star runs out of hydrogen fuel to burn',
        'Because magnetic fields invert and crush the core'
      ],
      correctIndex: 1,
      explanation: 'White dwarfs are supported against gravity by electron degeneracy pressure (Pauli exclusion principle). Above $\\sim 1.44 M_\\odot$, electrons approach relativistic speeds ($v \\to c$), softening the equation of state from $P \\propto \\rho^{5/3}$ to $P \\propto \\rho^{4/3}$, which is insufficient to resist gravitational collapse into a neutron star or black hole.',
      suggestedQuestions: [
        'How does the Pauli exclusion principle generate degeneracy pressure?',
        'What happens during a Type Ia supernova when a white dwarf accretes mass beyond the limit?'
      ]
    }
  ],
  'Mind & Behavior': [
    {
      topic: 'Mind & Behavior',
      subtopic: 'Learning & memory',
      angle: 'First principles — explain from fundamental rules',
      angleFit: 'Explains Hebbian learning and Long-Term Potentiation (LTP) as the cellular basis for synaptic memory consolidation.',
      questionText: 'Why does Long-Term Potentiation (LTP) at synapses form the physiological foundation of learning and memory?',
      options: [
        'Because it produces new nerve cells in the spinal cord each time a thought occurs',
        'Because repeated high-frequency stimulation strengthens synaptic transmission by inserting additional AMPA receptors via NMDA receptor activation',
        'Because it eliminates myelin sheaths to speed up electrical conduction',
        'Because it converts electrical impulses into permanent magnetic fields'
      ],
      correctIndex: 1,
      explanation: 'LTP demonstrates Hebbian plasticity ("neurons that fire together wire together"). Strong postsynaptic depolarization expels $Mg^{2+}$ from NMDA receptors, allowing $Ca^{2+}$ influx, which triggers intracellular signaling cascades that insert more AMPA receptors into the postsynaptic membrane, strengthening synaptic efficacy.',
      suggestedQuestions: [
        'Why does the $Mg^{2+}$ block in NMDA receptors act as a coincidence detector?',
        'How does Long-Term Depression (LTD) balance synaptic strengthening?'
      ]
    },
    {
      topic: 'Mind & Behavior',
      subtopic: 'Perception & sensory processing',
      angle: 'Counterintuitive mechanism — why reality differs from intuition',
      angleFit: 'Reveals why the physiological blind spot exists where the optic nerve exits the retina, and how the brain fills it in.',
      questionText: 'Why do humans have an anatomical blind spot in each eye of which they are normally unaware?',
      options: [
        'Because the cornea has a central hole for tear drainage',
        'Because the optic disc lacks photoreceptors where retinal ganglion axons exit the eye to form the optic nerve, and the brain interpolates the missing visual data',
        'Because the fovea only senses black and white vision',
        'Because the lens cannot focus light from peripheral angles'
      ],
      correctIndex: 1,
      explanation: 'The optic disc is the anatomical exit point where ganglion cell axons gather into the optic nerve. Because no photoreceptor rod or cone cells exist at this site, no light can be transduced there. The brain perceptually "fills in" the gap using binocular vision and surrounding contextual visual patterns.',
      suggestedQuestions: [
        'How does inverted retinal wiring in vertebrates contrast with cephalopod eyes (which lack a blind spot)?',
        'How does cortical perceptual filling-in reconstruct color and texture in the blind spot?'
      ]
    }
  ],
  'Society & History': [
    {
      topic: 'Society & History',
      subtopic: 'Economic systems & trade',
      angle: 'First principles — explain from fundamental rules',
      angleFit: 'Applies Allen\'s economic model of high wages and cheap coal driving mechanized adoption in Britain.',
      questionText: 'Why did the Industrial Revolution originate in 18th-century Great Britain rather than in other wealthy empires like France or China?',
      options: [
        'Because Britain completely banned all agricultural farming',
        'Because Britain uniquely combined high wages (making labor-saving machines profitable) with abundant, cheap surface coal near water transport',
        'Because the steam engine was kept a secret government monopoly for two centuries',
        'Because Britain was the only country with a banking system'
      ],
      correctIndex: 1,
      explanation: 'Economic historian Robert Allen showed Britain had a unique price structure: high wages relative to energy and capital costs. Investing in fuel-heavy, labor-saving steam machinery was economically viable only in Britain, where vast surface coal deposits lay close to navigable waterways.',
      suggestedQuestions: [
        'Why were early Newcomen engines economically unviable where coal was expensive?',
        'How did institutional factors like property rights support British technological adoption?'
      ]
    },
    {
      topic: 'Society & History',
      subtopic: 'Ancient societies & civilizations',
      angle: 'Paradox / apparent contradiction — reconcile conflicting-looking facts',
      angleFit: 'Analyzes how complex supply chain interdependence led to systemic multi-civilization collapse.',
      questionText: 'Why did the Late Bronze Age collapse (~1200 BCE) abruptly bring down multiple major Mediterranean civilizations simultaneously?',
      options: [
        'Because a single asteroid hit the Mediterranean basin',
        'Because hyper-specialized, interdependent palace economies suffered systemic cascading collapse from simultaneous mega-droughts, trade disruptions, and Sea Peoples raids',
        'Because iron weapons instantly made all bronze armies obsolete in a single battle',
        'Because currency hyperinflation destroyed all Mediterranean banks'
      ],
      correctIndex: 1,
      explanation: 'The Late Bronze Age world (Mycenaeans, Hittites, New Kingdom Egypt, Ugarit) was a deeply interconnected trade network reliant on long-distance tin and copper supply chains. Prolonged droughts, earthquakes, and migratory raids created cascading failures across mutually dependent palace economies.',
      suggestedQuestions: [
        'How did centralized palace redistribution systems create brittle single-point dependencies?',
        'What archeological evidence links multi-decadal droughts to agricultural failures across the Aegean?'
      ]
    }
  ]
};

export function parseTopicsList(topicsString?: string): string[] {
  if (!topicsString || !topicsString.trim()) {
    return [...TOPICS];
  }
  return topicsString
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

const SAMPLE_CONCEPT_QUESTIONS: Record<string, Partial<Question>> = {
  'Phase velocity': {
    topic: 'Physics',
    subtopic: 'Phase velocity',
    angle: 'First principles — explain from fundamental rules',
    angleFit: 'Connects wave crest propagation directly to spatial wavelength and oscillation frequency.',
    questionText: 'Why is the phase velocity $v$ of a wave given by the relation $v = \\lambda f$?',
    options: [
      'Because each wave cycle spans one wavelength $\\lambda$ and occurs $f$ times per second, so wave crests travel at distance per cycle times cycles per second',
      'Because wave amplitude forces spatial wavelength to compress into velocity',
      'Because wave energy converts directly into physical particle displacement velocity',
      'Because photons slow down when wave crests expand in spatial dimensions'
    ],
    correctIndex: 0,
    explanation: 'Phase velocity is the speed at which individual wave crests (points of constant phase) propagate through space. Since one complete wave cycle covers a spatial distance of one wavelength ($\\lambda$) and cycles repeat with frequency ($f$), crests advance at rate $v = \\lambda f$.',
    suggestedQuestions: [
      'How does phase velocity differ from group velocity in a dispersive medium?',
      'Why does wave frequency remain constant while wavelength changes when entering a new medium?',
      'How does wave phase velocity connect to the refractive index $n = c/v$?'
    ],
  },
  'Refractive index': {
    topic: 'Physics',
    subtopic: 'Refractive index',
    angle: 'Micro → macro — how lower-level behavior produces emergence',
    angleFit: 'Explains optical density through phase velocity reduction in atomic media.',
    questionText: 'Why is the refractive index $n$ defined as the ratio of the vacuum speed of light to phase velocity in a medium ($n = c/v$)?',
    options: [
      'Because light waves bounce between stationary electrons without continuing forward',
      'Because atomic polarization in the medium produces a secondary wave that interferes with the incident wave, retarding the overall phase velocity',
      'Because dense materials absorb light and re-emit it at fundamentally lower frequencies',
      'Because gravity inside solid glass pulls photons toward atomic nuclei'
    ],
    correctIndex: 1,
    explanation: 'The refractive index $n = \\frac{c}{v}$ quantifies optical density. When light travels through a medium, its electromagnetic field oscillates bound atomic electrons, generating delayed secondary wavelets whose superposition propagates at a lower phase velocity $v < c$.',
    suggestedQuestions: [
      'How does atomic polarizability determine the value of the refractive index?',
      'Why is the refractive index of vacuum exactly 1?',
      'How does Snell\'s law follow from differing refractive indices?'
    ],
  },
  'Moment of inertia': {
    topic: 'Physics',
    subtopic: 'Moment of inertia',
    angle: 'First principles — explain from fundamental rules',
    angleFit: 'Demonstrates why rotational inertia depends on mass distance squared.',
    questionText: 'Why does mass located farther from the axis of rotation contribute disproportionately more to an object\'s moment of inertia ($I = \\sum m_i r_i^2$)?',
    options: [
      'Because linear tangential velocity scales with radius ($v = \\omega r$), so kinetic energy and required accelerating torque scale quadratically with radius',
      'Because gravity exerts stronger force on mass at greater distances from the rotation center',
      'Because centrifugal force pushes outer mass into higher energy states',
      'Because angular velocity decreases when mass moves away from the rotation axis'
    ],
    correctIndex: 0,
    explanation: 'At a given angular velocity $\\omega$, mass located at radius $r$ has tangential speed $v = \\omega r$. Its kinetic energy is $\\frac{1}{2} m v^2 = \\frac{1}{2} m r^2 \\omega^2$. Because both tangential velocity and the torque lever arm scale with $r$, rotational inertia scales with $r^2$.',
    suggestedQuestions: [
      'How does the parallel axis theorem relate moment of inertia through the center of mass to other axes?',
      'Why do hollow cylinders have greater moment of inertia than solid cylinders of equal mass?'
    ],
  },
  'Derivative': {
    topic: 'Mathematics & Logic',
    subtopic: 'Derivative',
    angle: 'First principles — explain from fundamental rules',
    angleFit: 'Traces the transition from average rate of change to instantaneous slope.',
    questionText: 'Why is the derivative of a function at a point defined as the limit of the difference quotient as $h \\to 0$?',
    options: [
      'Because the difference quotient $\\frac{f(x+h)-f(x)}{h}$ measures average secant slope, and taking the limit $h \\to 0$ isolates the instantaneous tangent slope',
      'Because division by zero is strictly required to evaluate rate of change in continuous spaces',
      'Because the difference quotient cancels out all variable coefficients algebraically',
      'Because tangents are only well-defined when the interval $h$ has negative curvature'
    ],
    correctIndex: 0,
    explanation: 'The difference quotient $\\frac{f(x+h) - f(x)}{h}$ computes the slope of the secant line between $(x, f(x))$ and $(x+h, f(x+h))$. Taking the limit as $h \\to 0$ causes the two points to coalesce, yielding the exact instantaneous slope of the tangent line to the curve at $x$.',
    suggestedQuestions: [
      'What is the geometric difference between a secant line and a tangent line?',
      'Why must the limit from both left and right agree for a function to be differentiable?'
    ],
  },
  'Euler\'s number': {
    topic: 'Mathematics & Logic',
    subtopic: 'Euler\'s number',
    angle: 'First principles — explain from fundamental rules',
    angleFit: 'Explains e through continuous compound growth.',
    questionText: 'Why does Euler\'s number $e \\approx 2.718$ emerge as the natural base for continuous exponential growth?',
    options: [
      'Because it represents the maximum possible prime number in complex analysis',
      'Because as compounding frequency $n \\to \\infty$, the limit $\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n$ converges to $e$, producing an instantaneous rate of change equal to the value itself',
      'Because circle circumferences scale with natural logarithms at unity radius',
      'Because $e$ is the only rational base whose reciprocal integrates to zero'
    ],
    correctIndex: 1,
    explanation: 'Euler\'s number is defined by $\\lim_{n \\to \\infty} (1 + 1/n)^n = e$. In continuous growth, compounding occurs at every infinitesimal instant, uniquely causing the instantaneous rate of change of $e^x$ to equal $e^x$.',
    suggestedQuestions: [
      'How does compound interest illustrate the emergence of e?',
      'Why does the derivative of e^x equal e^x?'
    ],
  },
};

function getDemoConceptQuestion(
  concept: Concept,
  complexity: ReasoningComplexity,
  fallbackTopic: string,
  recentQuestions: string[] = []
): Question {
  const topic = getPrimaryTopic(concept.topics, fallbackTopic);

  const name = concept.canonicalName;
  const def = concept.definition;
  const complexityInfo = REASONING_COMPLEXITY_INFO[complexity];

  // If a curated question exists for this concept, use it
  const curated = SAMPLE_CONCEPT_QUESTIONS[name];
  if (curated && (!curated.questionText || !recentQuestions.includes(curated.questionText))) {
    return {
      topic,
      subtopic: curated.subtopic || name,
      concept: name,
      reasoningComplexity: complexity,
      angle: curated.angle || `${complexityInfo.name} — ${complexityInfo.description}`,
      angleFit:
        curated.angleFit ||
        `Directly evaluates ${complexityInfo.name.toLowerCase()} for the concept "${name}".`,
      questionText: curated.questionText || '',
      options: curated.options || [],
      correctIndex: curated.correctIndex ?? 0,
      explanation: curated.explanation || '',
      suggestedQuestions: curated.suggestedQuestions || [],
      requiredConcepts: [name, ...(concept.prerequisites || [])],
    };
  }

  const complexitiesToTry = [
    complexity,
    ...REASONING_COMPLEXITIES.filter((c) => c !== complexity),
  ];

  let selectedComplexity = complexity;
  let questionText = '';
  let correctOpt = '';

  for (const comp of complexitiesToTry) {
    const info = REASONING_COMPLEXITY_INFO[comp];
    let q = `Why is ${name} fundamental in ${topic} when applying ${info.name.toLowerCase()}?`;
    let ans = `Because ${def.charAt(0).toLowerCase() + def.slice(1)}`;

    if (comp === 'directInference') {
      q = `Why does knowing ${name} directly determine the physical/mathematical consequences in ${topic}?`;
      ans = `Because by definition, ${def.charAt(0).toLowerCase() + def.slice(1)}`;
    } else if (comp === 'counterfactual') {
      q = `Why would our understanding of ${topic} break down if ${name} did not hold?`;
      ans = `Because ${name} establishes that ${def.charAt(0).toLowerCase() + def.slice(1)}, without which consistency fails`;
    } else if (comp === 'transfer') {
      q = `Why can the principle of ${name} be transferred and applied to unfamiliar contexts in ${topic}?`;
      ans = `Because the underlying mechanism (${def.charAt(0).toLowerCase() + def.slice(1)}) generalizes across analogous physical/mathematical systems`;
    } else if (comp === 'composition') {
      q = `Why must ${name} be combined with its prerequisite principles to complete a valid reasoning chain?`;
      ans = `Because ${name} (${def.charAt(0).toLowerCase() + def.slice(1)}) operates in direct conjunction with its foundational prerequisites`;
    } else if (comp === 'discrimination') {
      q = `Why does ${name} distinguish the correct physical/mathematical explanation from competing misconceptions?`;
      ans = `Because ${name} uniquely requires that ${def.charAt(0).toLowerCase() + def.slice(1)}`;
    } else if (comp === 'synthesis') {
      q = `Why does synthesizing ${name} with surrounding laws explain complex phenomena?`;
      ans = `Because ${name} provides the necessary bridge showing that ${def.charAt(0).toLowerCase() + def.slice(1)}`;
    } else if (comp === 'derivation') {
      q = `Why can ${name} be reconstructed directly from deeper first principles?`;
      ans = `Because the fact that ${def.charAt(0).toLowerCase() + def.slice(1)} is a deductive necessity of baseline axioms`;
    }

    if (!recentQuestions.includes(q)) {
      selectedComplexity = comp;
      questionText = q;
      correctOpt = ans;
      break;
    }
  }

  if (!questionText) {
    selectedComplexity = complexity;
    questionText = `Why does ${name} serve as a core conceptual pillar in ${topic}?`;
    correctOpt = `Because ${def.charAt(0).toLowerCase() + def.slice(1)}`;
  }

  const finalComplexityInfo = REASONING_COMPLEXITY_INFO[selectedComplexity];

  const options = [
    `Because ${name} completely cancels out all external field effects unconditionally`,
    correctOpt,
    `Because ${name} only applies to static systems at absolute zero`,
    `Because ${name} relies on classical friction rather than fundamental conservation laws`,
  ];

  return {
    topic,
    subtopic: name,
    concept: name,
    reasoningComplexity: selectedComplexity,
    angle: `${finalComplexityInfo.name} — ${finalComplexityInfo.description}`,
    angleFit: `Directly evaluates ${finalComplexityInfo.name.toLowerCase()} for the concept "${name}".`,
    questionText,
    options,
    correctIndex: 1,
    explanation: `**${name}**: ${def}\n\n*Reasoning Complexity (${finalComplexityInfo.name})*: ${finalComplexityInfo.description}\n\nThe correct conclusion follows from this principle: "${correctOpt}".`,
    suggestedQuestions: [
      `How does ${name} depend on its prerequisite concepts?`,
      `Under what conditions does ${name} provide the primary constraint?`,
      `How does ${finalComplexityInfo.name.toLowerCase()} deepen understanding of ${name}?`,
    ],
    requiredConcepts: [name, ...(concept.prerequisites || [])],
  };
}

async function generateSingleQuestionRaw(
  settings: UserSettings,
  chosenTopic: string,
  isDemoUser: boolean = false,
  recentQuestions: string[] = [],
  userId: string = 'anonymous',
  wrongQuestionContext?: WrongQuestionContext,
  targetConcept?: Concept,
  reasoningComplexity?: ReasoningComplexity,
  isBoss?: boolean
): Promise<Question> {
  const topics = [...TOPICS];

  // Demo user fallback: only Explorer Demo mode can use canned questions
  if (!settings.apiKey || !settings.apiKey.trim()) {
    if (isDemoUser) {
      if (wrongQuestionContext) {
        const matchingKey = Object.keys(SAMPLE_QUESTIONS).find(
          (k) => k.toLowerCase() === chosenTopic.toLowerCase()
        ) || 'Physics';
        const list = SAMPLE_QUESTIONS[matchingKey] || SAMPLE_QUESTIONS['Physics'];
        const pool = list.filter((q) => q.questionText !== wrongQuestionContext.questionText);
        const available = pool.length > 0 ? pool : list;

        const explanationWords = wrongQuestionContext.explanation
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3);

        let bestMatch = available[0];
        let maxScore = -1;

        for (const candidate of available) {
          const candidateContent = `${candidate.questionText} ${candidate.explanation}`.toLowerCase();
          let score = 0;
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

      if (targetConcept && reasoningComplexity) {
        return getDemoConceptQuestion(targetConcept, reasoningComplexity, chosenTopic, recentQuestions);
      }

      const matchingKey = Object.keys(SAMPLE_QUESTIONS).find(
        (k) =>
          k.toLowerCase() === chosenTopic.toLowerCase() ||
          (k === 'Mathematics & Logic' &&
            (chosenTopic.toLowerCase().includes('math') ||
              chosenTopic.toLowerCase().includes('logic') ||
              chosenTopic.toLowerCase().includes('calc') ||
              chosenTopic.toLowerCase().includes('algeb'))) ||
          (k === 'Life' &&
            (chosenTopic.toLowerCase().includes('life') || chosenTopic.toLowerCase().includes('bio'))) ||
          (k === 'Earth & Space' &&
            (chosenTopic.toLowerCase().includes('earth') ||
              chosenTopic.toLowerCase().includes('space') ||
              chosenTopic.toLowerCase().includes('astro') ||
              chosenTopic.toLowerCase().includes('planet'))) ||
          (k === 'Mind & Behavior' &&
            (chosenTopic.toLowerCase().includes('mind') ||
              chosenTopic.toLowerCase().includes('behavior') ||
              chosenTopic.toLowerCase().includes('psych') ||
              chosenTopic.toLowerCase().includes('cognit'))) ||
          (k === 'Society & History' &&
            (chosenTopic.toLowerCase().includes('histor') ||
              chosenTopic.toLowerCase().includes('societ') ||
              chosenTopic.toLowerCase().includes('warhammer') ||
              chosenTopic.toLowerCase().includes('heresy') ||
              chosenTopic.toLowerCase().includes('politi'))) ||
          (k === 'Computer Science' &&
            (chosenTopic.toLowerCase().includes('computer') || chosenTopic.toLowerCase() === 'cs'))
      );
      const list = (matchingKey ? SAMPLE_QUESTIONS[matchingKey] : null) || SAMPLE_QUESTIONS['Physics'] || Object.values(SAMPLE_QUESTIONS)[0];

      const unseen = list.filter((q) => !recentQuestions.includes(q.questionText));
      const pool = unseen.length > 0 ? unseen : list.filter((q) => recentQuestions[0] !== q.questionText);
      const candidates = pool.length > 0 ? pool : list;
      const sample = candidates[Math.floor(Math.random() * candidates.length)];
      return {
        ...sample,
        topic: chosenTopic,
        isBossQuestion: !!isBoss,
      };
    }

    throw new Error(
      `Please configure your ${settings.provider.toUpperCase()} API Key in Settings to generate questions with ${settings.model}.`
    );
  }

  const apiKey = settings.apiKey.trim();
  const model = settings.model;
  const subtopics = await getOrGenerateSubtopics(settings, chosenTopic, userId, isDemoUser);

  switch (settings.provider) {
    case 'gemini':
      return await generateGeminiQuestion(
        model,
        apiKey,
        topics,
        chosenTopic,
        recentQuestions,
        subtopics,
        wrongQuestionContext,
        targetConcept,
        reasoningComplexity,
        isBoss
      );
    case 'openai':
      return await generateOpenAIQuestion(
        model,
        apiKey,
        topics,
        chosenTopic,
        recentQuestions,
        subtopics,
        wrongQuestionContext,
        targetConcept,
        reasoningComplexity,
        isBoss
      );
    case 'anthropic':
      return await generateAnthropicQuestion(
        model,
        apiKey,
        topics,
        chosenTopic,
        recentQuestions,
        subtopics,
        wrongQuestionContext,
        targetConcept,
        reasoningComplexity,
        isBoss
      );
    default:
      throw new Error(`Unsupported LLM provider: ${settings.provider}`);
  }
}

export async function generateWhyQuestion(
  settings: UserSettings,
  specificTopic?: string,
  isDemoUser: boolean = false,
  recentQuestions: string[] = [],
  userId: string = 'anonymous',
  wrongQuestionContext?: WrongQuestionContext
): Promise<Question> {
  const topics = [...TOPICS];
  const chosenTopic =
    specificTopic ||
    (wrongQuestionContext ? wrongQuestionContext.topic : topics[Math.floor(Math.random() * topics.length)]) ||
    'Physics';

  // 1. Attention Check Reinforcement question
  if (wrongQuestionContext) {
    return await generateSingleQuestionRaw(
      settings,
      chosenTopic,
      isDemoUser,
      recentQuestions,
      userId,
      wrongQuestionContext
    );
  }

  // 2. Concept Registry & DAG flow from next-steps.md
  let registry: Concept[] = [];
  try {
    registry = await getUserConcepts(userId);
  } catch (e) {
    console.warn('Could not load user concepts:', e);
  }

  const eligible = getEligibleConcepts(registry, chosenTopic);

  // If there are no concepts or all concepts are mastered (or none currently eligible) -> generate Boss Question
  const needsBoss = isAllConceptsMasteredOrEmpty(registry) || eligible.length === 0;

  // Helper to generate and verify a concept question whose prerequisites are all proficient
  const askVerifiedConceptQuestion = async (): Promise<Question | null> => {
    const MAX_CONCEPT_ATTEMPTS = 3;
    let activeRegistry = await getUserConcepts(userId);

    for (let attempt = 0; attempt < MAX_CONCEPT_ATTEMPTS; attempt++) {
      const eligibleConcepts = getEligibleConcepts(activeRegistry, chosenTopic);
      const nonAtomicEligible = eligibleConcepts.filter((c) => !c.isAtomic);
      const selected =
        selectConceptForQuestion(activeRegistry, chosenTopic) || nonAtomicEligible[0];

      if (!selected || selected.isAtomic) {
        return null;
      }

      const complexity = selectReasoningComplexity(
        selected.reasoningTrack,
        selected.mastery
      );

      const candidate = await generateSingleQuestionRaw(
        settings,
        chosenTopic,
        isDemoUser,
        recentQuestions,
        userId,
        undefined,
        selected,
        complexity,
        false
      );

      // Concept questions also have prerequisites! Check that all prerequisites are proficient.
      const qResult = await buildQuestionDAG(
        candidate,
        activeRegistry,
        settings,
        isDemoUser,
        selected
      );

      if (qResult.newConcepts.length > 0) {
        await saveUserConcepts(userId, qResult.newConcepts);
        activeRegistry = await getUserConcepts(userId);
      }

      candidate.requiredConcepts = qResult.directPrerequisites;

      if (qResult.allPrerequisitesProficient) {
        return candidate;
      }
    }

    // Fallback if live LLM repeatedly generated questions with unmastered concepts:
    // Ground strictly in an eligible concept's definition and its already-proficient prerequisites
    const fallbackEligible = getEligibleConcepts(activeRegistry, chosenTopic).filter(
      (c) => !c.isAtomic
    );
    const fallbackConcept =
      selectConceptForQuestion(activeRegistry, chosenTopic) || fallbackEligible[0];
    if (fallbackConcept) {
      const complexity = selectReasoningComplexity(
        fallbackConcept.reasoningTrack,
        fallbackConcept.mastery
      );
      const fallbackQ = getDemoConceptQuestion(
        fallbackConcept,
        complexity,
        chosenTopic,
        recentQuestions
      );
      fallbackQ.requiredConcepts = [
        fallbackConcept.canonicalName,
        ...(fallbackConcept.prerequisites || []),
      ];
      return fallbackQ;
    }

    return null;
  };

  if (needsBoss) {
    // Generate Boss Question
    const bossQuestion = await generateSingleQuestionRaw(
      settings,
      chosenTopic,
      isDemoUser,
      recentQuestions,
      userId,
      undefined,
      undefined,
      undefined,
      true
    );

    // Build dependencies for that question following the algorithm
    const { newConcepts, directPrerequisites, allPrerequisitesProficient } =
      await buildQuestionDAG(bossQuestion, registry, settings, isDemoUser);

    if (newConcepts.length > 0) {
      await saveUserConcepts(userId, newConcepts);
    }

    bossQuestion.requiredConcepts = directPrerequisites;

    // "If when we generate a Boss question all prerequisites are proficient - just ask the Boss question to the user."
    if (allPrerequisitesProficient) {
      return bossQuestion;
    }

    // When this is done - generate a question based on Concept, ensuring all its prerequisites are proficient
    const conceptQ = await askVerifiedConceptQuestion();
    if (conceptQ) {
      return conceptQ;
    }

    return bossQuestion;
  }

  // A new question based on a specially selected Concept for which user is at least proficient for all prerequisites
  const conceptQ = await askVerifiedConceptQuestion();
  if (conceptQ) {
    return conceptQ;
  }

  return await generateSingleQuestionRaw(
    settings,
    chosenTopic,
    isDemoUser,
    recentQuestions,
    userId,
    undefined,
    undefined,
    undefined,
    true
  );
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
