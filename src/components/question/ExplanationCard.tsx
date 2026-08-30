import React from 'react';
import { Lightbulb, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { MathMarkdown } from '../common/MathMarkdown';

interface ExplanationCardProps {
  isCorrect: boolean;
  explanation: string;
  onScrollToChat?: () => void;
}

export const ExplanationCard: React.FC<ExplanationCardProps> = ({
  isCorrect,
  explanation,
  onScrollToChat,
}) => {
  return (
    <div
      className={`rounded-2xl border-2 p-5 sm:p-6 transition-all duration-300 animate-slide-up shadow-sm ${
        isCorrect
          ? 'bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 border-emerald-300'
          : 'bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30 border-amber-300'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          {isCorrect ? (
            <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
              <XCircle className="w-5 h-5" />
            </div>
          )}
          <div>
            <h3 className={`font-bold text-base ${isCorrect ? 'text-emerald-900' : 'text-amber-950'}`}>
              {isCorrect ? 'Spot On! 🎉' : 'Good Try! Here is why:'}
            </h3>
            <p className="text-xs text-slate-500">
              {isCorrect ? 'You understood the core underlying reason.' : 'Learn the intuition behind this question.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
          <span>Core Concept</span>
        </div>
      </div>

      <div className="text-slate-800 text-sm sm:text-base leading-relaxed mb-4">
        <MathMarkdown content={explanation} />
      </div>

      <div className="pt-3 mt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-brand-600" />
          <span>Have doubts or want to dive deeper? Ask the AI tutor below!</span>
        </p>

        {onScrollToChat && (
          <button
            onClick={onScrollToChat}
            type="button"
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
          >
            <span>Jump to Chat</span>
            <span>&darr;</span>
          </button>
        )}
      </div>
    </div>
  );
};
