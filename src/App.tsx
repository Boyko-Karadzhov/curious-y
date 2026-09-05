import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Key,
  Layers,
  ArrowRight,
  Loader2,
  AlertCircle,
  Settings as SettingsIcon,
  Shuffle,
} from 'lucide-react';
import { Question, HistoryItem, TOPICS } from './types';
import { useAuth } from './context/AuthContext';
import { useSettings } from './context/SettingsContext';
import { generateWhyQuestion } from './lib/llm/factory';
import {
  saveQuestion,
  getQuestionHistory,
  updateConceptAnswer,
  resetUserProgress,
  shouldConfirmReset,
} from './services/database';
import { Navbar } from './components/layout/Navbar';
import { LoginModal } from './components/auth/LoginModal';
import { QuestionCard } from './components/question/QuestionCard';
import { FollowUpChat } from './components/chat/FollowUpChat';
import { SettingsModal } from './components/settings/SettingsModal';
import { HistoryModal } from './components/history/HistoryModal';
import { ConceptsModal } from './components/concepts/ConceptsModal';
import { TopicBadge } from './components/question/TopicBadge';
import { TopicSelectionPrompt } from './components/home/TopicSelectionPrompt';
import { KingdomPanel } from './components/game/KingdomPanel';
import { useKingdom } from './lib/kingdom/useKingdom';
import { castleCost, formatCost } from './lib/kingdom/game';
import { generateServerQuestion, submitServerAnswer, getServerPendingReward, collectServerReward } from './services/backend';
import { LearningRequestError, missingGeminiKey } from './services/learningErrors';
import { ResourceBar } from './components/game/ResourceBar';
import { QuestRail } from './components/game/QuestRail';
import { AnswerReward } from './components/game/LearningRewardCard';
import { collectResources } from './components/game/collectResources';
import { loadPendingReward, savePendingReward, clearPendingReward } from './lib/kingdom/pendingReward';

export const AppContent: React.FC = () => {
  const { user, loading: authLoading, isDemoUser } = useAuth();
  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const kingdom = useKingdom(user?.id, isDemoUser);
  const [view, setView] = useState<'learn' | 'castle'>('learn');
  const [reward, setReward] = useState<AnswerReward | null>(null);
  const pendingRewardRef = React.useRef<Question | null>(null);
  const identityRef = React.useRef(user?.id);
  identityRef.current = user?.id;
  const collectingRef = React.useRef(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingLoadError, setPendingLoadError] = useState<string | null>(null);
  const [pendingReload, setPendingReload] = useState(0);
  const questionRequest = React.useRef(0);
  const answeredRef = React.useRef(false);
  const pendingAnswerRef = React.useRef<Promise<void>>(Promise.resolve());
  const resettingRef = React.useRef(false);
  const [resetError, setResetError] = useState<string | null>(null);
  React.useEffect(() => () => { questionRequest.current++; }, []);

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState<boolean>(false);
  const [pendingTopic, setPendingTopic] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorNeedsApiKey, setErrorNeedsApiKey] = useState(false);
  const [retryTopic, setRetryTopic] = useState<string | undefined>();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [expiredQuestionId, setExpiredQuestionId] = useState<string | null>(null);
  const questionExpired = !isAnswered && !!currentQuestion?.id && currentQuestion.id === expiredQuestionId;

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [conceptsOpen, setConceptsOpen] = useState<boolean>(false);

  const recentQuestionsRef = React.useRef<string[]>([]);
  const currentQuestionRef = React.useRef<Question | null>(null);
  currentQuestionRef.current = currentQuestion;

  const hasApiKey = settings.hasApiKey;

  const showPendingReward = useCallback((question: Question) => {
    pendingRewardRef.current = question;
    questionRequest.current++;
    answeredRef.current = true;
    setIsLoadingQuestion(false);
    setCurrentQuestion(question);
    setSelectedOption(question.selectedIndex ?? null);
    setIsAnswered(true);
    setReward({ id: question.id!, topic: question.topic, correct: question.isCorrect === true, collected: false });
    setErrorMessage(null);
  }, []);

  React.useEffect(() => {
    let active = true;
    questionRequest.current++;
    pendingRewardRef.current = null;
    setReward(null);
    setCurrentQuestion(null);
    setPendingLoading(true);
    setPendingLoadError(null);
    if (!user?.id) return;
    const restore = async () => {
      const request = questionRequest.current;
      try {
        const pending = isDemoUser ? loadPendingReward(user.id) : await getServerPendingReward();
        if (!active || request !== questionRequest.current) return;
        if (pending) showPendingReward(pending);
        else if (pendingRewardRef.current) {
          pendingRewardRef.current = null;
          setReward(null);
          setCollectionError(null);
        }
        setPendingLoadError(null);
      } catch {
        if (active && request === questionRequest.current) setPendingLoadError('Could not check your uncollected Resources. Retry to continue.');
      } finally { if (active) setPendingLoading(false); }
    };
    void restore();
    const refreshPending = () => { if (!collectingRef.current && !resettingRef.current) void restore(); };
    window.addEventListener('focus', refreshPending);
    window.addEventListener('storage', refreshPending);
    return () => { active = false; window.removeEventListener('focus', refreshPending); window.removeEventListener('storage', refreshPending); };
  }, [user?.id, isDemoUser, pendingReload, showPendingReward]);

  const handleCollect = async (source: HTMLButtonElement) => {
    const pending = pendingRewardRef.current;
    if (!user || !pending || collectingRef.current || resettingRef.current) return;
    collectingRef.current = true;
    questionRequest.current++;
    setIsCollecting(true);
    setCollectionError(null);
    try {
      if (isDemoUser) {
        const saved = await kingdom.act({ type: 'answer', id: pending.id!, topic: pending.topic, correct: pending.isCorrect === true });
        if (!saved) throw new Error('Could not save your Resources. Click Collect to retry.');
        clearPendingReward(user.id);
      } else {
        kingdom.applyServer(await collectServerReward(pending.id!));
      }
      if (identityRef.current !== user.id) return;
      // Animation is decorative: a browser animation failure must not undo a saved collection.
      try { await collectResources(source, pending.topic); } catch { /* Already collected. */ }
      pendingRewardRef.current = null;
      setReward(current => current && current.id === pending.id ? { ...current, collected: true } : current);
    } catch (error) {
      if (identityRef.current === user.id) setCollectionError(error instanceof Error ? error.message : 'Could not collect. Please retry.');
    } finally { collectingRef.current = false; setIsCollecting(false); }
  };

  const handleResetHome = useCallback(() => {
    if (pendingRewardRef.current) {
      setView('learn');
      showPendingReward(pendingRewardRef.current);
      return;
    }
    questionRequest.current++;
    setIsLoadingQuestion(false);
    setPendingTopic(null);
    setView('learn');
    setReward(null);
    setCurrentQuestion(null);
    setSelectedOption(null);
    setIsAnswered(false);
    setErrorMessage(null);
    setSubmissionError(null);
  }, [showPendingReward]);

  const handleResetProgress = useCallback(async () => {
    if (!user || collectingRef.current) return;
    if (!shouldConfirmReset()) return;
    resettingRef.current = true;
    questionRequest.current++;
    setIsLoadingQuestion(false);
    try {
      await pendingAnswerRef.current;
      await resetUserProgress(user.id);
      pendingRewardRef.current = null;
      setCollectionError(null);
      questionRequest.current++;
      setIsLoadingQuestion(false);
      setReward(null);
      recentQuestionsRef.current = [];

      setCurrentQuestion(null);
      setSelectedOption(null);
      setIsAnswered(false);
      setErrorMessage(null);
      setPendingTopic(null);
      setResetError(null);
      setSubmissionError(null);
    } catch (err) {
      console.error('Failed to reset progress in App:', err);
      setResetError('Progress could not be reset. Please retry.');
    } finally {
      resettingRef.current = false;
    }
  }, [user]);

  // Generate a new Why question
  const fetchNewQuestion = useCallback(async (specificTopic?: string) => {
    if (!user || resettingRef.current || pendingLoading || pendingLoadError || (!isDemoUser && settingsLoading)) return;
    if (pendingRewardRef.current) { showPendingReward(pendingRewardRef.current); return; }
    const request = ++questionRequest.current;
    setRetryTopic(specificTopic);

    // For a real authenticated user without an API key, do not generate sample questions; prompt for configuration
    if (!isDemoUser && !settings.hasApiKey && !settingsError) {
      setErrorMessage(missingGeminiKey().message);
      setErrorNeedsApiKey(true);
      setSettingsOpen(true);
      setIsLoadingQuestion(false);
      return;
    }

    setPendingTopic(specificTopic || null);
    setIsLoadingQuestion(true);
    setErrorMessage(null);
    setErrorNeedsApiKey(false);

    try {
      // Collect recent question history to ensure novelty and prevent repetitions
      let historyQuestions: string[] = [];
      try {
        const historyItems = await getQuestionHistory(user.id);
        historyQuestions = historyItems.map((h) => h.questionText);
      } catch (e) {
        console.warn('Could not fetch history for prompt diversity:', e);
      }

      const recentList = Array.from(new Set([...recentQuestionsRef.current, ...historyQuestions]));

      // Determine topic: if no specificTopic is provided and we currently have a question, rotate topic if multiple topics exist
      const topicsList = TOPICS;
      let chosenTopic = specificTopic;
      if (!chosenTopic && topicsList.length > 1 && currentQuestionRef.current) {
        const otherTopics = topicsList.filter(
          (t) => t.toLowerCase() !== currentQuestionRef.current?.topic.toLowerCase()
        );
        if (otherTopics.length > 0) {
          chosenTopic = otherTopics[Math.floor(Math.random() * otherTopics.length)];
        }
      }

      // Generate via LLM factory
      setRetryTopic(chosenTopic);
      const generated = isDemoUser ? await generateWhyQuestion(
        { apiKey: '', hasApiKey: false },
        chosenTopic,
        isDemoUser,
        recentList,
        user.id
      ) : await generateServerQuestion(chosenTopic);

      if (generated.questionText) {
        recentQuestionsRef.current = [generated.questionText, ...recentQuestionsRef.current.slice(0, 20)];
      }

      // Only hold in memory - DO NOT persist unanswered questions to history
      if (request !== questionRequest.current) return;
      // The backend-issued ID is required to submit and verify a live answer.
      setCurrentQuestion({ ...generated, id: generated.id ?? crypto.randomUUID() });
      answeredRef.current = false;
      setReward(null);
      setSubmissionError(null);
      setSelectedOption(null);
      setIsAnswered(false);
    } catch (err: unknown) {
      if (request !== questionRequest.current) return;
      console.error('Failed to generate question:', err);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while generating question.';
      setErrorMessage(msg);
      setErrorNeedsApiKey(err instanceof LearningRequestError && err.needsApiKey);
    } finally {
      if (request === questionRequest.current) {
        setIsLoadingQuestion(false);
        setPendingTopic(null);
      }
    }
  }, [user, isDemoUser, settings, settingsLoading, settingsError, pendingLoading, pendingLoadError, showPendingReward]);

  // Handle answering question
  const answerQuestion = async (index: number) => {
    if (!user || !currentQuestion || isAnswered || questionExpired || answeredRef.current || isLoadingQuestion || resettingRef.current) return;
    answeredRef.current = true;
    const request = ++questionRequest.current;

    setSelectedOption(index);
    setSubmissionError(null);
    if (!isDemoUser) {
      try {
        const result = await submitServerAnswer(currentQuestion.id!, index);
        if (identityRef.current !== user.id) return;
        const claim = { id: result.question.id!, topic: result.question.topic, correct: result.question.isCorrect === true };
        kingdom.applyServer(result.kingdom);
        if (!result.collected && !resettingRef.current) pendingRewardRef.current = result.question;
        if (request !== questionRequest.current) {
          if (!result.collected && !resettingRef.current) showPendingReward(result.question);
          return;
        }
        setCurrentQuestion(result.question);
        setSelectedOption(result.question.selectedIndex ?? index);
        setIsAnswered(true);
        setReward({ ...claim, collected: result.collected });
        setErrorMessage(null);
      } catch (err) {
        if (request !== questionRequest.current) return;
        answeredRef.current = false;
        setSelectedOption(null);
        if (err instanceof LearningRequestError && err.questionExpired) {
          setExpiredQuestionId(currentQuestion.id!);
          setSubmissionError(null);
          return;
        }
        setSubmissionError(err instanceof Error ? err.message : 'Could not submit answer.');
      }
      return;
    }
    const isCorrect = index === currentQuestion.correctIndex;
    const answeredQuestion: Question = {
      ...currentQuestion,
      selectedIndex: index,
      isCorrect,
    };

    try { savePendingReward(user.id, answeredQuestion); }
    catch {
      answeredRef.current = false;
      setSelectedOption(null);
      setSubmissionError('Your pending Resources could not be saved. Free browser storage and try again.');
      return;
    }
    pendingRewardRef.current = answeredQuestion;
    setIsAnswered(true);
    setCurrentQuestion(answeredQuestion);
    const claim = { id: currentQuestion.id!, topic: currentQuestion.topic, correct: isCorrect };
    if (request === questionRequest.current) setReward({ ...claim, collected: false });

    if (isCorrect) {
      // Answering a question correctly on a Concept within a specific reasoning complexity increases the respective reasoningTrack number
      if (currentQuestion.concept && currentQuestion.reasoningComplexity) {
        try {
          await updateConceptAnswer(user.id, currentQuestion.concept, currentQuestion.reasoningComplexity);
        } catch (err) {
          console.warn('Failed to update concept reasoning track:', err);
        }
      }
    }

    // Persist answered question to Supabase or localStorage
    try {
      const saved = await saveQuestion(user.id, answeredQuestion);
      if (request === questionRequest.current) setCurrentQuestion(saved);
    } catch (err) {
      console.error('Failed to save answered question:', err);
    }
  };

  const handleAnswerQuestion = (index: number) => {
    if (answeredRef.current) return;
    pendingAnswerRef.current = answerQuestion(index);
    return pendingAnswerRef.current;
  };

  const handleSelectFromHistory = (item: HistoryItem) => {
    if (pendingRewardRef.current) {
      setView('learn');
      showPendingReward(pendingRewardRef.current);
      setHistoryOpen(false);
      return;
    }
    questionRequest.current++;
    setIsLoadingQuestion(false);
    setView('learn');
    setReward(null);
    answeredRef.current = true;
    setSubmissionError(null);
    setCurrentQuestion(item);
    setSelectedOption(item.selectedIndex ?? null);
    setIsAnswered(true);
    setHistoryOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToChat = () => {
    setTimeout(() => {
      const chatElem = document.getElementById('follow-up-chat-section');
      if (chatElem) {
        chatElem.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center font-black text-xl mb-4 shadow-lg shadow-brand-500/50 animate-bounce-short">
          ?Y
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-brand-400 mb-2" />
        <p className="text-sm font-medium text-slate-300">Loading Curious-Y...</p>
      </div>
    );
  }

  // Not authenticated? Show login screen
  if (!user) {
    return <LoginModal />;
  }

  return (
    <div className="kingdom-app min-h-screen flex flex-col text-slate-900 selection:bg-amber-300 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenConcepts={() => setConceptsOpen(true)}
        onGoHome={handleResetHome}
        onResetProgress={handleResetProgress}
      />
      <ResourceBar state={kingdom.state} unavailable={kingdom.unavailable} />

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
          <nav aria-label="Learning and Castle" className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button type="button" aria-pressed={view === 'learn'} onClick={() => setView('learn')} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === 'learn' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Learn</button>
              <button type="button" aria-pressed={view === 'castle'} onClick={() => setView('castle')} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === 'castle' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Castle · Level {kingdom.state.castle}</button>
            </div>
            <p className="text-sm font-bold text-amber-800">{kingdom.state.gold} Gold · {Object.values(kingdom.state.tokens).reduce((a, b) => a + b, 0)} Resources</p>
          </nav>
          <p className="text-xs text-slate-500">{view === 'learn' ? `Learn for Resources, win battles for Gold, and upgrade your Castle. Next Castle upgrade: ${kingdom.state.castle < 5 ? `${formatCost(castleCost(kingdom.state.castle))}` : 'maximum level reached'}. ` : ''}Castle saves on this device; cloud sync is not implemented.</p>
        </div>
        {kingdom.error && <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">{kingdom.error}{kingdom.unavailable && <button type="button" className="ml-3 underline font-bold" onClick={() => void kingdom.refresh()}>Reload Castle</button>}</div>}
        {resetError && <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">{resetError}</div>}
        {!isDemoUser && settingsError && <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{settingsError}</div>}
        {view === 'castle' ? <KingdomPanel state={kingdom.state} act={kingdom.act} unavailable={kingdom.unavailable} serverBacked={kingdom.serverBacked} onLearn={handleResetHome} /> : <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_260px]"><div id="learning-deck" className="min-w-0 space-y-6">
        {/* Banner if API key is not configured */}
        {!hasApiKey && !settingsLoading && !settingsError && (
          <div className="bg-white bg-gradient-to-r from-amber-500/10 via-brand-500/10 to-indigo-500/10 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-slate-900">
                  {isDemoUser ? 'Explorer Preview Mode' : 'Configure Your Gemini API Key'}
                </h3>
                <p className="text-xs text-slate-600">
                  {isDemoUser
                    ? 'Local sample questions and scripted tutor replies. Sign in with Google for live Gemini learning.'
                    : 'Live questions and answers are verified by the learning backend. Add your Gemini API key in Settings.'}
                </p>
              </div>
            </div>

            {!isDemoUser && <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-xs shadow-xs transition-all shrink-0 cursor-pointer"
            >
              <span>{hasApiKey ? 'Settings' : 'Add API Key'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>}
          </div>
        )}

        {/* Active Topics Bar (Visible when question is active for quick switching) */}
        {currentQuestion && (!reward || reward.collected) && !isCollecting && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2 py-0.5 flex-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand-600" />
                Topics:
              </span>
              <button
                type="button"
                disabled={isLoadingQuestion}
                onClick={() => fetchNewQuestion()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 hover:text-brand-600 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                title="Select random topic"
              >
                <Shuffle className="w-3 h-3 text-brand-600" />
                <span>Random</span>
              </button>
              {TOPICS.map((topic) => (
                <TopicBadge
                  key={topic}
                  topic={topic}
                  size="sm"
                  interactive
                  selected={currentQuestion?.topic === topic}
                  onClick={() => !isLoadingQuestion && fetchNewQuestion(topic)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleResetHome}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-600 transition-colors cursor-pointer shrink-0 self-end sm:self-center"
              title="Return to topic picker"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Choose Topic</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs sm:text-sm flex flex-wrap items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">{errorNeedsApiKey ? 'Check your Gemini key' : 'Couldn’t load a question'}</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
            {errorNeedsApiKey && <button type="button" onClick={() => setSettingsOpen(true)} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 cursor-pointer">Open Settings</button>}
            <button
              type="button"
              onClick={() => fetchNewQuestion(retryTopic)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition-colors shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Real User without API Key Onboarding Card */}
        {pendingLoading ? <div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-600">Checking for uncollected Resources…</div> : pendingLoadError ? <div role="alert" className="rounded-2xl bg-white p-6 text-sm text-rose-700">{pendingLoadError}<button type="button" onClick={() => setPendingReload(value => value + 1)} className="ml-3 font-bold underline">Retry Resources</button></div> : settingsLoading && !isDemoUser && !currentQuestion ? <div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-600">Checking your Gemini connection…</div> : !hasApiKey && !settingsError && !isDemoUser && !currentQuestion && !isLoadingQuestion ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center mx-auto shadow-2xs">
              <Key className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h2 className="text-xl font-bold text-slate-900">
                Add your Gemini key to get started
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Add your Gemini API key to generate live questions. Your key is encrypted in Supabase Vault; answers are checked by the learning backend.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="px-6 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-bold text-sm shadow-md shadow-brand-500/20 inline-flex items-center gap-2 transition-all cursor-pointer"
              >
                <SettingsIcon className="w-4 h-4" />
                <span>Configure Gemini Settings</span>
              </button>
            </div>
          </div>
        ) : isLoadingQuestion && !currentQuestion ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center mx-auto shadow-2xs">
              <Sparkles className="w-6 h-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-800">
                {isDemoUser ? 'Preparing' : 'Generating'} your &quot;Why&quot; question {pendingTopic ? `in ${pendingTopic}` : 'across all topics'}...
              </h3>
              <p className="text-xs text-slate-500">
                {isDemoUser ? 'Choosing a sample question for your learning journey' : 'Gemini is preparing choices and an intuitive explanation'}
              </p>
            </div>
          </div>
        ) : currentQuestion ? (
          <div className="space-y-6">
            {questionExpired && <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
              <div><p className="font-bold">Ready for a fresh question?</p><p className="mt-1">This question timed out while you were away. Your progress is safe. This answer wasn’t scored, and no Resources were added or taken away.</p></div>
              <button type="button" disabled={isLoadingQuestion} onClick={() => fetchNewQuestion(currentQuestion.topic)} className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white hover:bg-brand-700 disabled:opacity-50">{isLoadingQuestion ? 'Getting a fresh question…' : 'Get a fresh question'}</button>
            </div>}
            {submissionError && <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800"><p>{submissionError}</p><p className="mt-1 font-bold">Select the same answer again to recover the result. Each question earns Resources only once.</p></div>}
            <QuestionCard
              reward={reward}
              isCollecting={isCollecting}
              onCollect={source => void handleCollect(source)}
              collectionError={collectionError}
              question={currentQuestion}
              isAnswered={isAnswered}
              isExpired={questionExpired}
              selectedOption={selectedOption}
              onAnswer={handleAnswerQuestion}
              onNextQuestion={fetchNewQuestion}
              onChooseTopic={handleResetHome}
              isLoadingNext={isLoadingQuestion}
              availableTopics={TOPICS as unknown as string[]}
              onScrollToChat={scrollToChat}
            />

            {/* Follow-up Chat Session (Active after question answered) */}
            {isAnswered && (
              <div className="pt-2 animate-fade-in">
                <FollowUpChat question={currentQuestion} />
              </div>
            )}
          </div>
        ) : (
          <TopicSelectionPrompt
            onSelectTopic={(topic) => fetchNewQuestion(topic)}
            isLoading={isLoadingQuestion}
          />
        )}
        </div><QuestRail state={kingdom.state} onCastle={() => setView('castle')} /></div>}
      </main>

      {/* Footer */}
      <footer className="bg-[#091724] border-t border-white/10 py-6 text-center text-xs text-slate-400">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-bold text-slate-200">Curious-Y Kingdoms</span>
            <span>&bull;</span>
            <span>Knowledge builds the kingdom</span>
          </div>
          <div className="text-slate-400">
            {isDemoUser ? 'Explorer demo · Sample learning' : 'Server-verified learning · Powered by Gemini'}
          </div>
        </div>
      </footer>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onResetProgress={handleResetProgress}
      />
      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelectQuestion={handleSelectFromHistory}
        onResetProgress={handleResetProgress}
      />
      <ConceptsModal
        isOpen={conceptsOpen}
        onClose={() => setConceptsOpen(false)}
        onResetProgress={handleResetProgress}
      />
    </div>
  );
};

export const App: React.FC = () => {
  const { user } = useAuth();
  return <AppContent key={user?.id ?? 'signed-out'} />;
};

export default App;
