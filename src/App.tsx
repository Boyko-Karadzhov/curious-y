import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Layers,
  Loader2,
  AlertCircle,
  Shuffle,
} from 'lucide-react';
import { Question, HistoryItem, TOPICS, UserSettings } from './types';
import { useAuth } from './context/AuthContext';
import { useSettings } from './context/SettingsContext';
import { generateWhyQuestion } from './lib/llm/factory';
import {
  saveQuestion,
  getQuestionHistory,
  updateConceptAnswer,
  resetUserProgress,
  shouldConfirmReset,
  getLocalConcepts,
} from './services/database';
import { generateServerQuestion, submitServerAnswer } from './services/backend';
import { Navbar } from './components/layout/Navbar';
import { LoginModal } from './components/auth/LoginModal';
import { QuestionCard } from './components/question/QuestionCard';
import { FollowUpChat } from './components/chat/FollowUpChat';
import { SettingsModal } from './components/settings/SettingsModal';
import { HistoryModal } from './components/history/HistoryModal';
import { ConceptsModal } from './components/concepts/ConceptsModal';
import { TopicBadge } from './components/question/TopicBadge';
import { TopicSelectionPrompt } from './components/home/TopicSelectionPrompt';
import { ResourceBar } from './components/game/ResourceBar';
import { KingdomPanel } from './components/game/KingdomPanel';
import { QuestRail } from './components/game/QuestRail';
import { calculateLearningReward } from './game/economy';
import { useGameState } from './game/useGameState';

const DEMO_SETTINGS: UserSettings = { apiKey: '', hasApiKey: false };

export const AppContent: React.FC = () => {
  const { user, loading: authLoading, isDemoUser } = useAuth();
  const { settings } = useSettings();
  const {
    state: gameState,
    latestReward,
    award: awardGameReward,
    applyServerResult,
    upgrade: upgradeCastle,
    claimDaily,
    clearLatestReward,
    reset: resetGame,
  } = useGameState(user?.id, isDemoUser);

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

  const handleResetHome = useCallback(() => {
    setCurrentQuestion(null);
    setSelectedOption(null);
    setIsAnswered(false);
    setErrorMessage(null);
    clearLatestReward();
  }, [clearLatestReward]);

  const handleResetProgress = useCallback(async () => {
    if (!user) return;
    if (!shouldConfirmReset()) return;
    try {
      const resetStats = await resetUserProgress(user.id);
      recentQuestionsRef.current = [];

      setCurrentQuestion(null);
      setSelectedOption(null);
      setIsAnswered(false);
      setErrorMessage(null);
      setPendingTopic(null);
      resetGame(resetStats);
    } catch (err) {
      console.error('Failed to reset progress in App:', err);
    }
  }, [user, resetGame]);

  // Generate a new Why question
  const fetchNewQuestion = useCallback(async (specificTopic?: string) => {
    if (!user) return;
    if (!isDemoUser && !settings.hasApiKey) {
      setErrorMessage('Add your Gemini API key in Settings before generating a question.');
      setSettingsOpen(true);
      return;
    }

    setPendingTopic(specificTopic || null);
    setIsLoadingQuestion(true);
    setErrorMessage(null);
    clearLatestReward();

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

      // Production questions are issued by the trusted Edge Function. Demo mode uses
      // static sample content and never contributes to server stats.
      const generated = isDemoUser
        ? await generateWhyQuestion(DEMO_SETTINGS, chosenTopic, true, recentList, user.id)
        : await generateServerQuestion(chosenTopic);

      if (generated.questionText) {
        recentQuestionsRef.current = [generated.questionText, ...recentQuestionsRef.current.slice(0, 20)];
      }

      // Only hold in memory - DO NOT persist unanswered questions to history
      setCurrentQuestion(generated);
      setSelectedOption(null);
      setIsAnswered(false);
    } catch (err: unknown) {
      console.error('Failed to generate question:', err);
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred while generating question.';
      setErrorMessage(msg);
    } finally {
      setIsLoadingQuestion(false);
      setPendingTopic(null);
    }
  }, [user, isDemoUser, settings.hasApiKey, clearLatestReward]);

  // Handle answering question
  const handleAnswerQuestion = async (index: number) => {
    if (!user || !currentQuestion || isAnswered) return;

    setSelectedOption(index);

    if (!isDemoUser) {
      if (!currentQuestion.id) return;
      try {
        const result = await submitServerAnswer(currentQuestion.id, index);
        setCurrentQuestion(result.question);
        setSelectedOption(result.question.selectedIndex ?? index);
        setIsAnswered(true);
        applyServerResult(result.stats, result.reward);
      } catch (err) {
        setSelectedOption(null);
        setErrorMessage(err instanceof Error ? err.message : 'Could not submit answer.');
      }
      return;
    }

    setIsAnswered(true);

    const isCorrect = index === currentQuestion.correctIndex;
    const answeredQuestion: Question = {
      ...currentQuestion,
      selectedIndex: index,
      isCorrect,
    };

    setCurrentQuestion(answeredQuestion);

    const conceptTopics = currentQuestion.concept
      ? getLocalConcepts(user.id).find(
          (concept) => concept.canonicalName.toLowerCase() === currentQuestion.concept?.toLowerCase()
        )?.topics
      : undefined;
    awardGameReward(calculateLearningReward(currentQuestion, isCorrect, conceptTopics));

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
      setCurrentQuestion(saved);
    } catch (err) {
      console.error('Failed to save answered question:', err);
    }
  };

  const handleSelectFromHistory = (item: HistoryItem) => {
    setCurrentQuestion(item);
    setSelectedOption(item.selectedIndex ?? null);
    setIsAnswered(true);
    setHistoryOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToChat = () => {
    setTimeout(() => {
      const chatElem = document.getElementById('follow-up-chat');
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
    <div className="kingdom-app min-h-screen flex flex-col bg-[#07121c] text-slate-900 selection:bg-amber-300 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenConcepts={() => setConceptsOpen(true)}
        onGoHome={handleResetHome}
        onResetProgress={handleResetProgress}
      />
      <ResourceBar state={gameState} />

      {/* Main Content */}
      <main className="relative flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-6">
        <KingdomPanel
          state={gameState}
          onUpgrade={upgradeCastle}
          onLearn={() => document.getElementById('learning-deck')?.scrollIntoView({ behavior: 'smooth' })}
        />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div id="learning-deck" className="min-w-0 space-y-6">
        {isDemoUser && (
          <div className="rounded-2xl border border-amber-300/25 bg-[#102235] p-4 text-xs text-slate-300 shadow-lg shadow-black/10">
            <span className="font-bold text-amber-200">Explorer Preview Mode</span>
            <span> &bull; Uses local sample questions and does not affect server-verified stats.</span>
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

        {isLoadingQuestion && !currentQuestion ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center mx-auto shadow-2xs">
              <Sparkles className="w-6 h-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-800">
                Generating your &quot;Why&quot; question {pendingTopic ? `in ${pendingTopic}` : 'across all topics'}...
              </h3>
              <p className="text-xs text-slate-500">
                Gemini is preparing rigorous choices and an intuitive explanation
              </p>
            </div>
          </div>
        ) : currentQuestion ? (
          <div className="space-y-6">
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
              learningReward={latestReward || undefined}
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
          </div>

          <QuestRail
            state={gameState}
            onClaimDaily={claimDaily}
            onLearn={() => document.getElementById('learning-deck')?.scrollIntoView({ behavior: 'smooth' })}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#091724] border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-bold text-slate-300">Curious-Y Kingdoms</span>
            <span>&bull;</span>
            <span>Knowledge builds the kingdom</span>
          </div>
          <div className="text-slate-400">Server-verified learning &bull; Powered by Gemini</div>
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
  return <AppContent />;
};

export default App;
