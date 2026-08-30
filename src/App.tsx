import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Key,
  Layers,
  ArrowRight,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Question, HistoryItem } from './types';
import { useAuth } from './context/AuthContext';
import { useSettings } from './context/SettingsContext';
import { generateWhyQuestion } from './lib/llm/factory';
import { saveQuestion, updateQuestionAnswer, getQuestionHistory } from './services/database';
import { Navbar } from './components/layout/Navbar';
import { LoginModal } from './components/auth/LoginModal';
import { QuestionCard } from './components/question/QuestionCard';
import { FollowUpChat } from './components/chat/FollowUpChat';
import { SettingsModal } from './components/settings/SettingsModal';
import { HistoryModal } from './components/history/HistoryModal';
import { TopicBadge } from './components/question/TopicBadge';

export const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { settings, parsedTopics } = useSettings();

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [totalAnsweredCount, setTotalAnsweredCount] = useState<number>(0);

  // Load user question count on mount
  const refreshHistoryCount = useCallback(async () => {
    if (!user) return;
    try {
      const items = await getQuestionHistory(user.id);
      const answered = items.filter((q) => q.selectedIndex !== null && q.selectedIndex !== undefined);
      setTotalAnsweredCount(answered.length);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    refreshHistoryCount();
  }, [refreshHistoryCount]);

  // Generate a new Why question
  const fetchNewQuestion = useCallback(async (specificTopic?: string) => {
    if (!user) return;
    setIsLoadingQuestion(true);
    setErrorMessage(null);
    setSelectedOption(null);
    setIsAnswered(false);

    try {
      // 1. Generate via LLM factory
      const generated = await generateWhyQuestion(settings, specificTopic);

      // 2. Persist initial question to Supabase
      const saved = await saveQuestion(user.id, generated);
      setCurrentQuestion(saved);
    } catch (err: unknown) {
      console.error('Error generating question:', err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to generate question. Please check your API key and connection in Settings.'
      );
    } finally {
      setIsLoadingQuestion(false);
    }
  }, [user, settings]);

  // Initial question load when user logs in and settings are ready
  useEffect(() => {
    if (user && !currentQuestion && !isLoadingQuestion) {
      fetchNewQuestion();
    }
  }, [user, currentQuestion, isLoadingQuestion, fetchNewQuestion]);

  // Handle user answering the question
  const handleAnswerQuestion = async (index: number) => {
    if (!currentQuestion || isAnswered || !user) return;

    setSelectedOption(index);
    setIsAnswered(true);

    const isCorrect = index === currentQuestion.correctIndex;

    // Update state
    setCurrentQuestion((prev) => (prev ? { ...prev, selectedIndex: index, isCorrect } : null));

    // Save answer in database
    if (currentQuestion.id) {
      await updateQuestionAnswer(user.id, currentQuestion.id, index, isCorrect);
      await refreshHistoryCount();
    }
  };

  const handleSelectFromHistory = (item: HistoryItem) => {
    setCurrentQuestion(item);
    setSelectedOption(item.selectedIndex ?? null);
    setIsAnswered(item.selectedIndex !== null && item.selectedIndex !== undefined);
  };

  const scrollToChat = () => {
    const el = document.getElementById('follow-up-chat-section');
    el?.scrollIntoView({ behavior: 'smooth' });
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

  const hasApiKey = !!settings.apiKey && settings.apiKey.trim().length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-brand-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        answeredCount={totalAnsweredCount}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Banner if API key is not configured */}
        {!hasApiKey && (
          <div className="bg-gradient-to-r from-amber-500/10 via-brand-500/10 to-indigo-500/10 border border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-slate-900">
                  Bring Your Own LLM ({settings.provider.toUpperCase()})
                </h3>
                <p className="text-xs text-slate-600">
                  Curious-Y is currently running in preview mode. Add your Gemini, OpenAI, or Claude API key for unlimited live AI questions & chat!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold text-xs shadow-xs transition-all shrink-0 cursor-pointer"
            >
              <span>Add API Key</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Active Topics Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-600" />
              Topics:
            </span>
            {parsedTopics.map((topic) => (
              <TopicBadge
                key={topic}
                topic={topic}
                size="sm"
                interactive
                selected={currentQuestion?.topic === topic}
                onClick={() => fetchNewQuestion(topic)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline shrink-0 flex items-center gap-1 cursor-pointer"
          >
            <span>Edit Topics</span>
          </button>
        </div>

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
              onClick={() => fetchNewQuestion()}
              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs hover:bg-rose-700 transition-colors shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Question Area */}
        {isLoadingQuestion && !currentQuestion ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 border border-brand-200 flex items-center justify-center mx-auto shadow-2xs">
              <Sparkles className="w-6 h-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-800">
                Curating your &quot;Why&quot; question...
              </h3>
              <p className="text-xs text-slate-500">
                Generating rigorous choices and LaTeX explanations via {settings.provider.toUpperCase()} ({settings.model})
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
              isLoadingNext={isLoadingQuestion}
              availableTopics={parsedTopics}
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
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm space-y-4">
            <p className="text-sm text-slate-600">No question loaded yet.</p>
            <button
              type="button"
              onClick={() => fetchNewQuestion()}
              className="px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm inline-flex items-center gap-2 hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Generate First Question</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-bold text-slate-700">Curious-Y</span>
            <span>&bull;</span>
            <span>Microlearning with LaTeX & BYO LLM</span>
          </div>
          <div className="text-slate-400">
            Current Model: <span className="font-semibold text-slate-600">{settings.model}</span> ({settings.provider})
          </div>
        </div>
      </footer>

      {/* Modals */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryModal
        isOpen={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          refreshHistoryCount();
        }}
        onSelectQuestion={handleSelectFromHistory}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

export default App;
