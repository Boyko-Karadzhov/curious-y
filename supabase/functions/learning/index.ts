import { createClient } from 'npm:@supabase/supabase-js@2';
import { shuffleQuestionOptions } from '../_shared/questionOptions.ts';
import { callGemini } from './gemini.ts';
import { createLearningHandler } from './handler.ts';
import { handleJourney } from './journey.ts';
import { executeKingdomCommand, parseKingdomCommand } from './kingdom.ts';
import { generateEligibleQuestion } from './prerequisites.ts';
import type { ClientFactory, Dependencies, LearningClient } from './types.ts';

const createLearningClient: ClientFactory = (url, key, options) =>
    createClient(url, key, options) as unknown as LearningClient;

const dependencies: Dependencies = {
    createClient: createLearningClient,
    env: Deno.env,
    callGemini,
    generateEligibleQuestion,
    shuffleQuestionOptions,
    parseKingdomCommand,
    executeKingdomCommand,
    handleJourney,
};

Deno.serve(createLearningHandler(dependencies));
