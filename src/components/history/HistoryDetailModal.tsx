import React from 'react';
import { X, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { HistoryItem } from '../../types';
import { MathMarkdown } from '../common/MathMarkdown';
import { TopicBadge } from '../question/TopicBadge';
import { FollowUpChat } from '../chat/FollowUpChat';

interface HistoryDetailModalProps {
  item: HistoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryDetailModal: React.FC<HistoryDetailModalProps> = ({ item, isOpen, onClose }) => {
  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <TopicBadge topic={item.topic} size="md" />
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }) : 'Past Question'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/30">
          {/* Question Text */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="text-lg font-bold text-slate-900 leading-snug">
              <MathMarkdown content={item.questionText} />
            </div>

            {/* Options review */}
            <div className="space-y-2 pt-2">
              {item.options.map((opt, idx) => {
                const isCorrectOption = idx === item.correctIndex;
                const isUserChoice = idx === item.selectedIndex;

                let borderClass = 'border-slate-200 bg-white text-slate-700';
                if (isCorrectOption) {
                  borderClass = 'border-emerald-400 bg-emerald-50/60 text-emerald-950';
                } else if (isUserChoice && !isCorrectOption) {
                  borderClass = 'border-rose-400 bg-rose-50/60 text-rose-950';
                }

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex items-start gap-3 text-sm ${borderClass}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-md font-bold text-xs flex items-center justify-center shrink-0 border ${
                        isCorrectOption
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : isUserChoice
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <MathMarkdown content={opt} />
                    </div>

                    {isCorrectOption && (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Correct Answer
                      </span>
                    )}
                    {isUserChoice && !isCorrectOption && (
                      <span className="text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200 flex items-center gap-1 shrink-0">
                        <XCircle className="w-3.5 h-3.5" />
                        Your Answer
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-500"></span>
              <span>Explanation & Intuition</span>
            </h4>
            <div className="text-sm text-slate-700 leading-relaxed">
              <MathMarkdown content={item.explanation} />
            </div>
          </div>

          {/* Linked Chat Session */}
          <div className="pt-2">
            <FollowUpChat question={item} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
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
  );
};
