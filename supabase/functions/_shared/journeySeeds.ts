import { FACET_ORDER, type JourneyPlan, type JourneyNode, type Facet } from './journey.ts';

// Finite demo examples. Live bosses reuse and extend the learner's graph.
type Seed = [string, string, string, Facet[]?];
const subjects: Record<string, { title: string; boss: string; answer: string; seeds: Seed[] }> = {
  Life: {
    title: 'The living world', boss: 'How does your body keep its cells supplied with fuel between meals?',
    answer: 'Food supplies fuel, cells use energy, and stored fuel can be released. Feedback coordinates storage and release as available fuel changes. This introductory model leaves the detailed signals for later exploration.',
    seeds: [
      ['food-fuel', 'Food as fuel', 'Food contains chemical energy. Cells transfer some of that energy to processes such as movement, growth, and repair; food also supplies building materials.', ['intuition', 'mechanism', 'boundaries', 'application']],
      ['cells', 'Cells: living building blocks', 'A cell is a small unit of life enclosed by a membrane. Human bodies contain many cells that exchange materials with their surroundings and perform different jobs.', ['intuition', 'mechanism', 'application', 'evidence']],
      ['stores', 'Saving fuel for later', 'The body stores some fuel after eating and releases stored fuel between meals. A store grows when more enters than leaves and shrinks when more leaves than enters.', ['intuition', 'mechanism', 'precision', 'boundaries']],
      ['feedback', 'Keeping conditions steady', 'Negative feedback means a change triggers a response that opposes that change. In bodies, cells respond to information about changing conditions. Regulation keeps conditions within a range, not perfectly constant.', ['intuition', 'mechanism', 'alternatives', 'evidence']],
    ],
  },
  Physics: {
    title: 'Making sense of motion', boss: 'Why does a bicycle slow down when you stop pedaling, while an object in empty space can keep moving?',
    answer: 'A change in motion requires a net force. Pedaling can balance resistance; when pedaling stops, resistance slows a bicycle. Without a net external force, velocity stays constant.',
    seeds: [
      ['motion', 'Describing motion', 'Speed describes how far an object travels per unit time. Direction also matters when describing velocity. Motion is described relative to a reference point.', ['intuition', 'mechanism', 'precision', 'application']],
      ['pushes', 'Pushes and pulls', 'A force is a push or pull from an interaction. Forces can change motion or deform objects. Multiple forces can balance.', ['intuition', 'mechanism', 'application', 'evidence']],
      ['inertia', 'Continuing in motion', 'With no net external force, an object keeps a constant velocity. A force is needed to change motion, not to maintain a constant velocity.', ['intuition', 'mechanism', 'boundaries', 'evidence']],
      ['resistance', 'What slows things down', 'Friction and drag oppose relative motion. They transfer energy from organized motion into other forms, including thermal energy.', ['intuition', 'mechanism', 'application', 'alternatives']],
    ],
  },
  'Mathematics & Logic': {
    title: 'Patterns you can trust', boss: 'How can a single counterexample overturn a rule that worked in a hundred examples?',
    answer: 'A universal claim applies to every member of its stated domain. One valid counterexample contradicts it. Many agreeing examples provide evidence but do not by themselves prove the claim for all cases.',
    seeds: [
      ['claims', 'Claims and truth', 'A mathematical statement makes a claim that can be true or false in a specified setting. A question or instruction is not itself such a claim.'],
      ['examples', 'Examples and patterns', 'Examples can suggest a pattern. A pattern observed in a few cases may or may not continue in other cases.'],
      ['all', 'What “every” means', 'A universal claim says a property holds for every member of a specified set. A single member without that property makes the universal claim false.', ['intuition', 'mechanism', 'precision', 'boundaries']],
      ['proof', 'Evidence and proof', 'A mathematical proof establishes a claim from stated assumptions using valid reasoning. Checking several examples is not generally a proof of a universal claim.', ['intuition', 'mechanism', 'evidence', 'alternatives']],
    ],
  },
  Chemistry: {
    title: 'Matter in everyday life', boss: 'Why can a puddle disappear while its water still exists?',
    answer: 'Matter consists of particles. Liquid water can evaporate as particles escape into the air and disperse. In a closed system, the total mass remains, even when the liquid becomes invisible vapor.',
    seeds: [
      ['matter', 'What matter is', 'Matter has mass and occupies space. Air is matter even though it is usually invisible.'],
      ['particles', 'A world of tiny particles', 'Ordinary matter consists of atoms or groups of atoms. These particles are too small to see individually with the unaided eye.'],
      ['states', 'Solid, liquid, and gas', 'In a gas, particles are much farther apart and move freely compared with a liquid. Evaporation changes water from liquid to gas without changing its molecular identity.', ['intuition', 'mechanism', 'boundaries', 'application']],
      ['conservation', 'Tracking matter', 'Mass is conserved in ordinary physical changes in a closed system. In an open container, matter can leave and enter, changing the mass inside.', ['intuition', 'mechanism', 'precision', 'evidence']],
    ],
  },
  'Computer Science': {
    title: 'From instructions to solutions', boss: 'How can a computer follow every instruction correctly and still give the wrong result?',
    answer: 'A program implements instructions on represented inputs. Incorrect assumptions, instructions, or inputs can produce an unwanted result even when the machine executes the program faithfully. Testing checks behavior against expectations.',
    seeds: [
      ['instructions', 'Step-by-step instructions', 'An algorithm is a sequence of clearly specified steps for solving a problem. An ambiguous everyday instruction needs clarification before a machine can execute it reliably.'],
      ['data', 'Representing information', 'Computers operate on representations of information. A stored number or symbol gets its meaning from the rules used to interpret it.'],
      ['conditions', 'Decisions in a program', 'A conditional instruction selects an action based on whether a specified condition holds. Its behavior depends on the exact condition and input.', ['intuition', 'mechanism', 'boundaries', 'precision']],
      ['testing', 'Checking a solution', 'Testing compares a program’s actual output with expected behavior for chosen inputs. A passing example does not establish correctness for every possible input.', ['intuition', 'mechanism', 'evidence', 'application']],
    ],
  },
  'Earth & Space': {
    title: 'Our changing sky', boss: 'Why can it be daytime where you live and nighttime somewhere else on Earth?',
    answer: 'The Sun illuminates the side of Earth facing it. Earth rotates, carrying locations into and out of that illuminated region. Different longitudes face the Sun at different times.',
    seeds: [
      ['light', 'Light and shadows', 'Light travels from a source. An opaque object blocks direct light, creating a shadow behind it.'],
      ['earth', 'Earth as a globe', 'Earth is approximately spherical. Places on different sides of a globe face different directions relative to a distant light source.'],
      ['rotation', 'A turning Earth', 'Earth rotates about its axis roughly once per day. A location moves with Earth as the planet turns.', ['intuition', 'mechanism', 'precision', 'application']],
      ['daylight', 'The sunlit side', 'About half of Earth faces the Sun at a time. Rotation carries most places between illuminated and dark regions; polar regions have seasonal exceptions.', ['intuition', 'mechanism', 'boundaries', 'evidence']],
    ],
  },
  'Mind & Behavior': {
    title: 'How we learn about the mind', boss: 'Why does remembering something vividly not guarantee that it happened exactly that way?',
    answer: 'Attention selects part of an experience. Memory stores and reconstructs information rather than replaying a perfect recording. Independent evidence can support or challenge a confident recollection.',
    seeds: [
      ['attention', 'What we notice', 'Attention prioritizes some information over other information. People may miss details even when those details are in view.'],
      ['memory', 'Remembering an experience', 'Memory involves taking in, keeping, and retrieving information. It is not a perfect recording of every detail.'],
      ['reconstruction', 'Putting memories together', 'Remembering can combine stored information with current knowledge and expectations. This can help interpretation but can also introduce errors.', ['intuition', 'mechanism', 'alternatives', 'application']],
      ['checking', 'Checking a recollection', 'Confidence and accuracy are different. Independent records and carefully designed comparisons can help test whether a remembered detail is accurate.', ['intuition', 'mechanism', 'evidence', 'application']],
    ],
  },
  'Society & History': {
    title: 'Piecing together the past', boss: 'How can historians investigate an event when eyewitnesses disagree?',
    answer: 'Sources preserve partial perspectives. Historians compare independent sources, context, and material evidence, assessing which claims are supported and which remain uncertain.',
    seeds: [
      ['sources', 'Traces of the past', 'A historical source is evidence from or about the past, such as an object, letter, record, or later account. Sources can support particular claims without answering every question.'],
      ['perspective', 'Different points of view', 'People observe events from different positions and interpret them through their knowledge and interests. Accounts may differ without every difference being an intentional lie.'],
      ['context', 'Putting a source in context', 'Who produced a source, when, for whom, and for what purpose affects how it can be interpreted. Context helps assess what a source can establish.', ['intuition', 'mechanism', 'application', 'alternatives']],
      ['corroboration', 'Comparing evidence', 'Agreement between independent sources can strengthen a claim. Accounts that copy a single source are not independent confirmations.', ['intuition', 'mechanism', 'evidence', 'boundaries']],
    ],
  },
};

export function starterJourney(topic: string): JourneyPlan {
  const subject = subjects[topic];
  if (!subject) throw new Error('Choose a supported topic.');
  // Dependencies reflect the subject, not a generic graph shape.
  const parents: Record<string, number[][]> = {
    Life: [[], [], [0, 1], [0, 1]],
    Physics: [[], [], [0, 1], [0, 1]],
    'Mathematics & Logic': [[], [], [0, 1], [0, 1, 2]],
    Chemistry: [[], [], [0, 1], [0, 1]],
    'Computer Science': [[], [], [0, 1], [0, 1, 2]],
    'Earth & Space': [[], [], [1], [0, 1, 2]],
    'Mind & Behavior': [[], [], [0, 1], [1, 2]],
    'Society & History': [[], [], [0, 1], [0, 1, 2]],
  };
  const dependency = (index: number) => ({ nodeId: subject.seeds[index][0], facets: [...FACET_ORDER] });
  const nodes: JourneyNode[] = subject.seeds.map(([id, title, definition], i) => ({
    id, topic, title, definition, facets: [...FACET_ORDER], kind: 'concept',
    requires: parents[topic][i].map(dependency),
    prerequisiteConcepts: parents[topic][i].map(index => subject.seeds[index][1]),
  }));
  nodes.push({ id: `boss-${topic.toLowerCase().replace(/[^a-z]+/g, '-')}`, topic, title: subject.boss, definition: subject.answer, kind: 'boss', facets: ['mechanism'],
    requires: [dependency(2), dependency(3)], prerequisiteConcepts: [nodes[2].title, nodes[3].title] });
  return { topic, nodes };
}
