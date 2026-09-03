import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, ArrowRight, RefreshCw, Compass, Network, Award } from 'lucide-react';
import { Question, REASONING_COMPLEXITY_INFO } from '../../types';
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
  const complexityInfo = question.reasoningComplexity
    ? REASONING_COMPLEXITY_INFO[question.reasoningComplexity]
    : undefined;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md overflow-hidden transition-all duration-300">
      {/* Top Header Bar */}
      <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TopicBadge topic={question.topic} size="md" />

          {question.isBossQuestion && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 text-xs font-bold shadow-2xs">
              <Award className="w-3.5 h-3.5 text-purple-700" />
              <span>Boss Question</span>
            </span>
          )}

          {question.concept && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-semibold"
              title={`Concept: ${question.concept}`}
            >
              <Network className="w-3.5 h-3.5 text-indigo-600" />
              <span className="max-w-[130px] sm:max-w-[200px] truncate">{question.concept}</span>
            </span>
          )}

          {complexityInfo && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold"
              title={`${complexityInfo.name}: ${complexityInfo.description}`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>{complexityInfo.name}</span>
            </span>
          )}

          {question.isReinforcement && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100/90 text-amber-900 border border-amber-300 text-xs font-bold">
              <Compass className="w-3.5 h-3.5 text-amber-700" />
              <span>Attention Check</span>
            </span>
          )}
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
        {/* Boss Question Banner */}
        {question.isBossQuestion && (
          <div className="p-3.5 bg-gradient-to-r from-purple-50 via-indigo-50 to-brand-50 border border-purple-200/90 rounded-2xl flex items-start gap-2.5 text-xs sm:text-sm text-purple-950 shadow-2xs">
            <Award className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <span className="font-bold">Boss Question:</span> An overarching domain inquiry. Answering this unlocks and expands prerequisite concept dependencies in your knowledge DAG!
            </div>
          </div>
        )}

        {/* Reinforcement Notice Banner */}
        {question.isReinforcement && (
          <div className="p-3 sm:p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-2xl flex items-start gap-2.5 text-xs sm:text-sm text-amber-950 shadow-2xs">
            <Compass className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-snug">
              <span className="font-bold">Follow-Up Attention Check:</span> This question is directly related to the explanation of the question you previously answered incorrectly. Let&apos;s see if you can apply what you just learned!
            </div>
          </div>
        )}

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
              concept={question.concept}
              reasoningComplexity={question.reasoningComplexity}
              isBossQuestion={question.isBossQuestion}
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
