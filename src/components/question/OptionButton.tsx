import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { MathMarkdown } from '../common/MathMarkdown';

interface OptionButtonProps {
  index: number;
  text: string;
  isSelected: boolean;
  isRevealed: boolean;
  isCorrect: boolean;
  disabled: boolean;
  onSelect: (index: number) => void;
}

export const OptionButton: React.FC<OptionButtonProps> = ({
  index,
  text,
  isSelected,
  isRevealed,
  isCorrect,
  disabled,
  onSelect,
}) => {
  const letters = ['A', 'B', 'C', 'D'];
  const letter = letters[index] || String(index + 1);

  let stateClasses = 'border-slate-200 bg-white hover:border-brand-400 hover:bg-slate-50/80 text-slate-800 shadow-xs';
  let badgeClasses = 'bg-slate-100 text-slate-600 border-slate-200 group-hover:bg-brand-50 group-hover:text-brand-700';

  if (isRevealed) {
    if (isCorrect) {
      stateClasses = 'border-emerald-500 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-400/30';
      badgeClasses = 'bg-emerald-600 text-white border-emerald-600';
    } else if (isSelected && !isCorrect) {
      stateClasses = 'border-rose-500 bg-rose-50/70 text-rose-950 ring-2 ring-rose-400/30';
      badgeClasses = 'bg-rose-600 text-white border-rose-600';
    } else {
      stateClasses = 'border-slate-200 bg-slate-50/40 text-slate-400 opacity-60';
      badgeClasses = 'bg-slate-200 text-slate-400 border-slate-200';
    }
  } else if (isSelected) {
    stateClasses = 'border-brand-500 bg-brand-50/60 text-brand-950 ring-2 ring-brand-400/30';
    badgeClasses = 'bg-brand-600 text-white border-brand-600';
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(index)}
      className={`group w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-3.5 relative overflow-hidden ${stateClasses} ${
        disabled ? 'cursor-default' : 'cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0'
      }`}
    >
      <div
        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm border transition-colors ${badgeClasses}`}
      >
        {letter}
      </div>

      <div className="flex-1 min-w-0 pt-0.5 text-sm md:text-base font-normal">
        <MathMarkdown content={text} />
      </div>

      {isRevealed && (
        <div className="shrink-0 pt-0.5 animate-fade-in">
          {isCorrect && (
            <div className="flex items-center gap-1 text-emerald-600 font-semibold text-xs bg-emerald-100 px-2 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Correct</span>
            </div>
          )}
          {isSelected && !isCorrect && (
            <div className="flex items-center gap-1 text-rose-600 font-semibold text-xs bg-rose-100 px-2 py-1 rounded-full border border-rose-200">
              <XCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Incorrect</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
};
