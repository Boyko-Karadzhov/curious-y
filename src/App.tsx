import React, { useState, useCallback } from 'react';
import {
  Swords,
  Castle,
  BookOpen,
  Key,
  ArrowRight,
  Loader2,
  AlertCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Question, HistoryItem, TOPICS, TopicName } from './types';
import { useAuth } from './context/AuthContext';
import { useSettings } from './context/SettingsContext';
import {
  saveQuestion,
  getLocalConcepts,
  resetUserProgress,
  shouldConfirmReset,
} from './services/database';
import { Navbar } from './components/layout/Navbar';
import { LoginModal } from './components/auth/LoginModal';
import { QuestionCard } from './components/question/QuestionCard';
import { QuestionGeneration } from './components/question/QuestionGeneration';
import { FollowUpChat } from './components/chat/FollowUpChat';
import { SettingsModal } from './components/settings/SettingsModal';
import { HistoryModal } from './components/history/HistoryModal';
import { JourneyExplorer } from './components/concepts/JourneyExplorer';
import type { JourneyTarget } from '../supabase/functions/_shared/journey';
import { journeyMilestones } from '../supabase/functions/_shared/journey';
import { generateDemoJourneyQuestion } from './lib/kingdom/demoJourneyQuestions';
import { KingdomPanel } from './components/game/KingdomPanel';
import { BattlePanel } from './components/kingdom/BattlePanel';
import { useKingdom } from './lib/kingdom/useKingdom';
import { useProgressionGoal } from './lib/kingdom/useProgressionGoal';
import { ProgressionGoalCard } from './components/game/ProgressionGoalCard';
import { FirstBarracksPrompt } from './components/game/FirstBarracksPrompt';
import { AvailableActionIndicator } from './components/kingdom/AvailableActionIndicator';
import { hasAvailableCastleAction } from './lib/kingdom/availability';
import { BUILDINGS, UpgradeAction } from './lib/kingdom/game';
import { generateJourneyQuestion, submitServerAnswer, getServerPendingReward, collectServerReward } from './services/backend';
import { LearningRequestError, missingGeminiKey } from './services/learningErrors';
import { ResourceBar } from './components/game/ResourceBar';
import { QuestRail } from './components/game/QuestRail';
import { normalizeTopicWeights } from '../supabase/functions/_shared/resources';
import { answerDemoQuestion, demoGeneration, demoJourneyView } from './lib/kingdom/demoLearning';
import { findConcept } from './lib/concepts/registry';
import { AnswerReward } from './components/game/LearningRewardCard';
import { collectResources } from './components/game/collectResources';
import { loadPendingReward } from './lib/kingdom/pendingReward';

export const AppContent: React.FC = () => {
  const { user, loading: authLoading, isDemoUser } = useAuth();
  const { settings, loading: settingsLoading, error: settingsError } = useSettings();
  const kingdom = useKingdom(user?.id, isDemoUser);
  const goalPreference = useProgressionGoal(user?.id, kingdom.state, kingdom.unavailable, isDemoUser);
  const [navigationFocus, setNavigationFocus] = useState(0);
  const [view, setView] = useState<'battle' | 'castle' | 'learn'>('battle');
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
  const [learningTopic, setLearningTopic] = useState('Life');
  const [journeyRevision, setJourneyRevision] = useState(0);
  const [knowledgeOnly, setKnowledgeOnly] = useState(false);
  const [milestones, setMilestones] = useState<string[]>([]);
  const retryTarget = React.useRef<JourneyTarget | undefined>();

  const recentQuestionsRef = React.useRef<string[]>([]);
  const currentQuestionRef = React.useRef<Question | null>(null);
  currentQuestionRef.current = currentQuestion;

  const hasApiKey = settings.hasApiKey;

  const showPendingReward = useCallback((question: Question) => {
    if (!question.reward) throw new Error('Reward breakdown is unavailable. Refresh to retry.');
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
      let collectedReward = pending.reward!;
      if (isDemoUser) {
        const saved = await kingdom.act({ type: 'answer', id: pending.id!, topic: pending.topic, correct: pending.isCorrect === true, reward: pending.reward });
        if (!saved) throw new Error('Could not save your Resources. Click Collect to retry.');
      } else {
        const collected = await collectServerReward(pending.id!);
        kingdom.applyServer(collected);
        collectedReward = collected.reward;
      }
      if (identityRef.current !== user.id) return;
      // Animation is decorative: a browser animation failure must not undo a saved collection.
      void collectResources(source, collectedReward.lines).catch(() => {});
      pendingRewardRef.current = null;
      setReward(current => current && current.id === pending.id ? { ...collectedReward, collected: true } : current);
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
      setJourneyRevision(x => x + 1);
      setSubmissionError(null);
    } catch (err) {
      console.error('Failed to reset progress in App:', err);
      setResetError('Progress could not be reset. Please retry.');
    } finally {
      resettingRef.current = false;
    }
  }, [user]);

  // Generate a new Why question
  const fetchNewQuestion = useCallback(async (specificTopic?: string, target?: JourneyTarget) => {
    if (!target) { if (specificTopic) setLearningTopic(specificTopic); handleResetHome(); return; }
    retryTarget.current = target;
    setMilestones([]);
    setKnowledgeOnly(false);
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
    const generationStarted = performance.now();

    try {
      const chosenTopic = specificTopic ?? learningTopic;
      setRetryTopic(chosenTopic);
      const localGeneration = isDemoUser ? demoGeneration(user.id) : undefined;
      const generated = isDemoUser
        ? await generateDemoJourneyQuestion(user.id, chosenTopic, target)
        : await generateJourneyQuestion(target);

      if (generated.questionText) {
        recentQuestionsRef.current = [generated.questionText, ...recentQuestionsRef.current.slice(0, 20)];
      }

      // Only hold in memory - DO NOT persist unanswered questions to history
      // Give fast responses one brief forge beat; slow responses incur no extra wait.
      const revealDelay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : Math.max(0, 650 - (performance.now() - generationStarted));
      if (revealDelay) await new Promise(resolve => window.setTimeout(resolve, revealDelay));
      if (request !== questionRequest.current) return;
      // The backend-issued ID is required to submit and verify a live answer.
      setCurrentQuestion({ ...generated, id: generated.id ?? crypto.randomUUID(),
        ...(isDemoUser ? { demoGeneration: localGeneration, topicWeights: normalizeTopicWeights(
          findConcept(generated.concept ?? '', getLocalConcepts(user.id))?.topics ?? generated.topicWeights, generated.topic) } : {}) });
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
  }, [user, isDemoUser, settings, settingsLoading, settingsError, pendingLoading, pendingLoadError, showPendingReward, learningTopic, handleResetHome]);

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
        const claim = result.reward;
        result.question = { ...result.question, reward: claim };
        kingdom.applyServer(result.kingdom);
        if (!result.collected && !resettingRef.current) pendingRewardRef.current = result.question;
        if (request !== questionRequest.current) {
          if (!result.collected && !resettingRef.current) showPendingReward(result.question);
          return;
        }
        setJourneyRevision(x => x + 1);
        setMilestones(result.milestones ?? []);
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
    const beforeJourney = currentQuestion.journeyId ? demoJourneyView(user.id, currentQuestion.topic) : null;
    let answeredQuestion: Question;
    try { answeredQuestion = await answerDemoQuestion(user.id, currentQuestion, index, getLocalConcepts(user.id)); }
    catch {
      answeredRef.current = false;
      setSelectedOption(null);
      setSubmissionError('Your pending Resources could not be saved. Free browser storage and try again.');
      return;
    }
    if (identityRef.current !== user.id || request !== questionRequest.current) return;
    pendingRewardRef.current = answeredQuestion;
    setJourneyRevision(x => x + 1);
    if (beforeJourney) setMilestones(journeyMilestones(beforeJourney, demoJourneyView(user.id, currentQuestion.topic)));
    void kingdom.refresh(); // Earned tower progress is visible before Resources are collected.
    setIsAnswered(true);
    setCurrentQuestion(answeredQuestion);
    const claim = answeredQuestion.reward!;
    if (request === questionRequest.current) setReward({ ...claim, collected: false });

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

  const learningBlocked = pendingLoading ? 'Checking for uncollected Resources…'
    : pendingLoadError ? 'Retry the Resources check in Learn before continuing.'
    : isLoadingQuestion ? 'A question is being generated. Wait for it to finish.'
    : isCollecting ? 'Saving your collected Resources…'
    : selectedOption !== null && !isAnswered && !questionExpired ? 'Your answer is being submitted…'
    : !isDemoUser && settingsLoading ? 'Checking your Gemini connection…' : null;
  const upgradeDestination = React.useRef('kingdom-castle');
  const battleDestination = React.useRef('kingdom-battle');
  const openBattle = (slot?: number) => { battleDestination.current = slot === undefined ? 'kingdom-battle' : `army-square-${slot}`; setView('battle'); setNavigationFocus(value => value + 1); };
  const learnForGoal = (topic: TopicName) => {
    if (learningBlocked) return;
    setView('learn');
    if (!isDemoUser && !settings.hasApiKey && !settingsError) { setSettingsOpen(true); return; }
    setNavigationFocus(value => value + 1);
    setLearningTopic(topic);
    setKnowledgeOnly(false);
    handleResetHome();
  };
  React.useEffect(() => {
    if (!navigationFocus || settingsOpen) return;
    const target = document.getElementById(view === 'learn' ? 'learning-deck' : view === 'battle' ? battleDestination.current : upgradeDestination.current);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [navigationFocus, view, settingsOpen]);
  const goal = goalPreference.goal;
  const castleActionAvailable = !kingdom.unavailable && hasAvailableCastleAction(kingdom.state);
  const navigateUpgrade = (action: UpgradeAction) => { upgradeDestination.current = action.type === 'castle' ? 'kingdom-castle' : `kingdom-building-${action.id}`; setView('castle'); setNavigationFocus(value => value + 1); };
  const firstArmyPrompt = goalPreference.loaded && !kingdom.unavailable && goal?.type === 'building' && goal.id === 'barracks' && goal.level === 1
    && !kingdom.state.battle && kingdom.state.cleared === 0 && !BUILDINGS.some(building => kingdom.state.buildings[building.id] > 0)
    ? <FirstBarracksPrompt state={kingdom.state} learningBlocked={learningBlocked} preferenceSaving={goalPreference.saving}
      pendingReward={!!reward && !reward.collected} onLearn={() => learnForGoal(kingdom.state.tokens.Life < 5 ? 'Life' : 'Earth & Space')} onNavigateUpgrade={navigateUpgrade} /> : null;
  const goalCard = <ProgressionGoalCard state={kingdom.state} goal={goal} onSelect={goalPreference.select}
    unavailable={kingdom.unavailable} preferenceError={goalPreference.error}
    preferenceLoaded={goalPreference.loaded} preferenceSaving={goalPreference.saving} onRetryPreference={isDemoUser ? undefined : goalPreference.retry}
    learningBlocked={learningBlocked} pendingReward={!!reward && !reward.collected}
    onLearnTopic={learnForGoal} onBattle={() => openBattle()} onNavigateUpgrade={navigateUpgrade} />;

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
        onOpenConcepts={() => { handleResetHome(); setKnowledgeOnly(true); }}
        onGoHome={handleResetHome}
        onResetProgress={handleResetProgress}
      />
      <ResourceBar state={kingdom.state} unavailable={kingdom.unavailable} />

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
          <nav aria-label="Battle, Castle and Learn" className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={view === 'battle'} onClick={() => setView('battle')} className={`inline-flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-sm font-bold ${view === 'battle' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}><Swords aria-hidden="true" className="h-4 w-4 shrink-0" />Battle</button>
              <button type="button" aria-pressed={view === 'castle'} aria-description={castleActionAvailable ? 'Castle actions available' : undefined} onClick={() => setView('castle')} className={`inline-flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-sm font-bold ${view === 'castle' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}><Castle aria-hidden="true" className="h-4 w-4 shrink-0" />Castle · Level {kingdom.state.castle}{castleActionAvailable && <AvailableActionIndicator label="Castle actions available" />}</button>
              <button type="button" aria-pressed={view === 'learn'} onClick={() => setView('learn')} className={`inline-flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-sm font-bold ${view === 'learn' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}><BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" />Learn</button>
            </div>
            <p className="text-sm font-bold text-amber-800">{kingdom.state.gold} Gold · {Object.values(kingdom.state.tokens).reduce((a, b) => a + b, 0)} Resources</p>
          </nav>
          <p className="text-xs text-slate-500">{isDemoUser ? 'Explorer Demo · Castle progress saves to this browser.' : 'Your Castle, Resources, and campaign save securely to your account.'}</p>
        </div>
        {kingdom.error && <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">{kingdom.error}<button type="button" className="ml-3 underline font-bold" onClick={() => void kingdom.retryPending()}>Retry Castle action</button>{kingdom.unavailable && <button type="button" className="ml-3 underline font-bold" onClick={() => void kingdom.refresh()}>Reload Castle</button>}</div>}
        {resetError && <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">{resetError}</div>}
        {!isDemoUser && settingsError && <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{settingsError}</div>}
        {view === 'battle' ? <BattlePanel state={kingdom.state} act={kingdom.act} unavailable={kingdom.unavailable} onLearn={handleResetHome} firstArmyPrompt={firstArmyPrompt} /> : view === 'castle' ? <KingdomPanel onLearnTopic={learnForGoal} learningBlocked={learningBlocked} pendingReward={!!reward && !reward.collected} state={kingdom.state} act={kingdom.act} unavailable={kingdom.unavailable} serverBacked={kingdom.serverBacked} onLearn={handleResetHome} onPrepareArmy={openBattle} goalCard={goalCard} onSelectGoal={goalPreference.loaded && !goalPreference.saving ? goalPreference.select : undefined} /> : <div className="flex flex-col gap-5"><QuestRail castleActionAvailable={castleActionAvailable} onLearnTopic={learnForGoal} learningBlocked={kingdom.unavailable ? "Checking Castle progress…" : learningBlocked} pendingReward={!!reward && !reward.collected} state={kingdom.state} onCastle={() => setView('castle')} goalCard={goalCard} /><div id="learning-deck" tabIndex={-1} className="min-w-0 space-y-6 order-first w-full">
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
              onClick={() => fetchNewQuestion(retryTopic, retryTarget.current)}
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
        ) : isLoadingQuestion ? (
          <QuestionGeneration topic={pendingTopic} isDemo={isDemoUser} />
        ) : currentQuestion ? (
          <div key={currentQuestion.id} className={`space-y-6 ${!isAnswered ? 'question-arrival' : ''}`}>
            {questionExpired && <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
              <div><p className="font-bold">Ready for a fresh question?</p><p className="mt-1">This question timed out while you were away. Your progress is safe. This answer wasn’t scored, and no Resources were added or taken away.</p></div>
              <button type="button" disabled={isLoadingQuestion} onClick={() => fetchNewQuestion(currentQuestion.topic, currentQuestion.journeyId ? { journeyId: currentQuestion.journeyId, nodeId: currentQuestion.journeyNodeId!, facet: currentQuestion.journeyFacet! } : retryTarget.current)} className="rounded-xl bg-brand-600 px-4 py-2 font-bold text-white hover:bg-brand-700 disabled:opacity-50">{isLoadingQuestion ? 'Getting a fresh question…' : 'Get a fresh question'}</button>
            </div>}
            {submissionError && <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800"><p>{submissionError}</p><p className="mt-1 font-bold">Select the same answer again to recover the result. Each question earns Resources only once.</p></div>}
            {milestones.length > 0 && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 space-y-1">{milestones.map(m => <p key={m} className="text-sm font-semibold">✦ {m}</p>)}</div>}
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
              onNextQuestion={() => !currentQuestion.journeyId ? fetchNewQuestion(currentQuestion.topic, retryTarget.current) : currentQuestion.journeyId && isAnswered && !currentQuestion.isCorrect
                ? fetchNewQuestion(currentQuestion.topic, { journeyId: currentQuestion.journeyId, nodeId: currentQuestion.journeyNodeId!, facet: currentQuestion.journeyFacet! })
                : handleResetHome()}
              onChooseTopic={handleResetHome}
              isLoadingNext={isLoadingQuestion}
              availableTopics={currentQuestion.journeyId ? [] : TOPICS as unknown as string[]}
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
          <JourneyExplorer userId={user.id} isDemo={isDemoUser} topic={learningTopic} revision={journeyRevision}
            knowledgeOnly={knowledgeOnly} onTopic={topic => { setLearningTopic(topic); setKnowledgeOnly(false); }}
            disabled={!!learningBlocked} onStart={(topic, target) => void fetchNewQuestion(topic, target)} />
        )}
        </div></div>}
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

    </div>
  );
};

export const App: React.FC = () => {
  const { user } = useAuth();
  return <AppContent key={user?.id ?? 'signed-out'} />;
};

export default App;
