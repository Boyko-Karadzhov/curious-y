import { useCallback, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Question } from '../../types';
import { collectResources } from '../../components/game/collectResources';
import { restoreLearningPath } from '../../lib/kingdom/learningPath';
import { loadPendingReward } from '../../lib/kingdom/pendingReward';
import type { useKingdom } from '../../lib/kingdom/useKingdom';
import { collectServerReward, getServerPendingReward } from '../../services/backend';
import type { LearningSessionState } from './learningSessionState';

type Kingdom = ReturnType<typeof useKingdom>;
type Context = { state: LearningSessionState; user: User | null; isDemoUser: boolean; kingdom: Kingdom; resettingRef: React.RefObject<boolean> };

function markPendingAnswer(state: LearningSessionState, question: Question): void {
    state.setLearningDone(null);
    state.pendingRewardRef.current = question;
    state.questionRequest.current++;
    state.answeredRef.current = true;
    state.setIsLoadingQuestion(false);
    state.setCurrentQuestion(question);
    state.setSelectedOption(question.selectedIndex ?? null);
    state.setIsAnswered(true);
}

function showPending(state: LearningSessionState, question: Question): void {
    if (!question.reward) {
        throw new Error('Reward breakdown is unavailable. Refresh to retry.');
    }

    if (state.identityRef.current && question.id) {
        state.learningPath.current = restoreLearningPath(state.identityRef.current, question.id, question.topic);
    }

    markPendingAnswer(state, question);
    state.setReward({ ...question.reward, collected: false });
    state.setErrorMessage(null);
}

function beginPendingCheck(state: LearningSessionState): void {
    state.questionRequest.current++;
    state.pendingRewardRef.current = null;
    state.setReward(null);
    state.setCurrentQuestion(null);
    state.setPendingLoading(true);
    state.setPendingLoadError(null);
}

function applyPending(state: LearningSessionState, pending: Question | null, showPendingReward: (question: Question) => void): void {
    if (pending) {
        showPendingReward(pending);
    } else if (state.pendingRewardRef.current) {
        state.pendingRewardRef.current = null;
        state.setReward(null);
        state.setCollectionError(null);
    }

    state.setPendingLoadError(null);
}

async function restorePending(context: Context, showPendingReward: (question: Question) => void, active: () => boolean): Promise<void> {
    const { state, user, isDemoUser } = context;
    const request = state.questionRequest.current;
    try {
        const pending = isDemoUser ? loadPendingReward(user!.id) : await getServerPendingReward();
        if (active() && request === state.questionRequest.current) {
            applyPending(state, pending, showPendingReward);
        }
    } catch {
        if (active() && request === state.questionRequest.current) {
            state.setPendingLoadError('Could not check your uncollected Resources. Retry to continue.');
        }
    } finally {
        if (active()) {
            state.setPendingLoading(false);
        }
    }
}

function listenForRefresh(context: Context, restore: () => void): () => void {
    const refresh = () => {
        if (!context.state.collectingRef.current && !context.resettingRef.current) {
            restore();
        }
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
        window.removeEventListener('focus', refresh);
        window.removeEventListener('storage', refresh);
    };
}

function usePendingRestore(context: Context, showPendingReward: (question: Question) => void): void {
    const latest = useRef(context);
    latest.current = context;
    const { user, isDemoUser, state } = context;
    useEffect(() => {
        const context = latest.current;
        const state = context.state;
        let active = true;
        beginPendingCheck(state);
        if (!user?.id) {
            return;
        }

        const restore = () => {
            void restorePending(context, showPendingReward, () => active);
        };

        restore();
        const stopListening = listenForRefresh(context, restore);
        return () => {
            active = false;
            stopListening();
        };
    }, [user?.id, isDemoUser, state.pendingReload, showPendingReward]);
}

function beginCollection(state: LearningSessionState): void {
    state.collectingRef.current = true;
    state.questionRequest.current++;
    state.setIsCollecting(true);
    state.setCollectionError(null);
}

async function claimReward(context: Context, pending: Question) {
    if (context.isDemoUser) {
        const saved = await context.kingdom.act({ type: 'answer', id: pending.id!, topic: pending.topic,
            correct: pending.isCorrect === true, reward: pending.reward });
        if (!saved) {
            throw new Error('Could not save your Resources. Click Collect to retry.');
        }

        return pending.reward!;
    }

    const collected = await collectServerReward(pending.id!);
    context.kingdom.applyServer(collected);
    return collected.reward;
}

function finishCollection(context: Context, pending: Question, source: HTMLButtonElement, reward: NonNullable<Question['reward']>): void {
    if (context.state.identityRef.current !== context.user!.id) {
        return;
    }

    void collectResources(source, reward.lines).catch(() => { });
    context.state.pendingRewardRef.current = null;
    context.state.setReward(current => current && current.id === pending.id ? { ...reward, collected: true } : current);
}

async function collectReward(context: Context, source: HTMLButtonElement): Promise<void> {
    const { state, user, resettingRef } = context;
    const pending = state.pendingRewardRef.current;
    if (!user || !pending || state.collectingRef.current || resettingRef.current) {
        return;
    }

    beginCollection(state);
    try {
        finishCollection(context, pending, source, await claimReward(context, pending));
    } catch (error) {
        if (state.identityRef.current === user.id) {
            state.setCollectionError(error instanceof Error ? error.message : 'Could not collect. Please retry.');
        }
    } finally {
        state.collectingRef.current = false;
        state.setIsCollecting(false);
    }
}

export function useRewardFlow(context: Context) {
    const current = useRef(context);
    current.current = context;
    const showPendingReward = useCallback((question: Question) => showPending(current.current.state, question), []);
    usePendingRestore(context, showPendingReward);
    return { showPendingReward, collectReward: (source: HTMLButtonElement) => collectReward(context, source) };
}
