// Model choice is an application decision, never a client-controlled parameter.
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

type Json = Record<string, unknown>;

export async function callGemini(apiKey: string, prompt: string, schema?: Json) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: schema ? {
          temperature: 0.85,
          responseMimeType: 'application/json',
          responseSchema: schema,
        } : { temperature: 0.65 },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error('Gemini request failed', response.status, detail.slice(0, 500));
    if (response.status === 404) {
      throw new Error('The configured Gemini model is unavailable. The app administrator needs to update the learning service model.');
    }
    if (response.status === 429) {
      throw new Error('Gemini’s request limit or quota has been reached. Wait a moment and retry, or check your quota in Google AI Studio.');
    }
    if ([400, 401, 403].includes(response.status)) {
      throw new Error('The Gemini API key was rejected. Check the key and its API access.');
    }
    throw new Error('Gemini is temporarily unable to complete this request. Please try again shortly.');
  }

  const payload = await response.json();
  const output = payload.candidates?.[0]?.content?.parts?.map((part: Json) => part.text ?? '').join('').trim();
  if (!output) throw new Error('The AI service returned an empty response.');
  return output;
}

