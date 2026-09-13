import { createClient } from 'npm:@supabase/supabase-js@2';
import { callGemini } from './gemini.ts';
import { createLearningHandler } from './handler.ts';
import { handleJourney } from './journey.ts';
import { executeKingdomCommand, parseKingdomCommand } from './kingdom.ts';
import type { ClientFactory, Dependencies, LearningClient } from './types.ts';

const createLearningClient: ClientFactory = (url, key, options) =>
    createClient(url, key, options) as unknown as LearningClient;

const dependencies: Dependencies = {
    createClient: createLearningClient,
    env: Deno.env,
    callGemini,
    parseKingdomCommand,
    executeKingdomCommand,
    handleJourney,
};

Deno.serve(createLearningHandler(dependencies));
