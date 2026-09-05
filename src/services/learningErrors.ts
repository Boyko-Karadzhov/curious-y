export class LearningRequestError extends Error {
  constructor(message: string, public readonly needsApiKey = false, public readonly questionExpired = false) {
    super(message);
    this.name = 'LearningRequestError';
  }
}

export const missingGeminiKey = () => new LearningRequestError(
  'Add your Gemini API key in Settings to generate live questions. Save your key, then retry.', true,
);

// Older deployments return messages without error codes, including key errors as HTTP 500.
function describeFailure(message: string, status?: number): LearningRequestError {
  if (/^Question (?:has )?expired[.!]?$/i.test(message.trim())) {
    return new LearningRequestError('This question has expired. Get a fresh question to keep learning.', false, true);
  }
  if (/Gemini API key.*(?:required|Add it in Settings)/i.test(message)) return missingGeminiKey();
  if (/Gemini API key.*rejected/i.test(message)) {
    return new LearningRequestError('Gemini could not accept your API key. Open Settings to check or replace it, then retry.', true);
  }
  if (status === 401 || /Authentication required|Invalid or expired session/i.test(message)) {
    return new LearningRequestError('Your session has expired. Sign out and sign in again, then retry.');
  }
  if (status === 429) {
    return new LearningRequestError(message || 'Too many requests right now. Please wait a moment, then retry.');
  }
  if (/learning backend is not configured/i.test(message)) {
    return new LearningRequestError('Live learning is not set up on the server yet. Please contact the app administrator.');
  }
  return new LearningRequestError(message || 'We could not reach the learning service. Check your connection and try again. If this continues, the service may be unavailable.');
}

export async function learningRequestFailure(error: unknown): Promise<LearningRequestError> {
  const context = error && typeof error === 'object' && 'context' in error ? error.context : undefined;
  if (context instanceof Response) {
    let message = '';
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === 'string') message = payload.error;
    } catch {
      // Gateway failures may return HTML or no body. Never show that response to users.
    }
    return describeFailure(message, context.status);
  }
  // Transport/relay errors carry SDK diagnostics, not useful recovery instructions.
  return describeFailure('');
}

export const learningPayloadFailure = (message: string) => describeFailure(message);
