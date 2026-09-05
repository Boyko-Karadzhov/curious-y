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
import { KingdomPanel } from './components/kingdom/KingdomPanel';
import { useKingdom } from './lib/kingdom/useKingdom';
import { castleCost } from './lib/kingdom/game';

export const AppContent: React.FC = () => {
  const { user, loading: authLoading, isDemoUser } = useAuth();
  const { settings } = useSettings();
  const kingdom = useKingdom(user?.id);
  const [view, setView] = useState<'learn' | 'castle'>('learn');
  const [reward, setReward] = useState<{ id: string; topic: string; correct: boolean; saved: boolean } | null>(null);
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

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [conceptsOpen, setConceptsOpen] = useState<boolean>(false);

  const recentQuestionsRef = React.useRef<string[]>([]);
  const currentQuestionRef = React.useRef<Question | null>(null);
  currentQuestionRef.current = currentQuestion;

  const hasApiKey = !!settings.apiKey && settings.apiKey.trim().length > 0;

  const handleResetHome = useCallback(() => {
    questionRequest.current++;
    setIsLoadingQuestion(false);
    setPendingTopic(null);
    setView('learn');
    setReward(null);
    setCurrentQuestion(null);
    setSelectedOption(null);
    setIsAnswered(false);
    setErrorMessage(null);
  }, []);

  const handleResetProgress = useCallback(async () => {
    if (!user) return;
    if (!shouldConfirmReset()) return;
    resettingRef.current = true;
    questionRequest.current++;
    setIsLoadingQuestion(false);
    try {
      await pendingAnswerRef.current;
      await resetUserProgress(user.id);
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
    } catch (err) {
      console.error('Failed to reset progress in App:', err);
      setResetError('Progress could not be reset. Please retry.');
    } finally {
      resettingRef.current = false;
    }
  }, [user]);

  // Generate a new Why question
  const fetchNewQuestion = useCallback(async (specificTopic?: string) => {
    if (!user || resettingRef.current) return;
    const request = ++questionRequest.current;

    // For a real authenticated user without an API key, do not generate sample questions; prompt for configuration
    if (!isDemoUser && (!settings.apiKey || !settings.apiKey.trim())) {
      setCurrentQuestion(null);
      setIsLoadingQuestion(false);
      return;
    }

    setPendingTopic(specificTopic || null);
    setIsLoadingQuestion(true);
    setErrorMessage(null);

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
      const generated = await generateWhyQuestion(
        settings,
        chosenTopic,
        isDemoUser,
        recentList,
        user.id
      );

      if (generated.questionText) {
        recentQuestionsRef.current = [generated.questionText, ...recentQuestionsRef.current.slice(0, 20)];
      }

      // Only hold in memory - DO NOT persist unanswered questions to history
      if (request !== questionRequest.current) return;
      setCurrentQuestion({ ...generated, id: crypto.randomUUID() });
      answeredRef.current = false;
      setReward(null);
      setSelectedOption(null);
      setIsAnswered(false);
    } catch (err: unknown) {
      if (request !== questionRequest.current) return;
      console.error('Failed to generate question:', err);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while generating question.';
      setErrorMessage(msg);
    } finally {
      if (request === questionRequest.current) {
        setIsLoadingQuestion(false);
        setPendingTopic(null);
      }
    }
  }, [user, isDemoUser, settings]);

  // Handle answering question
  const answerQuestion = async (index: number) => {
    if (!user || !currentQuestion || isAnswered || answeredRef.current || isLoadingQuestion || resettingRef.current) return;
    answeredRef.current = true;
    const request = questionRequest.current;

    setSelectedOption(index);
    setIsAnswered(true);

    const isCorrect = index === currentQuestion.correctIndex;
    const answeredQuestion: Question = {
      ...currentQuestion,
      selectedIndex: index,
      isCorrect,
    };

    setCurrentQuestion(answeredQuestion);
    const claim = { id: currentQuestion.id!, topic: currentQuestion.topic, correct: isCorrect };
    const rewardSaved = await kingdom.act({ type: 'answer', ...claim });
    if (request === questionRequest.current) setReward({ ...claim, saved: rewardSaved });

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
  };

  const handleSelectFromHistory = (item: HistoryItem) => {
    questionRequest.current++;
    setIsLoadingQuestion(false);
    setView('learn');
    setReward(null);
    answeredRef.current = true;
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
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-brand-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenConcepts={() => setConceptsOpen(true)}
        onGoHome={handleResetHome}
        onResetProgress={handleResetProgress}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
          <nav aria-label="Learning and Castle" className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button type="button" aria-pressed={view === 'learn'} onClick={() => setView('learn')} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === 'learn' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Learn</button>
              <button type="button" aria-pressed={view === 'castle'} onClick={() => setView('castle')} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === 'castle' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>Castle · Level {kingdom.state.castle}</button>
            </div>
            <p className="text-sm font-bold text-amber-800">{kingdom.state.gold} Gold · {Object.values(kingdom.state.tokens).reduce((a, b) => a + b, 0)} topic tokens</p>
          </nav>
          <p className="text-xs text-slate-500">{view === 'learn' ? `Answer → topic tokens → Gold → a stronger Castle. Next Castle upgrade: ${kingdom.state.castle < 5 ? `${castleCost(kingdom.state.castle)} Gold` : 'maximum level reached'}. ` : ''}Castle saves on this device; cloud sync is not implemented.</p>
        </div>
        {kingdom.error && <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">{kingdom.error}</div>}
        {resetError && <div role="alert" className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-sm text-rose-800">{resetError}</div>}
        {view === 'castle' ? <KingdomPanel state={kingdom.state} act={kingdom.act} unavailable={kingdom.unavailable} onLearn={handleResetHome} /> : <>
        {/* Banner if API key is not configured */}
        {!hasApiKey && (
          <div className="bg-gradient-to-r from-amber-500/10 via-brand-500/10 to-indigo-500/10 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-slate-900">
                  {isDemoUser ? 'Explorer Preview Mode' : `Configure Your ${settings.provider.toUpperCase()} API Key`}
                </h3>
                <p className="text-xs text-slate-600">
                  {isDemoUser
                    ? 'Running with sample demo questions. Add your Gemini, OpenAI, or Claude API key for live AI generation.'
                    : 'To generate live, dynamic "Why" questions, please provide your LLM API key in Settings.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-xs shadow-xs transition-all shrink-0 cursor-pointer"
            >
              <span>{hasApiKey ? 'Settings' : 'Add API Key'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Active Topics Bar (Visible when question is active for quick switching) */}
        {currentQuestion && (
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
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs sm:text-sm flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Generation Issue</p>
              <p className="mt-0.5">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => fetchNewQuestion(pendingTopic || undefined)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition-colors shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Real User without API Key Onboarding Card */}
        {!hasApiKey && !isDemoUser && !currentQuestion && !isLoadingQuestion ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-sm space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center mx-auto shadow-2xs">
              <Key className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h2 className="text-xl font-bold text-slate-900">
                Connect Your LLM Provider
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Curious-Y is a &quot;Bring Your Own LLM&quot; platform. All questions are dynamically generated on-demand by your chosen AI model ({settings.provider.toUpperCase()}: {settings.model}).
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="px-6 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-bold text-sm shadow-md shadow-brand-500/20 inline-flex items-center gap-2 transition-all cursor-pointer"
              >
                <SettingsIcon className="w-4 h-4" />
                <span>Configure {settings.provider.toUpperCase()} Settings</span>
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
                Generating your &quot;Why&quot; question {pendingTopic ? `in ${pendingTopic}` : 'across all topics'} via {settings.provider.toUpperCase()}...
              </h3>
              <p className="text-xs text-slate-500">
                Generating rigorous choices and intuitive explanations with {settings.model}
              </p>
            </div>
          </div>
        ) : currentQuestion ? (
          <div className="space-y-6">
            {reward && <div role="status" className={`rounded-2xl p-4 border ${reward.saved ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
              <p className="font-bold">{reward.saved ? `+${reward.correct ? 10 : 3} ${reward.topic} tokens earned!` : 'Your answer reward has not been saved.'}</p>
              <div className="flex flex-wrap items-center gap-3 mt-1"><p className="text-sm">{reward.saved ? `Exchange for ${(reward.correct ? 10 : 3) * 2} Gold to grow your Castle and army.` : 'Retry to collect these tokens once storage is available.'}</p>
                <button type="button" className="text-sm font-bold underline" onClick={async () => { if (reward.saved) setView('castle'); else { const saved = await kingdom.act({ type: 'answer', id: reward.id, topic: reward.topic, correct: reward.correct }); setReward(current => current?.id === reward.id ? { ...current, saved } : current); } }}>{reward.saved ? 'Visit Castle' : 'Retry reward'}</button>
              </div>
            </div>}
            <QuestionCard
              question={currentQuestion}
              isAnswered={isAnswered}
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
        </>}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-bold text-slate-700">Curious-Y</span>
            <span>&bull;</span>
            <span>Microlearning & BYO LLM</span>
          </div>
          <div className="text-slate-400">
            Current Model: <span className="font-semibold text-slate-600">{settings.model}</span> ({settings.provider})
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
