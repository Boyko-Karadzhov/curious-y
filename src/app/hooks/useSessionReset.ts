import { useCallback, useRef } from 'react';
import { useProgressReset } from './useProgressReset';
import type { LearningSessionState } from './learningSessionState';

function clearQuestionState(state: LearningSessionState): void {
    state.questionRequest.current++;
    state.setIsLoadingQuestion(false);
    state.setCurrentQuestion(null);
    state.setSelectedOption(null);
    state.setIsAnswered(false);
    state.setErrorMessage(null);
    state.setPendingTopic(null);
    state.setJourneyRevision(value => value + 1);
    state.setSubmissionError(null);
}

function clearRewardState(state: LearningSessionState): void {
    state.pendingRewardRef.current = null;
    state.setCollectionError(null);
    state.setReward(null);
    state.learningPath.current = { kind: 'random' };
    state.setLearningDone(null);
}

export function useSessionReset(state: LearningSessionState, userId?: string) {
    const current = useRef(state);
    current.current = state;
    const beginReset = useCallback(() => {
        current.current.questionRequest.current++;
        current.current.setIsLoadingQuestion(false);
    }, []);
    const waitForPendingAnswer = useCallback(() => current.current.pendingAnswerRef.current, []);
    const isCollectionPending = useCallback(() => current.current.collectingRef.current, []);
    const clearSession = useCallback(() => {
        clearRewardState(current.current);
        clearQuestionState(current.current);
    }, []);
    return useProgressReset({ userId, isCollecting: isCollectionPending, beginReset,
        waitForPendingAnswer, clearSession });
}
