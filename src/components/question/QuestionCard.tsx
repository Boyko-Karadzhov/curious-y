import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { Question } from '../../types';
import { MathMarkdown } from '../common/MathMarkdown';
import { TopicBadge } from './TopicBadge';
import { OptionButton } from './OptionButton';
import { ExplanationCard } from './ExplanationCard';

interface QuestionCardProps {
  question: Question;
  isAnswered: boolean;
  selectedOption: number | null;
  onAnswer: (index: number) => void;
  onNextQuestion: (topic?: string) => void;
  isLoadingNext: boolean;
  availableTopics: string[];
  onScrollToChat?: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  isAnswered,
  selectedOption,
  onAnswer,
  onNextQuestion,
  isLoadingNext,
  availableTopics,
  onScrollToChat,
}) => {
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>('');

  const handleSelectOption = (index: number) => {
    if (isAnswered) return;
    onAnswer(index);

    if (index === question.correctIndex) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.7 },
          colors: ['#0e8ceb', '#10b981', '#f59e0b', '#6366f1', '#ec4899'],
        });
      } catch (e) {
        console.log('Confetti error:', e);
      }
    }
  };

  const isUserCorrect = selectedOption !== null && selectedOption === question.correctIndex;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md overflow-hidden transition-all duration-300">
      {/* Top Header Bar */}
      <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <TopicBadge topic={question.topic} size="md" />
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">•</span>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-brand-500" />
            Micro-inquiry
          </span>
        </div>

        {/* Action button if answered: Next Question */}
        {isAnswered && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNextQuestion(selectedTopicFilter || undefined)}
              disabled={isLoadingNext}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all duration-150 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoadingNext ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span>Next Question</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Question Body */}
      <div className="p-6 sm:p-8 space-y-6">
        {/* The "Why" Question Title */}
        <div className="space-y-2">
          <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
            <MathMarkdown content={question.questionText} />
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Select the most accurate reason below:
          </p>
        </div>

        {/* Options (A, B, C, D) */}
        <div className="grid grid-cols-1 gap-3 sm:gap-3.5">
          {question.options.map((optionText, idx) => (
            <OptionButton
              key={idx}
              index={idx}
              text={optionText}
              isSelected={selectedOption === idx}
              isRevealed={isAnswered}
              isCorrect={idx === question.correctIndex}
              disabled={isAnswered}
              onSelect={handleSelectOption}
            />
          ))}
        </div>

        {/* Explanation Card (Appears immediately after answering) */}
        {isAnswered && (
          <div className="pt-2">
            <ExplanationCard
              isCorrect={isUserCorrect}
              explanation={question.explanation}
              subtopic={question.subtopic}
              angle={question.angle}
              angleFit={question.angleFit}
              onScrollToChat={onScrollToChat}
            />
          </div>
        )}

        {/* Quick Topic Switcher for Next Question */}
        {isAnswered && availableTopics.length > 1 && (
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Practice specific topic next:</span>
            <button
              type="button"
              disabled={isLoadingNext}
              onClick={() => {
                setSelectedTopicFilter('');
                onNextQuestion(undefined);
              }}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedTopicFilter === ''
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
              }`}
            >
              🎲 Any Configured Topic
            </button>
            {availableTopics.map((t) => (
              <button
                key={t}
                type="button"
                disabled={isLoadingNext}
                onClick={() => {
                  setSelectedTopicFilter(t);
                  onNextQuestion(t);
                }}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedTopicFilter === t
                    ? 'bg-brand-600 text-white border-brand-600 font-semibold'
                    : 'bg-white text-slate-700 hover:bg-brand-50 border-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
