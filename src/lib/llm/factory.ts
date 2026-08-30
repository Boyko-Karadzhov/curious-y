import { Question, ChatMessage, UserSettings, LLMProvider } from '../../types';
import { generateGeminiQuestion, chatWithGemini, testGeminiKey } from './gemini';
import { generateOpenAIQuestion, chatWithOpenAI, testOpenAIKey } from './openai';
import { generateAnthropicQuestion, chatWithAnthropic, testAnthropicKey } from './anthropic';

// Sample questions used EXCLUSIVELY in Explorer Demo mode when no LLM key is configured
const SAMPLE_QUESTIONS: Record<string, Question[]> = {
  Physics: [
    {
      topic: 'Physics',
      questionText: 'Why does light bend (refract) when entering a denser medium like water or glass?',
      options: [
        'Because the frequency of light decreases due to resistance in the medium',
        'Because the wave crests travel slower in the denser medium, causing the wavefront to pivot (Fermat\'s principle)',
        'Because photons collide with atoms and bounce at a fixed angle',
        'Because gravitational attraction from dense atoms pulls the light ray downward'
      ],
      correctIndex: 1,
      explanation: 'According to Fermat\'s principle of least time and Snell\'s Law ($n_1 \\sin \\theta_1 = n_2 \\sin \\theta_2$), light takes the path that minimizes travel time. In an optically denser medium, light propagates at a lower phase velocity $v = \\frac{c}{n}$. As one side of a wavefront hits the boundary and slows down before the other, the entire beam pivots towards the normal line.',
    },
    {
      topic: 'Physics',
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
  ],
  Calculus: [
    {
      topic: 'Calculus',
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
  ],
  Chemistry: [
    {
      topic: 'Chemistry',
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
  ],
  Algebra: [
    {
      topic: 'Algebra',
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
  ],
  History: [
    {
      topic: 'History',
      questionText: 'Why did the Library of Alexandria gradually decline rather than being destroyed in a single catastrophic fire?',
      options: [
        'Because Roman legions systematically transported all papyrus scrolls to Rome in 48 BCE',
        'Because centuries of budget cuts, imperial purges, changing rulers, and multiple smaller fires eroded its scholarly support',
        'Because the Nile flooded and washed away the entire royal quarter in 365 CE',
        'Because scholars voluntarily disbanded and moved to the House of Wisdom in Baghdad'
      ],
      correctIndex: 1,
      explanation: 'Contrary to popular myth of a single apocalypse, historians trace the library\'s decline across centuries: partial fires during Julius Caesar\'s civil war (48 BCE), expulsion of intellectuals under Ptolemy VIII, imperial budget cuts under Roman rule, Aurelian\'s siege (270s CE), and decree of Theodosius I (391 CE).',
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
  recentQuestions: string[] = []
): Promise<Question> {
  const topics = parseTopicsList(settings.topics);
  const chosenTopic = specificTopic || topics[Math.floor(Math.random() * topics.length)] || 'Physics';

  // Demo user fallback: only Explorer Demo mode can use canned questions
  if (!settings.apiKey || !settings.apiKey.trim()) {
    if (isDemoUser) {
      const list = SAMPLE_QUESTIONS[chosenTopic] || SAMPLE_QUESTIONS['Physics'];
      const sample = list[Math.floor(Math.random() * list.length)];
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

  switch (settings.provider) {
    case 'gemini':
      return await generateGeminiQuestion(model, apiKey, topics, chosenTopic, recentQuestions);
    case 'openai':
      return await generateOpenAIQuestion(model, apiKey, topics, chosenTopic, recentQuestions);
    case 'anthropic':
      return await generateAnthropicQuestion(model, apiKey, topics, chosenTopic, recentQuestions);
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
