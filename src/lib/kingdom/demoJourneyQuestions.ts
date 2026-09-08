import type { Question } from '../../types';
import { createDefaultReasoningTrack } from '../concepts/mastery';
import { saveUserConcepts } from '../../services/database';
import { demoGeneration, demoJourney } from './demoLearning';
import { FACETS, nodeAvailable, type JourneyTarget, type Facet } from '../../../supabase/functions/_shared/journey';

type Lesson = [string, string, string, string, string, string];
// Two independently worded situations per dimension. Correct options are shuffled.
const life: Record<string, Partial<Record<Facet, Lesson>>> = {
  'food-fuel': {
    intuition: ['You have not eaten since breakfast, but your body is still working. What does food normally provide that helps it do work?', 'A child says food only fills the stomach. Which explanation adds an important missing role?', 'Food supplies energy and building materials for the body.', 'Food makes the body create energy from nothing.', 'Food supplies energy only while you are chewing.', 'Food replaces the need for air.'],
    mechanism: ['Your muscles use energy while you walk. How can a sandwich help supply it?', 'Your body repairs a small scratch while you sleep. How can energy from an earlier meal help?', 'Cells can transfer chemical energy from food into processes they perform.', 'The food must physically push the muscles or skin.', 'Energy can only be used in the stomach.', 'Food turns into energy without any material remaining.'],
    boundaries: ['Imagine a body could no longer get energy from either food or its stores. What would eventually happen?', 'If a body had no accessible fuel left, could it keep growing and moving indefinitely?', 'Energy-requiring processes could not continue indefinitely.', 'Its cells would create unlimited energy on demand.', 'Only hunger would change; cells would work normally forever.', 'It would need less energy simply because less was available.'],
    application: ['A seed grows in darkness before its leaves appear. Where can the energy for early growth come from?', 'An animal is active between meals. Which source can help power its activity?', 'Chemical energy in stored materials can support activity.', 'Darkness itself supplies the missing energy.', 'Living things do not need an energy source between meals.', 'Movement creates all of the energy needed to keep moving.'],
  },
  cells: {
    intuition: ['A tiny piece of skin is viewed under a microscope. What living building blocks would you expect to find?', 'A body has many small living units, each enclosed by a boundary. What are these units called?', 'Cells: small living units that make up the body.', 'Entire miniature people inside the skin.', 'Empty spaces with no materials inside.', 'Only food particles waiting to be digested.'],
    mechanism: ['Why does a cell need to exchange materials with its surroundings?', 'A cell has a boundary. Why must that boundary still allow some materials to pass?', 'Cells need supplies and must release some waste products.', 'A cell can make all necessary matter from nothing.', 'Cell boundaries have no role in controlling exchange.', 'Every substance must pass through at exactly the same rate.'],
    application: ['Skin cells and muscle cells do different jobs. What can still be true of both?', 'Two cells in a body look different under a microscope. What is the best conclusion?', 'Cells can share basic needs while having different specialized jobs.', 'Every cell must look identical to be alive.', 'Only cells that move can need energy.', 'A different appearance means one cannot be a cell.'],
    evidence: ['Which observation would directly support the claim that skin contains many small units?', 'How could someone check whether a thin piece of plant tissue is divided into small units?', 'Examine a suitably prepared sample under a microscope.', 'Judge its internal structure only from its color.', 'Assume every smooth surface has no internal divisions.', 'Count how many large leaves the whole plant has.'],
  },
  stores: {
    intuition: ['Why can a body still obtain fuel several hours after a meal?', 'What is one advantage of storing some fuel after eating?', 'Stored fuel can be released when food is not arriving.', 'Stored fuel creates more energy every time it is used.', 'Cells stop needing energy between meals.', 'The stomach must contain a fresh meal at every moment.'],
    mechanism: ['More fuel enters a store than leaves it. What happens to the amount stored?', 'A tank receives 8 units of fuel while 3 units leave. What describes the change in its store?', 'The store grows because inflow exceeds outflow.', 'The store shrinks because some fuel leaves.', 'The store stays fixed regardless of the flows.', 'The store grows only if absolutely nothing leaves.'],
    precision: ['A fuel store starts with 10 units. Then 4 enter and 6 leave. How many remain?', 'A store starts with 12 units. It receives 3 units and supplies 7. What remains?', '8 units.', '20 units.', '0 units.', 'The starting amount, unchanged.'],
    boundaries: ['A store has no incoming fuel, but keeps supplying fuel. What must happen to its contents?', 'A reserve is being used and never replenished. Could a finite reserve support the same use forever?', 'The reserve decreases and cannot supply fuel indefinitely.', 'The reserve grows because it is being useful.', 'The reserve creates replacement fuel automatically.', 'A finite store becomes unlimited once inflow stops.'],
  },
  feedback: {
    intuition: ['A room gets too cold, so its heater switches on. What makes this an example of negative feedback?', 'A tank level falls, so a controller adds water. What pattern does this illustrate?', 'A response opposes the original change.', 'A response always makes the original change larger.', 'The system acts without responding to conditions.', 'The word negative means the response is harmful.'],
    mechanism: ['A heater runs when the room is cold and stops when it is warm enough. Why does checking temperature matter?', 'A fuel controller changes its response as the available fuel changes. Why does it need information about fuel level?', 'Information about the condition lets the response change when needed.', 'Measuring a condition creates all the energy the system uses.', 'A fixed response would always match every possible condition.', 'Once a response starts, it should continue forever.'],
    alternatives: ['If a room got colder and its controller reduced heating, would that oppose the cooling?', 'A tank level falls and a controller drains even more water. How does that differ from restoring the level?', 'The response reinforces the change instead of opposing it.', 'Any automatic response must restore the original condition.', 'Feedback can never make a change larger.', 'The response must be stabilizing because a controller caused it.'],
    evidence: ['How could you test whether a controller responds to a falling level?', 'How could you distinguish a temperature-controlled heater from one that runs on a fixed timer?', 'Change the relevant condition and measure whether the response changes.', 'Look once while the condition stays unchanged.', 'Assume that having a sensor guarantees that it controls the response.', 'Check the controller’s color instead of its behavior.'],
  },
  boss: { mechanism: ['How does your body keep its cells supplied with fuel between meals?', 'A person eats, then goes several hours without another meal. Which explanation connects cells, fuel stores, and feedback?', 'Stores release fuel for cells, with feedback helping coordinate supply as conditions change.', 'Cells stop using energy as soon as the stomach becomes empty.', 'Feedback creates energy from nothing, so stores are unnecessary.', 'A store releases the same amount forever regardless of its contents or the body’s conditions.'] },
};

export async function generateDemoJourneyQuestion(userId: string, topic: string, target: JourneyTarget): Promise<Question> {
  const journey = demoJourney(userId, topic);
  const node = journey.plan.nodes.find(n => n.id === target.nodeId);
  if (journey.id !== target.journeyId || !node || !nodeAvailable(node, journey.progress) || !node.facets.includes(target.facet)) throw new Error('Choose a revealed concept on your map.');
  const attempts = journey.progress[node.id]?.[target.facet]?.attempts ?? 0;
  const sample = topic === 'Life' ? life[node.id]?.[target.facet] : undefined;
  // Other demo topics offer short scripted concept checks. Live questions use
  // individually generated situations, misconception feedback and transfer checks.
  const lesson: Lesson = sample ?? [
    node.kind === 'boss' ? node.title : `Which statement best explains “${node.title}”?`,
    `Someone is exploring “${node.title}”. Which explanation would stand up to a careful check?`,
    node.definition,
    'A pattern that holds in one example must hold in every possible situation.',
    'The outcome is independent of all conditions, so checking conditions cannot help.',
    'Only what can be seen directly without any tools or reasoning can be real.',
  ];
  const rawOptions = lesson.slice(2);
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const explanation = `${lesson[2]} ${node.definition}`;
  await saveUserConcepts(userId, [{ canonicalName: node.title, definition: node.definition, aliases: [], topics: { [topic]: 1 },
    prerequisites: node.requires.map(r => journey.plan.nodes.find(n => n.id === r.nodeId)!.title), mastery: 'unseen', reasoningTrack: createDefaultReasoningTrack(), isAtomic: false }]);
  return {
    id: crypto.randomUUID(), topic, topicWeights: { [topic]: 1 }, concept: node.title,
    journeyId: journey.id, journeyNodeId: node.id, journeyFacet: target.facet,
    questionText: lesson[attempts % 2], options: order.map(i => rawOptions[i]), correctIndex: order.indexOf(0),
    explanation, knowledgeEntry: node.id === 'stores' && target.facet === 'precision' ? 'Final store = starting amount + inflow − outflow, with all amounts measured in the same units.' : sample ? lesson[2] : node.definition,
    optionFeedback: order.map(i => i === 0 ? 'That explanation fits the relationship being tested.' : `Consider what this choice assumes. ${lesson[2]}`),
    angle: FACETS[target.facet].label, isBossQuestion: node.kind === 'boss', prerequisitesMet: true,
    requiredConcepts: node.requires.map(r => journey.plan.nodes.find(n => n.id === r.nodeId)!.title),
    reasoningComplexity: node.kind === 'boss' ? 'synthesis' : target.facet === 'intuition' ? 'directInference' : target.facet === 'mechanism' ? 'composition' : target.facet === 'application' ? 'transfer' : 'discrimination',
    suggestedQuestions: [`Can you give another example of ${node.title.toLowerCase()}?`, 'What is a common misconception about this idea?'], demoGeneration: demoGeneration(userId),
  };
}
