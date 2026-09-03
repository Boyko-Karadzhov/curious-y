import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  Search,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Trash2,
  Award,
  BookOpen,
  ChevronRight,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { HistoryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getQuestionHistory, deleteQuestion, resetUserProgress, shouldConfirmReset } from '../../services/database';
import { MathMarkdown } from '../common/MathMarkdown';
import { TopicBadge } from '../question/TopicBadge';
import { HistoryDetailModal } from './HistoryDetailModal';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuestion?: (item: HistoryItem) => void;
  onResetProgress?: () => Promise<void> | void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectQuestion,
  onResetProgress,
}) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

  const fetchHistory = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const items = await getQuestionHistory(user.id);
      setHistory(items);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  const handleDelete = async (e: React.MouseEvent, questionId?: string) => {
    e.stopPropagation();
    if (!questionId || !user) return;
    if (confirm('Delete this question from history?')) {
      await deleteQuestion(user.id, questionId);
      setHistory((prev) => prev.filter((item) => item.id !== questionId));
    }
  };

  const handleResetProgress = async () => {
    if (!user) return;
    if (!shouldConfirmReset()) return;
    setResetting(true);
    try {
      if (onResetProgress) {
        await onResetProgress();
      } else {
        await resetUserProgress(user.id);
      }
      setHistory([]);
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2000);
    } catch (err) {
      console.error('Error resetting progress in HistoryModal:', err);
    } finally {
      setResetting(false);
    }
  };

  if (!isOpen) return null;

  // Derive unique topics
  const topicsList = ['All', ...Array.from(new Set(history.map((h) => h.topic)))];

  // Stats
  const totalAnswered = history.filter((h) => h.selectedIndex !== null && h.selectedIndex !== undefined).length;
  const totalCorrect = history.filter((h) => h.isCorrect === true).length;
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  // Filtered items
  const filteredHistory = history.filter((item) => {
    const matchesSearch =
      item.questionText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.subtopic && item.subtopic.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.angle && item.angle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.angleFit && item.angleFit.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.explanation.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTopic = selectedTopic === 'All' || item.topic === selectedTopic;

    let matchesStatus = true;
    if (statusFilter === 'correct') matchesStatus = item.isCorrect === true;
    if (statusFilter === 'incorrect') matchesStatus = item.isCorrect === false;

    return matchesSearch && matchesTopic && matchesStatus;
  });

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
        <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Learning History & Chat Logs</h2>
                <p className="text-xs text-slate-500">
                  Review your past &quot;Why&quot; questions, explanations, and AI discussions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetProgress}
                disabled={resetting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                title="Reset all question history and learning progress"
                aria-label="Reset Progress"
              >
                {resetting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                ) : resetSuccess ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>{resetSuccess ? 'Reset!' : 'Reset Progress'}</span>
              </button>

              <button
                onClick={onClose}
                type="button"
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="px-6 py-3.5 bg-slate-100/60 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-600" />
                <span className="text-xs text-slate-600">Total Questions:</span>
                <span className="font-bold text-sm text-slate-900">{history.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-slate-600">Accuracy:</span>
                <span className="font-bold text-sm text-emerald-700">{accuracy}%</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span className="text-xs text-slate-600">Mastered:</span>
                <span className="font-bold text-sm text-slate-900">
                  {totalCorrect} / {totalAnswered}
                </span>
              </div>
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center rounded-xl bg-white border border-slate-200 p-1 text-xs font-semibold shadow-2xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('correct')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'correct'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Correct
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('incorrect')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === 'incorrect' ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                Incorrect
              </button>
            </div>
          </div>

          {/* Search & Topic Filters */}
          <div className="p-4 sm:px-6 bg-white border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search past questions, topics, or explanations..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all"
              />
            </div>

            {/* Topic Filter Chips */}
            {topicsList.length > 2 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider mr-1 shrink-0">
                  Topics:
                </span>
                {topicsList.map((topicName) => (
                  <button
                    key={topicName}
                    type="button"
                    onClick={() => setSelectedTopic(topicName)}
                    className={`text-xs px-3 py-1 rounded-full border shrink-0 transition-all cursor-pointer ${
                      selectedTopic === topicName
                        ? 'bg-brand-600 text-white border-brand-600 font-semibold shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    {topicName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* History List */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1 bg-slate-50/40">
            {loading ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                <span className="text-sm font-medium">Loading history...</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <History className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-700">No questions found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery || selectedTopic !== 'All' || statusFilter !== 'all'
                    ? 'Try adjusting your filters or search terms.'
                    : 'Start answering "Why" questions to build your personal learning library!'}
                </p>
              </div>
            ) : (
              filteredHistory.map((item) => {
                const isCorrect = item.isCorrect === true;
                const isAnswered = item.selectedIndex !== null && item.selectedIndex !== undefined;
                const chatCount = item.chatMessages?.length || 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (onSelectQuestion) {
                        onSelectQuestion(item);
                        onClose();
                      } else {
                        setSelectedItem(item);
                      }
                    }}
                    className="group bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 hover:border-brand-400 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div className="pt-0.5 shrink-0">
                        {isAnswered ? (
                          isCorrect ? (
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center border border-emerald-200">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center border border-rose-200">
                              <XCircle className="w-4 h-4" />
                            </div>
                          )
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200">
                            <BookOpen className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <TopicBadge topic={item.topic} size="sm" />
                          <span className="text-[11px] text-slate-400">
                            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>

                        <div className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug group-hover:text-brand-600 transition-colors">
                          <MathMarkdown content={item.questionText} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      {chatCount > 0 && (
                        <div className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{chatCount} {chatCount === 1 ? 'chat' : 'chats'}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* History Detail Modal */}
      <HistoryDetailModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
};
