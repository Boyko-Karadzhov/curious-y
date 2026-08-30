import React from 'react';
import { Lightbulb, CheckCircle2, XCircle, MessageSquare, Compass, Layers, Sparkles } from 'lucide-react';
import { MathMarkdown } from '../common/MathMarkdown';

interface ExplanationCardProps {
  isCorrect: boolean;
  explanation: string;
  subtopic?: string;
  angle?: string;
  angleFit?: string;
  onScrollToChat?: () => void;
}

export const ExplanationCard: React.FC<ExplanationCardProps> = ({
  isCorrect,
  explanation,
  subtopic,
  angle,
  angleFit,
  onScrollToChat,
}) => {
  const hasPedagogicalContext = Boolean(subtopic || angle || angleFit);

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

      {/* Attention banner if wrongly answered */}
      {!isCorrect && (
        <div className="mb-4 p-3 bg-amber-100/90 rounded-xl border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5 shadow-2xs">
          <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <span className="font-bold">Attention Check Ahead:</span> Read this explanation carefully! The follow-up question will test the concepts and &quot;why&quot; explained here.
          </div>
        </div>
      )}

      <div className="text-slate-800 text-sm sm:text-base leading-relaxed mb-4">
        <MathMarkdown content={explanation} />
      </div>

      {/* Subtopic, Exploration Angle & Fit Breakdown */}
      {hasPedagogicalContext && (
        <div className="mt-4 pt-4 border-t border-slate-200/70 space-y-3 bg-white/60 -mx-2 sm:-mx-3 p-3 sm:p-4 rounded-xl border border-slate-200/60 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            <span>Learning Angle & Subtopic Context</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {subtopic && (
              <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1 shadow-2xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-600">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Subtopic Chosen</span>
                </div>
                <div className="text-slate-800 font-medium leading-snug">
                  <MathMarkdown content={subtopic} />
                </div>
              </div>
            )}

            {angle && (
              <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1 shadow-2xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-600">
                  <Compass className="w-3.5 h-3.5 text-brand-600" />
                  <span>Exploration Angle</span>
                </div>
                <div className="text-slate-800 font-medium leading-snug">
                  <MathMarkdown content={angle} />
                </div>
              </div>
            )}
          </div>

          {angleFit && (
            <div className="p-3 bg-brand-50/50 rounded-lg border border-brand-200/70 space-y-1 text-xs shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-brand-900">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                <span>How This Question Fits The Angle</span>
              </div>
              <div className="text-slate-700 leading-relaxed font-normal">
                <MathMarkdown content={angleFit} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-3 mt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-brand-600" />
          <span>Have doubts or want to dive deeper? Ask the AI tutor below!</span>
        </p>

        {onScrollToChat && (
          <button
            onClick={onScrollToChat}
            type="button"
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <span>Jump to Chat</span>
            <span>&darr;</span>
          </button>
        )}
      </div>
    </div>
  );
};
