import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Question } from '../../types';
import type { JourneyTarget } from '../../../supabase/functions/_shared/journey';
import type { AnswerReward } from '../../components/game/LearningRewardCard';
import type { LearningPath } from '../../lib/kingdom/learningPath';

function useQuestionState() {
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [expiredQuestionId, setExpiredQuestionId] = useState<string | null>(null);
    const questionExpired = !isAnswered && !!currentQuestion?.id && currentQuestion.id === expiredQuestionId;
    return { currentQuestion, setCurrentQuestion, selectedOption, setSelectedOption, isAnswered, setIsAnswered,
        submissionError, setSubmissionError, expiredQuestionId, setExpiredQuestionId, questionExpired };
}

function useGenerationState() {
    const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
    const [pendingTopic, setPendingTopic] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [errorNeedsApiKey, setErrorNeedsApiKey] = useState(false);
    const [retryTopic, setRetryTopic] = useState<string | undefined>();
    const questionRequest = useRef(0);
    return { isLoadingQuestion, setIsLoadingQuestion, pendingTopic, setPendingTopic, errorMessage, setErrorMessage,
        errorNeedsApiKey, setErrorNeedsApiKey, retryTopic, setRetryTopic, questionRequest };
}

function useRewardState() {
    const [reward, setReward] = useState<AnswerReward | null>(null);
    const pendingRewardRef = useRef<Question | null>(null);
    const collectingRef = useRef(false);
    const [isCollecting, setIsCollecting] = useState(false);
    const [collectionError, setCollectionError] = useState<string | null>(null);
    const [pendingLoading, setPendingLoading] = useState(true);
    const [pendingLoadError, setPendingLoadError] = useState<string | null>(null);
    const [pendingReload, setPendingReload] = useState(0);
    return { reward, setReward, pendingRewardRef, collectingRef, isCollecting, setIsCollecting, collectionError,
        setCollectionError, pendingLoading, setPendingLoading, pendingLoadError, setPendingLoadError, pendingReload, setPendingReload };
}

function useJourneyState() {
    const [learningTopic, setLearningTopic] = useState('Life');
    const [journeyRevision, setJourneyRevision] = useState(0);
    const [knowledgeOnly, setKnowledgeOnly] = useState(false);
    const [milestones, setMilestones] = useState<string[]>([]);
    const retryTarget = useRef<JourneyTarget | undefined>();
    const learningPath = useRef<LearningPath>({ kind: 'random' });
    const retryPath = useRef<LearningPath>({ kind: 'random' });
    const retryContinuation = useRef(false);
    const [learningDone, setLearningDone] = useState<string | null>(null);
    return { learningTopic, setLearningTopic, journeyRevision, setJourneyRevision, knowledgeOnly, setKnowledgeOnly,
        milestones, setMilestones, retryTarget, learningPath, retryPath, retryContinuation, learningDone, setLearningDone };
}

function useSessionRefs(user: User | null) {
    const identityRef = useRef(user?.id);
    identityRef.current = user?.id;
    const answeredRef = useRef(false);
    const pendingAnswerRef = useRef<Promise<void>>(Promise.resolve());
    return { identityRef, answeredRef, pendingAnswerRef };
}

export function useLearningSessionState(user: User | null) {
    const question = useQuestionState();
    const generation = useGenerationState();
    const rewards = useRewardState();
    const journey = useJourneyState();
    const refs = useSessionRefs(user);
    const questionRequest = generation.questionRequest;
    useEffect(() => () => {
        questionRequest.current++;
    }, [questionRequest]);
    return { ...question, ...generation, ...rewards, ...journey, ...refs };
}

export type LearningSessionState = ReturnType<typeof useLearningSessionState>;
