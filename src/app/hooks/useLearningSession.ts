import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { HistoryItem, Question, UserSettings } from '../../types';
import type { JourneyTarget } from '../../../supabase/functions/_shared/journey';
import { journeyMilestones, selectJourneyTarget } from '../../../supabase/functions/_shared/journey';
import { normalizeTopicWeights } from '../../../supabase/functions/_shared/resources';
import { collectResources } from '../../components/game/collectResources';
import type { AnswerReward } from '../../components/game/LearningRewardCard';
import { findConcept } from '../../lib/concepts/registry';
import { generateDemoJourneyQuestion } from '../../lib/kingdom/demoJourneyQuestions';
import {
    answerDemoQuestion,
    demoGeneration,
    demoJourneyView,
    demoKnowledgeGraph,
} from '../../lib/kingdom/demoLearning';
import {
    nextLearningStep,
    restoreLearningPath,
    saveLearningPath,
    type LearningPath,
} from '../../lib/kingdom/learningPath';
import { loadPendingReward } from '../../lib/kingdom/pendingReward';
import { loadKingdom } from '../../lib/kingdom/storage';
import { useKingdom } from '../../lib/kingdom/useKingdom';
import {
    collectServerReward,
    generateJourneyQuestion,
    getKnowledgeGraph,
    getServerKingdom,
    getServerPendingReward,
    practiceJourney,
    submitServerAnswer,
} from '../../services/backend';
import { getLocalConcepts, saveQuestion } from '../../services/database';
import { LearningRequestError, missingGeminiKey } from '../../services/learningErrors';
import type { AppView } from './useAppNavigation';
import { useProgressReset } from './useProgressReset';

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
    const [reward, setReward] = useState<AnswerReward | null>(null);
    const pendingRewardRef = useRef<Question | null>(null);
    const identityRef = useRef(user?.id);
    identityRef.current = user?.id;
    const collectingRef = useRef(false);
    const [isCollecting, setIsCollecting] = useState(false);
    const [collectionError, setCollectionError] = useState<string | null>(null);
    const [pendingLoading, setPendingLoading] = useState(true);
    const [pendingLoadError, setPendingLoadError] = useState<string | null>(null);
    const [pendingReload, setPendingReload] = useState(0);
    const questionRequest = useRef(0);
    const answeredRef = useRef(false);
    const pendingAnswerRef = useRef<Promise<void>>(Promise.resolve());

    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
    const [pendingTopic, setPendingTopic] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorNeedsApiKey, setErrorNeedsApiKey] = useState(false);
    const [retryTopic, setRetryTopic] = useState<string | undefined>();
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [expiredQuestionId, setExpiredQuestionId] = useState<string | null>(null);
    const questionExpired = !isAnswered && !!currentQuestion?.id && currentQuestion.id === expiredQuestionId;

    const [learningTopic, setLearningTopic] = useState('Life');
    const [journeyRevision, setJourneyRevision] = useState(0);
    const [knowledgeOnly, setKnowledgeOnly] = useState(false);
    const [milestones, setMilestones] = useState<string[]>([]);
    const retryTarget = useRef<JourneyTarget | undefined>();
    const learningPath = useRef<LearningPath>({ kind: 'random' });
    const retryPath = useRef<LearningPath>({ kind: 'random' });
    const retryContinuation = useRef(false);
    const [learningDone, setLearningDone] = useState<string | null>(null);

    useEffect(() => () => {
        questionRequest.current++;
    }, []);

    const beginReset = useCallback(() => {
        questionRequest.current++;
        setIsLoadingQuestion(false);
    }, []);
    const waitForPendingAnswer = useCallback(() => pendingAnswerRef.current, []);
    const isCollectionPending = useCallback(() => collectingRef.current, []);
    const clearSession = useCallback(() => {
        pendingRewardRef.current = null;
        setCollectionError(null);
        questionRequest.current++;
        setIsLoadingQuestion(false);
        setReward(null);
        learningPath.current = { kind: 'random' };
        setLearningDone(null);
        setCurrentQuestion(null);
        setSelectedOption(null);
        setIsAnswered(false);
        setErrorMessage(null);
        setPendingTopic(null);
        setJourneyRevision(value => value + 1);
        setSubmissionError(null);
    }, []);
    const { resettingRef, resetError, resetProgress } = useProgressReset({
        userId: user?.id,
        isCollecting: isCollectionPending,
        beginReset,
        waitForPendingAnswer,
        clearSession,
    });

    const showPendingReward = useCallback((question: Question) => {
        if (!question.reward) {
            throw new Error('Reward breakdown is unavailable. Refresh to retry.');
        }

        if (identityRef.current && question.id) {
            learningPath.current = restoreLearningPath(identityRef.current, question.id, question.topic);
        }

        setLearningDone(null);
        pendingRewardRef.current = question;
        questionRequest.current++;
        answeredRef.current = true;
        setIsLoadingQuestion(false);
        setCurrentQuestion(question);
        setSelectedOption(question.selectedIndex ?? null);
        setIsAnswered(true);
        setReward({ ...question.reward, collected: false });
        setErrorMessage(null);
    }, []);

    useEffect(() => {
        let active = true;
        questionRequest.current++;
        pendingRewardRef.current = null;
        setReward(null);
        setCurrentQuestion(null);
        setPendingLoading(true);
        setPendingLoadError(null);
        if (!user?.id) {
            return;
        }

        const restore = async () => {
            const request = questionRequest.current;
            try {
                const pending = isDemoUser ? loadPendingReward(user.id) : await getServerPendingReward();
                if (!active || request !== questionRequest.current) {
                    return;
                }

                if (pending) {
                    showPendingReward(pending);
                } else if (pendingRewardRef.current) {
                    pendingRewardRef.current = null;
                    setReward(null);
                    setCollectionError(null);
                }

                setPendingLoadError(null);
            } catch {
                if (active && request === questionRequest.current) {
                    setPendingLoadError('Could not check your uncollected Resources. Retry to continue.');
                }
            } finally {
                if (active) {
                    setPendingLoading(false);
                }
            }
        };

        void restore();
        const refreshPending = () => {
            if (!collectingRef.current && !resettingRef.current) {
                void restore();
            }
        };

        window.addEventListener('focus', refreshPending);
        window.addEventListener('storage', refreshPending);
        return () => {
            active = false;
            window.removeEventListener('focus', refreshPending);
            window.removeEventListener('storage', refreshPending);
        };
    }, [user?.id, isDemoUser, pendingReload, showPendingReward, resettingRef]);

    const collectReward = async (source: HTMLButtonElement) => {
        const pending = pendingRewardRef.current;
        if (!user || !pending || collectingRef.current || resettingRef.current) {
            return;
        }

        collectingRef.current = true;
        questionRequest.current++;
        setIsCollecting(true);
        setCollectionError(null);
        try {
            let collectedReward = pending.reward!;
            if (isDemoUser) {
                const saved = await kingdom.act({
                    type: 'answer',
                    id: pending.id!,
                    topic: pending.topic,
                    correct: pending.isCorrect === true,
                    reward: pending.reward,
                });
                if (!saved) {
                    throw new Error('Could not save your Resources. Click Collect to retry.');
                }
            } else {
                const collected = await collectServerReward(pending.id!);
                kingdom.applyServer(collected);
                collectedReward = collected.reward;
            }

            if (identityRef.current !== user.id) {
                return;
            }

            void collectResources(source, collectedReward.lines).catch(() => { });
            pendingRewardRef.current = null;
            setReward(current => current && current.id === pending.id
                ? { ...collectedReward, collected: true }
                : current);
        } catch (error) {
            if (identityRef.current === user.id) {
                setCollectionError(error instanceof Error ? error.message : 'Could not collect. Please retry.');
            }
        } finally {
            collectingRef.current = false;
            setIsCollecting(false);
        }
    };

    const resetHome = useCallback(() => {
        if (pendingRewardRef.current) {
            setView('learn');
            showPendingReward(pendingRewardRef.current);
            return;
        }

        questionRequest.current++;
        setIsLoadingQuestion(false);
        setPendingTopic(null);
        setLearningDone(null);
        setView('learn');
        setReward(null);
        setCurrentQuestion(null);
        setSelectedOption(null);
        setIsAnswered(false);
        setErrorMessage(null);
        setSubmissionError(null);
    }, [setView, showPendingReward]);

    const fetchNewQuestion = useCallback(async (
        specificTopic?: string,
        target?: JourneyTarget,
        path?: LearningPath,
        continuing = false,
    ) => {
        if (!user || resettingRef.current || pendingLoading || pendingLoadError || (!isDemoUser && settingsLoading)) {
            return;
        }

        if (pendingRewardRef.current) {
            showPendingReward(pendingRewardRef.current);
            return;
        }

        const requestedPath = path ?? (target
            ? { kind: 'concept', topic: specificTopic!, nodeId: target.nodeId }
            : specificTopic
                ? { kind: 'topic', topic: specificTopic }
                : { kind: 'random' }) as LearningPath;
        if (specificTopic) {
            setLearningTopic(specificTopic);
        }

        retryTarget.current = target;
        retryPath.current = requestedPath;
        retryContinuation.current = continuing;
        setMilestones([]);
        setKnowledgeOnly(false);
        setLearningDone(null);
        const request = ++questionRequest.current;
        setRetryTopic(specificTopic);

        if (!isDemoUser && !settings.hasApiKey && !settingsError) {
            setErrorMessage(missingGeminiKey().message);
            setErrorNeedsApiKey(true);
            openSettings();
            setIsLoadingQuestion(false);
            return;
        }

        setPendingTopic(specificTopic || null);
        setIsLoadingQuestion(true);
        setErrorMessage(null);
        setErrorNeedsApiKey(false);
        const generationStarted = performance.now();

        try {
            let chosenTopic = specificTopic;
            let nextPath = requestedPath;
            if (continuing) {
                const graph = requestedPath.kind === 'concept'
                    ? isDemoUser ? demoKnowledgeGraph(user.id) : await getKnowledgeGraph()
                    : undefined;
                const needsKingdom = ['goal', 'tower', 'library', 'forge'].includes(requestedPath.kind);
                const state = needsKingdom
                    ? isDemoUser ? loadKingdom(user.id) : (await getServerKingdom()).state
                    : kingdom.state;
                if (request !== questionRequest.current) {
                    return;
                }

                const step = nextLearningStep(requestedPath, state, graph);
                if (step.done) {
                    setLearningDone(step.done);
                    setCurrentQuestion(null);
                    setReward(null);
                    return;
                }

                chosenTopic = step.topic;
                target = step.target;
                nextPath = step.path;
                setPendingTopic(chosenTopic ?? null);
            }

            const localGeneration = isDemoUser ? demoGeneration(user.id) : undefined;
            const selected = isDemoUser && !target
                ? selectJourneyTarget(demoKnowledgeGraph(user.id), chosenTopic)
                : undefined;
            const generated = isDemoUser
                ? await generateDemoJourneyQuestion(
                    user.id,
                    selected?.topic ?? chosenTopic ?? learningTopic,
                    target ?? selected!.target!,
                )
                : target
                    ? await generateJourneyQuestion(target)
                    : await practiceJourney(chosenTopic);

            const revealDelay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                ? 0
                : Math.max(0, 650 - (performance.now() - generationStarted));
            if (revealDelay) {
                await new Promise(resolve => window.setTimeout(resolve, revealDelay));
            }

            if (request !== questionRequest.current) {
                return;
            }

            learningPath.current = nextPath;
            const questionId = generated.id ?? crypto.randomUUID();
            saveLearningPath(user.id, questionId, nextPath);
            setCurrentQuestion({
                ...generated,
                id: questionId,
                ...(isDemoUser ? {
                    demoGeneration: localGeneration,
                    topicWeights: normalizeTopicWeights(
                        findConcept(generated.concept ?? '', getLocalConcepts(user.id))?.topics ?? generated.topicWeights,
                        generated.topic,
                    ),
                } : {}),
            });
            answeredRef.current = false;
            setReward(null);
            setSubmissionError(null);
            setSelectedOption(null);
            setIsAnswered(false);
        } catch (error: unknown) {
            if (request !== questionRequest.current) {
                return;
            }

            console.error('Failed to generate question:', error);
            setErrorMessage(error instanceof Error
                ? error.message
                : 'An unexpected error occurred while generating question.');
            setErrorNeedsApiKey(error instanceof LearningRequestError && error.needsApiKey);
        } finally {
            if (request === questionRequest.current) {
                setIsLoadingQuestion(false);
                setPendingTopic(null);
            }
        }
    }, [
        user,
        isDemoUser,
        settings,
        settingsLoading,
        settingsError,
        pendingLoading,
        pendingLoadError,
        showPendingReward,
        learningTopic,
        kingdom.state,
        resettingRef,
        openSettings,
    ]);

    const answerQuestion = async (index: number) => {
        if (!user || !currentQuestion || isAnswered || questionExpired || answeredRef.current
            || isLoadingQuestion || resettingRef.current) {
            return;
        }

        answeredRef.current = true;
        const request = ++questionRequest.current;
        setSelectedOption(index);
        setSubmissionError(null);
        if (!isDemoUser) {
            try {
                const result = await submitServerAnswer(currentQuestion.id!, index);
                if (identityRef.current !== user.id) {
                    return;
                }

                const claim = result.reward;
                result.question = { ...result.question, reward: claim };
                kingdom.applyServer(result.kingdom);
                if (!result.collected && !resettingRef.current) {
                    pendingRewardRef.current = result.question;
                }

                if (request !== questionRequest.current) {
                    if (!result.collected && !resettingRef.current) {
                        showPendingReward(result.question);
                    }

                    return;
                }

                setJourneyRevision(value => value + 1);
                setMilestones(result.milestones ?? []);
                setCurrentQuestion(result.question);
                setSelectedOption(result.question.selectedIndex ?? index);
                setIsAnswered(true);
                setReward({ ...claim, collected: result.collected });
                setErrorMessage(null);
            } catch (error) {
                if (request !== questionRequest.current) {
                    return;
                }

                answeredRef.current = false;
                setSelectedOption(null);
                if (error instanceof LearningRequestError && error.questionExpired) {
                    setExpiredQuestionId(currentQuestion.id!);
                    setSubmissionError(null);
                    return;
                }

                setSubmissionError(error instanceof Error ? error.message : 'Could not submit answer.');
            }

            return;
        }

        const beforeJourney = currentQuestion.graphNodeId
            ? demoJourneyView(user.id, currentQuestion.topic)
            : null;
        let answeredQuestion: Question;
        try {
            answeredQuestion = await answerDemoQuestion(
                user.id,
                currentQuestion,
                index,
                getLocalConcepts(user.id),
            );
        } catch {
            answeredRef.current = false;
            setSelectedOption(null);
            setSubmissionError('Your pending Resources could not be saved. Free browser storage and try again.');
            return;
        }

        if (identityRef.current !== user.id || request !== questionRequest.current) {
            return;
        }

        pendingRewardRef.current = answeredQuestion;
        setJourneyRevision(value => value + 1);
        if (beforeJourney) {
            setMilestones(journeyMilestones(beforeJourney, demoJourneyView(user.id, currentQuestion.topic)));
        }

        void kingdom.refresh();
        setIsAnswered(true);
        setCurrentQuestion(answeredQuestion);
        const claim = answeredQuestion.reward!;
        if (request === questionRequest.current) {
            setReward({ ...claim, collected: false });
        }

        try {
            const saved = await saveQuestion(user.id, answeredQuestion);
            if (request === questionRequest.current) {
                setCurrentQuestion(saved);
            }
        } catch (error) {
            console.error('Failed to save answered question:', error);
        }
    };

    const submitAnswer = (index: number) => {
        if (answeredRef.current) {
            return;
        }

        pendingAnswerRef.current = answerQuestion(index);
        return pendingAnswerRef.current;
    };

    const selectFromHistory = (item: HistoryItem) => {
        if (pendingRewardRef.current) {
            setView('learn');
            showPendingReward(pendingRewardRef.current);
            closeHistory();
            return;
        }

        questionRequest.current++;
        setIsLoadingQuestion(false);
        setView('learn');
        setReward(null);
        answeredRef.current = true;
        setSubmissionError(null);
        setCurrentQuestion(item);
        learningPath.current = { kind: 'topic', topic: item.topic };
        setLearningDone(null);
        setSelectedOption(item.selectedIndex ?? null);
        setIsAnswered(true);
        closeHistory();
        window.scrollTo({ top: 0, behavior: 'smooth' });
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

    const retryQuestion = () => fetchNewQuestion(
        retryTopic,
        retryTarget.current,
        retryPath.current,
        retryContinuation.current,
    );
    const refreshExpiredQuestion = () => currentQuestion && fetchNewQuestion(
        currentQuestion.topic,
        currentQuestion.graphNodeId
            ? { nodeId: currentQuestion.graphNodeId, facet: currentQuestion.graphFacet! }
            : retryTarget.current,
        learningPath.current,
    );
    const nextQuestion = () => fetchNewQuestion(undefined, undefined, learningPath.current, true);

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
