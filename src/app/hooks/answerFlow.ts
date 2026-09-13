import type { User } from '@supabase/supabase-js';
import type { Question } from '../../types';
import { journeyMilestones } from '../../../supabase/functions/_shared/journey';
import { answerDemoQuestion, demoJourneyView } from '../../lib/kingdom/demoLearning';
import type { useKingdom } from '../../lib/kingdom/useKingdom';
import { submitServerAnswer, type AnswerResult } from '../../services/backend';
import { getLocalConcepts, saveQuestion } from '../../services/database';
import { LearningRequestError } from '../../services/learningErrors';
import type { LearningSessionState } from './learningSessionState';

type Dependencies = { user: User | null; isDemoUser: boolean; kingdom: ReturnType<typeof useKingdom>;
    resettingRef: React.RefObject<boolean>; showPendingReward: (question: Question) => void };
type Context = { state: LearningSessionState; dependencies: Dependencies };

function canAnswer(context: Context): boolean {
    const { state: s, dependencies: d } = context;
    return !!d.user && !!s.currentQuestion && !s.isAnswered && !s.questionExpired && !s.answeredRef.current
        && !s.isLoadingQuestion && !d.resettingRef.current;
}

function beginAnswer(state: LearningSessionState, index: number): number {
    state.answeredRef.current = true;
    const request = ++state.questionRequest.current;
    state.setSelectedOption(index);
    state.setSubmissionError(null);
    return request;
}

function settleServerQuestion(state: LearningSessionState, question: Question, index: number, result: AnswerResult): void {
    state.setJourneyRevision(value => value + 1);
    state.setMilestones(result.milestones ?? []);
    state.setCurrentQuestion(question);
    state.setSelectedOption(question.selectedIndex ?? index);
    state.setIsAnswered(true);
    state.setReward({ ...result.reward, collected: result.collected });
    state.setErrorMessage(null);
}

function applyServerResult(context: Context, request: number, index: number, result: AnswerResult): void {
    const { state: s, dependencies: d } = context;
    if (s.identityRef.current !== d.user!.id) {
        return;
    }

    const question = { ...result.question, reward: result.reward };
    d.kingdom.applyServer(result.kingdom);
    if (!result.collected && !d.resettingRef.current) {
        s.pendingRewardRef.current = question;
    }

    if (request !== s.questionRequest.current) {
        if (!result.collected && !d.resettingRef.current) {
            d.showPendingReward(question);
        }

        return;
    }

    settleServerQuestion(s, question, index, result);
}

function reportServerError(context: Context, request: number, error: unknown): void {
    const s = context.state;
    if (request !== s.questionRequest.current) {
        return;
    }

    s.answeredRef.current = false;
    s.setSelectedOption(null);
    if (error instanceof LearningRequestError && error.questionExpired) {
        s.setExpiredQuestionId(s.currentQuestion!.id!);
        s.setSubmissionError(null);
        return;
    }

    s.setSubmissionError(error instanceof Error ? error.message : 'Could not submit answer.');
}

async function answerServer(context: Context, request: number, index: number): Promise<void> {
    try {
        const result = await submitServerAnswer(context.state.currentQuestion!.id!, index);
        applyServerResult(context, request, index, result);
    } catch (error) {
        reportServerError(context, request, error);
    }
}

async function saveDemoAnswer(context: Context, request: number, answered: Question): Promise<void> {
    try {
        const saved = await saveQuestion(context.dependencies.user!.id, answered);
        if (request === context.state.questionRequest.current) {
            context.state.setCurrentQuestion(saved);
        }
    } catch (error) {
        console.error('Failed to save answered question:', error);
    }
}

function applyDemoResult(context: Context, request: number, question: Question, answered: Question,
    beforeJourney: ReturnType<typeof demoJourneyView> | null): void {
    const { state: s, dependencies: d } = context;
    s.pendingRewardRef.current = answered;
    s.setJourneyRevision(value => value + 1);
    if (beforeJourney) {
        s.setMilestones(journeyMilestones(beforeJourney, demoJourneyView(d.user!.id, question.topic)));
    }

    void d.kingdom.refresh();
    s.setIsAnswered(true);
    s.setCurrentQuestion(answered);
    if (request === s.questionRequest.current) {
        s.setReward({ ...answered.reward!, collected: false });
    }
}

function reportDemoFailure(state: LearningSessionState): void {
    state.answeredRef.current = false;
    state.setSelectedOption(null);
    state.setSubmissionError('Your pending Resources could not be saved. Free browser storage and try again.');
}

async function answerDemo(context: Context, request: number, index: number): Promise<void> {
    const { state: s, dependencies: d } = context;
    const question = s.currentQuestion!;
    const beforeJourney = question.graphNodeId ? demoJourneyView(d.user!.id, question.topic) : null;
    let answered: Question;
    try {
        answered = await answerDemoQuestion(d.user!.id, question, index, getLocalConcepts(d.user!.id));
    } catch {
        reportDemoFailure(s);
        return;
    }

    if (s.identityRef.current !== d.user!.id || request !== s.questionRequest.current) {
        return;
    }

    applyDemoResult(context, request, question, answered, beforeJourney);
    await saveDemoAnswer(context, request, answered);
}

async function answerQuestion(context: Context, index: number): Promise<void> {
    if (!canAnswer(context)) {
        return;
    }

    const request = beginAnswer(context.state, index);
    if (context.dependencies.isDemoUser) {
        await answerDemo(context, request, index);
    } else {
        await answerServer(context, request, index);
    }
}

export function createAnswerFlow(state: LearningSessionState, dependencies: Dependencies) {
    const context = { state, dependencies };
    const submitAnswer = (index: number) => {
        if (state.answeredRef.current) {
            return;
        }

        state.pendingAnswerRef.current = answerQuestion(context, index);
        return state.pendingAnswerRef.current;
    };

    return { submitAnswer };
}
