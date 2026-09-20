import type { User } from '@supabase/supabase-js';
import type { JourneyTarget } from '../../../supabase/functions/_shared/journey';
import { selectJourneyTarget } from '../../../supabase/functions/_shared/journey';
import { normalizeTopicWeights } from '../../../supabase/functions/_shared/resources';
import type { UserSettings, Question } from '../../types';
import { findConcept } from '../../lib/concepts/registry';
import { generateDemoJourneyQuestion } from '../../lib/kingdom/demoJourneyQuestions';
import { demoGeneration, demoKnowledgeGraph } from '../../lib/kingdom/demoLearning';
import { nextLearningStep, saveLearningPath, type LearningPath } from '../../lib/kingdom/learningPath';
import { loadKingdom } from '../../lib/kingdom/storage';
import { generateJourneyQuestion, getKnowledgeGraph, getServerKingdom, practiceJourney } from '../../services/backend';
import { getLocalConcepts } from '../../services/database';
import { LearningRequestError, missingGeminiKey } from '../../services/learningErrors';
import type { useKingdom } from '../../lib/kingdom/useKingdom';
import type { LearningSessionState } from './learningSessionState';

type Dependencies = {
    user: User | null;
    isDemoUser: boolean;
    settings: UserSettings;
    settingsLoading: boolean;
    settingsError: string | null;
    kingdom: ReturnType<typeof useKingdom>;
    resettingRef: React.RefObject<boolean>;
    openSettings: () => void;
    showPendingReward: (question: Question) => void;
};
type Context = {
    state: LearningSessionState;
    dependencies: Dependencies
};
type Request = {
    topic?: string;
    target?: JourneyTarget;
    path: LearningPath;
    continuing: boolean;
    sequence: number
};
type Resolution = {
    topic?: string;
    target?: JourneyTarget;
    path: LearningPath;
    done?: string
};

function targetFromQuestion(question: Question): JourneyTarget | undefined {
    if (!question.graphNodeId) {
        return undefined;
    }

    if (question.isBossQuestion) {
        return {
            nodeId: question.graphNodeId,
            kind: 'boss'
        };
    }

    if (question.graphDimension) {
        return {
            nodeId: question.graphNodeId,
            kind: 'dimension',
            dimension: question.graphDimension
        };
    }

    if (question.reasoningComplexity) {
        return {
            nodeId: question.graphNodeId,
            kind: 'reasoning',
            reasoningComplexity: question.reasoningComplexity
        };
    }

    return undefined;
}

function requestedPath(topic?: string, target?: JourneyTarget, path?: LearningPath): LearningPath {
    return path ?? (target ? {
        kind: 'concept',
        topic: topic!,
        nodeId: target.nodeId
    }
        : topic ? {
            kind: 'topic',
            topic
        } : { kind: 'random' });
}

function prepareUi(context: Context, topic: string | undefined, target: JourneyTarget | undefined, path: LearningPath, continuing: boolean): void {
    const s = context.state;
    if (topic) {
        s.setLearningTopic(topic);
    }

    s.retryTarget.current = target;
    s.retryPath.current = path;
    s.retryContinuation.current = continuing;
    s.setMilestones([]);
    s.setKnowledgeOnly(false);
    s.setLearningDone(null);
    s.setRetryTopic(topic);
}

function requireKey(context: Context): boolean {
    const { state: s, dependencies: d } = context;
    if (d.isDemoUser || d.settings.hasApiKey || d.settingsError) {
        return true;
    }

    s.setErrorMessage(missingGeminiKey().message);
    s.setErrorNeedsApiKey(true);
    d.openSettings();
    s.setIsLoadingQuestion(false);
    return false;
}

function canBegin(context: Context): boolean {
    const { state: s, dependencies: d } = context;
    if (!d.user || d.resettingRef.current || s.pendingLoading || s.pendingLoadError || (!d.isDemoUser && d.settingsLoading)) {
        return false;
    }

    if (s.pendingRewardRef.current) {
        d.showPendingReward(s.pendingRewardRef.current);
        return false;
    }

    return true;
}

function showLoading(state: LearningSessionState, topic?: string): void {
    state.setPendingTopic(topic || null);
    state.setIsLoadingQuestion(true);
    state.setErrorMessage(null);
    state.setErrorNeedsApiKey(false);
}

function beginRequest(context: Context, topic?: string, target?: JourneyTarget, path?: LearningPath, continuing = false): Request | null {
    const s = context.state;
    if (!canBegin(context)) {
        return null;
    }

    const requested = requestedPath(topic, target, path);
    prepareUi(context, topic, target, requested, continuing);
    const sequence = ++s.questionRequest.current;
    if (!requireKey(context)) {
        return null;
    }

    showLoading(s, topic);
    return {
        topic,
        target,
        path: requested,
        continuing,
        sequence
    };
}

async function continuationInputs(context: Context, path: LearningPath) {
    const { dependencies: d } = context;
    const graph = path.kind === 'concept'
        ? d.isDemoUser ? demoKnowledgeGraph(d.user!.id) : await getKnowledgeGraph() : undefined;
    const needsKingdom = ['goal', 'tower', 'library', 'forge'].includes(path.kind);
    const kingdom = needsKingdom
        ? d.isDemoUser ? loadKingdom(d.user!.id) : (await getServerKingdom()).state : d.kingdom.state;
    return {
        graph,
        kingdom
    };
}

async function resolveRequest(context: Context, request: Request): Promise<Resolution | null> {
    if (!request.continuing) {
        return {
            topic: request.topic,
            target: request.target,
            path: request.path
        };
    }

    const s = context.state;
    const { graph, kingdom } = await continuationInputs(context, request.path);
    if (request.sequence !== s.questionRequest.current) {
        return null;
    }

    const step = nextLearningStep(request.path, kingdom, graph);
    if (step.done) {
        return {
            path: request.path,
            done: step.done
        };
    }

    s.setPendingTopic(step.topic ?? null);
    return {
        topic: step.topic,
        target: step.target,
        path: step.path
    };
}

function finishDone(state: LearningSessionState, done: string): void {
    state.setLearningDone(done);
    state.setCurrentQuestion(null);
    state.setReward(null);
}

async function generateQuestion(context: Context, resolution: Resolution): Promise<{
    question: Question;
    localGeneration?: number
}> {
    const { state: s, dependencies: d } = context;
    if (!d.isDemoUser) {
        return { question: resolution.target
            ? await generateJourneyQuestion(resolution.target) : await practiceJourney(resolution.topic) };
    }

    const localGeneration = demoGeneration(d.user!.id);
    const selected = !resolution.target
        ? selectJourneyTarget(demoKnowledgeGraph(d.user!.id), resolution.topic) : undefined;
    const question = await generateDemoJourneyQuestion(d.user!.id,
        selected?.topic ?? resolution.topic ?? s.learningTopic, resolution.target ?? selected!.target!);
    return {
        question,
        localGeneration
    };
}

async function waitForReveal(started: number): Promise<void> {
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 0 : Math.max(0, 650 - (performance.now() - started));
    if (delay) {
        await new Promise(resolve => window.setTimeout(resolve, delay));
    }
}

function presentedQuestion(context: Context, generated: Question, localGeneration?: number): Question {
    if (!context.dependencies.isDemoUser) {
        return generated;
    }

    const userId = context.dependencies.user!.id;
    return {
        ...generated,
        demoGeneration: localGeneration,
        topicWeights: normalizeTopicWeights(
            findConcept(generated.concept ?? '', getLocalConcepts(userId))?.topics ?? generated.topicWeights,
            generated.topic)
    };
}

function finishRequest(context: Context, resolution: Resolution, generated: Question, localGeneration?: number): void {
    const { state: s, dependencies: d } = context;
    s.learningPath.current = resolution.path;
    const questionId = generated.id ?? crypto.randomUUID();
    saveLearningPath(d.user!.id, questionId, resolution.path);
    s.setCurrentQuestion({
        ...presentedQuestion(context, generated, localGeneration),
        id: questionId
    });
    s.answeredRef.current = false;
    s.setReward(null);
    s.setSubmissionError(null);
    s.setSelectedOption(null);
    s.setIsAnswered(false);
}

async function runRequest(context: Context, request: Request, started: number): Promise<void> {
    const resolution = await resolveRequest(context, request);
    if (!resolution) {
        return;
    }

    if (resolution.done) {
        finishDone(context.state, resolution.done);
        return;
    }

    const generated = await generateQuestion(context, resolution);
    await waitForReveal(started);
    if (request.sequence !== context.state.questionRequest.current) {
        return;
    }

    finishRequest(context, resolution, generated.question, generated.localGeneration);
}

function reportFailure(context: Context, request: Request, error: unknown): void {
    if (request.sequence !== context.state.questionRequest.current) {
        return;
    }

    console.error('Failed to generate question:', error);
    context.state.setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred while generating question.');
    context.state.setErrorNeedsApiKey(error instanceof LearningRequestError && error.needsApiKey);
}

async function fetchQuestion(context: Context, topic?: string, target?: JourneyTarget, path?: LearningPath, continuing = false): Promise<void> {
    const request = beginRequest(context, topic, target, path, continuing);
    if (!request) {
        return;
    }

    const started = performance.now();
    try {
        await runRequest(context, request, started);
    } catch (error) {
        reportFailure(context, request, error);
    } finally {
        if (request.sequence === context.state.questionRequest.current) {
            context.state.setIsLoadingQuestion(false);
            context.state.setPendingTopic(null);
        }
    }
}

export function createQuestionGeneration(state: LearningSessionState, dependencies: Dependencies) {
    const context = {
        state,
        dependencies
    };
    const fetchNewQuestion = (topic?: string, target?: JourneyTarget, path?: LearningPath, continuing = false) =>
        fetchQuestion(context, topic, target, path, continuing);
    const retryQuestion = () => fetchNewQuestion(state.retryTopic, state.retryTarget.current,
        state.retryPath.current, state.retryContinuation.current);
    const refreshExpiredQuestion = () => state.currentQuestion && fetchNewQuestion(state.currentQuestion.topic,
        targetFromQuestion(state.currentQuestion) ?? state.retryTarget.current, state.learningPath.current);
    const nextQuestion = () => fetchNewQuestion(undefined, undefined, state.learningPath.current, true);
    return {
        fetchNewQuestion,
        retryQuestion,
        refreshExpiredQuestion,
        nextQuestion
    };
}
