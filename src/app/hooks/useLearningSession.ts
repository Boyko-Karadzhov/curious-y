import { useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import type { HistoryItem, UserSettings } from '../../types';
import { useKingdom } from '../../lib/kingdom/useKingdom';
import type { AppView } from './useAppNavigation';
import { useSessionReset } from './useSessionReset';
import { useLearningSessionState } from './learningSessionState';
import type { LearningSessionState } from './learningSessionState';
import { createQuestionGeneration } from './questionGeneration';
import { useRewardFlow } from './useRewardFlow';
import { createAnswerFlow } from './answerFlow';

type KingdomController = ReturnType<typeof useKingdom>;

interface LearningSessionOptions {
    user: User | null;
    isDemoUser: boolean;
    settings: UserSettings;
    settingsLoading: boolean;
    settingsError: string | null;
    kingdom: KingdomController;
    setView: (view: AppView) => void;
    openSettings: () => void;
    closeHistory: () => void;
}

function clearHomeQuestion(state: LearningSessionState): void {
    state.questionRequest.current++;
    state.setIsLoadingQuestion(false);
    state.setPendingTopic(null);
    state.setLearningDone(null);
    state.setReward(null);
    state.setCurrentQuestion(null);
    state.setSelectedOption(null);
    state.setIsAnswered(false);
    state.setErrorMessage(null);
    state.setSubmissionError(null);
}

function activateHistoryItem(state: LearningSessionState, item: HistoryItem): void {
    state.questionRequest.current++;
    state.setIsLoadingQuestion(false);
    state.setReward(null);
    state.answeredRef.current = true;
    state.setSubmissionError(null);
    state.setCurrentQuestion(item);
    state.learningPath.current = {
        kind: 'topic',
        topic: item.topic
    };
    state.setLearningDone(null);
    state.setSelectedOption(item.selectedIndex ?? null);
    state.setIsAnswered(true);
}

export function useLearningSession({
    user,
    isDemoUser,
    settings,
    settingsLoading,
    settingsError,
    kingdom,
    setView,
    openSettings,
    closeHistory,
}: LearningSessionOptions) {
    const state = useLearningSessionState(user);
    const {
        reward, pendingRewardRef, isCollecting, collectionError, pendingLoading, pendingLoadError,
        setPendingReload, currentQuestion, selectedOption, isAnswered, isLoadingQuestion, pendingTopic,
        errorMessage, errorNeedsApiKey, submissionError, questionExpired, learningTopic, setLearningTopic,
        journeyRevision, knowledgeOnly, setKnowledgeOnly, milestones, learningDone,
    } = state;

    const { resettingRef, resetError, resetProgress } = useSessionReset(state, user?.id);

    const { showPendingReward, collectReward } = useRewardFlow({
        state,
        user,
        isDemoUser,
        kingdom,
        resettingRef,
    });

    const resetHome = useCallback(() => {
        if (pendingRewardRef.current) {
            setView('learn');
            showPendingReward(pendingRewardRef.current);
            return;
        }

        clearHomeQuestion(state);
        setView('learn');
    }, [state, pendingRewardRef, setView, showPendingReward]);

    const { fetchNewQuestion, retryQuestion, refreshExpiredQuestion, nextQuestion } = createQuestionGeneration(state, {
        user,
        isDemoUser,
        settings,
        settingsLoading,
        settingsError,
        kingdom,
        resettingRef,
        openSettings,
        showPendingReward,
    });

    const { submitAnswer } = createAnswerFlow(state, {
        user,
        isDemoUser,
        kingdom,
        resettingRef,
        showPendingReward,
    });

    const selectFromHistory = (item: HistoryItem) => {
        if (pendingRewardRef.current) {
            setView('learn');
            showPendingReward(pendingRewardRef.current);
            closeHistory();
            return;
        }

        activateHistoryItem(state, item);
        setView('learn');
        closeHistory();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    const scrollToChat = () => {
        window.setTimeout(() => {
            document.getElementById('follow-up-chat-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const learningBlocked = pendingLoading
        ? 'Checking for uncollected Resources…'
        : pendingLoadError
            ? 'Retry the Resources check in Learn before continuing.'
            : isLoadingQuestion
                ? 'A question is being generated. Wait for it to finish.'
                : isCollecting
                    ? 'Saving your collected Resources…'
                    : selectedOption !== null && !isAnswered && !questionExpired
                        ? 'Your answer is being submitted…'
                        : !isDemoUser && settingsLoading
                            ? 'Checking your Gemini connection…'
                            : null;

    return {
        reward,
        currentQuestion,
        selectedOption,
        isAnswered,
        isLoadingQuestion,
        pendingTopic,
        errorMessage,
        errorNeedsApiKey,
        submissionError,
        questionExpired,
        learningTopic,
        journeyRevision,
        knowledgeOnly,
        milestones,
        learningDone,
        isCollecting,
        collectionError,
        pendingLoading,
        pendingLoadError,
        resetError,
        learningBlocked,
        hasPendingReward: !!reward && !reward.collected,
        collectReward,
        resetHome,
        resetProgress,
        fetchNewQuestion,
        retryQuestion,
        refreshExpiredQuestion,
        nextQuestion,
        submitAnswer,
        selectFromHistory,
        scrollToChat,
        setLearningTopic,
        setKnowledgeOnly,
        retryPendingRewardLoad: () => setPendingReload(value => value + 1),
    };
}

export type LearningSession = ReturnType<typeof useLearningSession>;
