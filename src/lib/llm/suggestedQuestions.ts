import { Question } from '../../types';

/**
 * Extracts key scientific, mathematical, or historical terms from a question and its context.
 */
function extractKeyTerms(question: Question): string[] {
  const terms: string[] = [];
  const textPool = `${question.questionText} ${question.explanation} ${question.subtopic || ''} ${question.options.join(' ')}`;

  // 1. Extract standard math notation ($...$ or $$...$$)
  const mathMatches = textPool.match(/\$\$?([^$]+)\$\$?/g);
  if (mathMatches) {
    for (const m of mathMatches) {
      const cleaned = m.trim();
      if (cleaned.length > 2 && !terms.includes(cleaned)) {
        terms.push(cleaned);
      }
    }
  }

  // 2. Extract parenthetical concepts or terms in quotes
  const quotedOrParenMatches = textPool.match(/["'“‘]([^"'“”]{3,40})["'”’]|\(([^)]{3,40})\)/g);
  if (quotedOrParenMatches) {
    for (const q of quotedOrParenMatches) {
      const cleaned = q.replace(/^["'“‘(]|["'”’)]$/g, '').trim();
      if (
        cleaned.length >= 3 &&
        cleaned.length <= 40 &&
        !cleaned.toLowerCase().startsWith('e.g') &&
        !cleaned.toLowerCase().startsWith('such as') &&
        !terms.includes(cleaned)
      ) {
        terms.push(cleaned);
      }
    }
  }

  // 3. Extract named laws, theorems, principles, effects, equations
  const namedPattern = /\b([A-Z][a-z]+(?:['’]s)?(?:\s+[A-Z][a-z]+)*(?:\s+(?:Law|Theorem|Principle|Effect|Rule|Dilemma|Paradox|Equation|Constant|Shift|Scattering|Forces?|Energy|Limit|Derivative|Transform|Model|Cycle|Entropy|Pressure|Reforms?)))/g;
  let namedMatch;
  while ((namedMatch = namedPattern.exec(textPool)) !== null) {
    const term = namedMatch[1].trim();
    if (!terms.some((t) => t.toLowerCase() === term.toLowerCase())) {
      terms.push(term);
    }
  }

  // 4. Extract common domain key phrases
  const domainPatterns = [
    /\b(moment of inertia|angular momentum|centripetal acceleration|refractive index|phase velocity|time dilation|Lorentz factor|wavefront|gravitational potential)\b/gi,
    /\b(Gibbs free energy|enthalpy|entropy|vapor pressure|hydrogen bonding|electronegativity|ionization energy|activation energy|equilibrium constant)\b/gi,
    /\b(instantaneous rate|local linear approximation|level curve|tangent slope|critical point|concavity|eigenvalues?|determinant|conjugate roots)\b/gi,
    /\b(palace economy|balance-of-payments|currency peg|citizen militia|Triffin dilemma|mercantilism)\b/gi,
  ];

  for (const pattern of domainPatterns) {
    let m;
    while ((m = pattern.exec(textPool)) !== null) {
      const term = m[1].trim();
      if (!terms.some((t) => t.toLowerCase() === term.toLowerCase())) {
        terms.push(term);
      }
    }
  }

  return terms;
}

/**
 * Returns specific suggested follow-up questions for a given Question.
 * Always prioritizes the question's embedded suggestedQuestions,
 * falling back to intelligent dynamic generation based on terms and relations.
 */
export function getSuggestedQuestionsForQuestion(question: Question): string[] {
  if (
    question.suggestedQuestions &&
    Array.isArray(question.suggestedQuestions) &&
    question.suggestedQuestions.length > 0
  ) {
    const valid = question.suggestedQuestions
      .map((q) => (typeof q === 'string' ? q.trim() : ''))
      .filter((q) => q.length > 5);
    if (valid.length > 0) {
      return valid.slice(0, 4);
    }
  }

  const terms = extractKeyTerms(question);
  const primaryTerm = terms[0];
  const secondaryTerm = terms[1] || terms[0];
  const topic = question.topic || 'this concept';

  const dynamicQuestions: string[] = [];

  if (primaryTerm && secondaryTerm && primaryTerm !== secondaryTerm) {
    dynamicQuestions.push(
      `How does the relationship between ${primaryTerm} and ${secondaryTerm} explain this mechanism?`
    );
  } else if (primaryTerm) {
    dynamicQuestions.push(
      `What role does ${primaryTerm} play in governing this outcome?`
    );
  }

  if (terms.length >= 2) {
    dynamicQuestions.push(
      `What would happen if ${secondaryTerm} were significantly altered or reversed?`
    );
  } else {
    dynamicQuestions.push(
      `How does this phenomenon connect back to the fundamental principles of ${topic}?`
    );
  }

  if (terms.length >= 3) {
    const tertiaryTerm = terms[2];
    dynamicQuestions.push(
      `Why is ${tertiaryTerm} necessary for this relation to hold true?`
    );
  } else if (primaryTerm) {
    dynamicQuestions.push(
      `What is the underlying derivation connecting ${primaryTerm} to the correct answer?`
    );
  } else {
    dynamicQuestions.push(
      `Can you break down the mathematical/scientific derivation step-by-step?`
    );
  }

  dynamicQuestions.push(
    `What are the most common misconceptions about the terms and relations described here?`
  );

  return dynamicQuestions.slice(0, 4);
}
