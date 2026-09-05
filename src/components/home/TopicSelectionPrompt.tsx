import React from 'react';
import {
  Shuffle,
  Sparkles,
  Atom,
  Binary,
  FlaskConical,
  Dna,
  Cpu,
  Globe,
  Brain,
  Landmark,
  ArrowRight,
  Layers,
  LucideIcon,
} from 'lucide-react';
import { TOPICS, TopicName } from '../../types';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';

interface TopicSelectionPromptProps {
  onSelectTopic: (topic?: string) => void;
  isLoading?: boolean;
}

interface TopicMeta {
  title: TopicName;
  icon: LucideIcon;
  description: string;
  bgLight: string;
  borderLight: string;
  textColor: string;
  iconBg: string;
  hoverBorder: string;
}

const TOPIC_METADATA: Record<TopicName, TopicMeta> = {
  Physics: {
    title: 'Physics',
    icon: Atom,
    description: 'Forces, motion, quantum rules, relativity & thermodynamics',
    bgLight: 'bg-indigo-50/60',
    borderLight: 'border-indigo-200/80',
    textColor: 'text-indigo-900',
    iconBg: 'bg-indigo-100 text-indigo-700',
    hoverBorder: 'hover:border-indigo-400',
  },
  'Mathematics & Logic': {
    title: 'Mathematics & Logic',
    icon: Binary,
    description: 'First principles, proofs, calculus & abstract structures',
    bgLight: 'bg-amber-50/60',
    borderLight: 'border-amber-200/80',
    textColor: 'text-amber-900',
    iconBg: 'bg-amber-100 text-amber-800',
    hoverBorder: 'hover:border-amber-400',
  },
  Chemistry: {
    title: 'Chemistry',
    icon: FlaskConical,
    description: 'Atomic bonds, molecular reactions, kinetics & entropy',
    bgLight: 'bg-emerald-50/60',
    borderLight: 'border-emerald-200/80',
    textColor: 'text-emerald-900',
    iconBg: 'bg-emerald-100 text-emerald-700',
    hoverBorder: 'hover:border-emerald-400',
  },
  Life: {
    title: 'Life',
    icon: Dna,
    description: 'Cellular machinery, genetics, evolution & biology',
    bgLight: 'bg-teal-50/60',
    borderLight: 'border-teal-200/80',
    textColor: 'text-teal-900',
    iconBg: 'bg-teal-100 text-teal-700',
    hoverBorder: 'hover:border-teal-400',
  },
  'Computer Science': {
    title: 'Computer Science',
    icon: Cpu,
    description: 'Algorithms, computation, architectures & complexity',
    bgLight: 'bg-cyan-50/60',
    borderLight: 'border-cyan-200/80',
    textColor: 'text-cyan-900',
    iconBg: 'bg-cyan-100 text-cyan-700',
    hoverBorder: 'hover:border-cyan-400',
  },
  'Earth & Space': {
    title: 'Earth & Space',
    icon: Globe,
    description: 'Planetary mechanics, cosmology, geology & climate',
    bgLight: 'bg-sky-50/60',
    borderLight: 'border-sky-200/80',
    textColor: 'text-sky-900',
    iconBg: 'bg-sky-100 text-sky-700',
    hoverBorder: 'hover:border-sky-400',
  },
  'Mind & Behavior': {
    title: 'Mind & Behavior',
    icon: Brain,
    description: 'Cognition, neuroscience, psychology & decision-making',
    bgLight: 'bg-purple-50/60',
    borderLight: 'border-purple-200/80',
    textColor: 'text-purple-900',
    iconBg: 'bg-purple-100 text-purple-700',
    hoverBorder: 'hover:border-purple-400',
  },
  'Society & History': {
    title: 'Society & History',
    icon: Landmark,
    description: 'Civilizations, institutions, economics & historical shifts',
    bgLight: 'bg-orange-50/60',
    borderLight: 'border-orange-200/80',
    textColor: 'text-orange-950',
    iconBg: 'bg-orange-100 text-orange-800',
    hoverBorder: 'hover:border-orange-400',
  },
};

export const TopicSelectionPrompt: React.FC<TopicSelectionPromptProps> = ({
  onSelectTopic,
  isLoading = false,
}) => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Welcome Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm text-center relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-xl mx-auto space-y-3 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold uppercase tracking-wider shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            <span>Curious-Y Microlearning · Kingdom Deck</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
            What do you want to explore?
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Select a topic to test and expand your mental models. Every useful answer harvests its knowledge resource and strengthens your castle.
          </p>
        </div>
      </div>

      {/* Featured "Random" Option Card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !isLoading && onSelectTopic(undefined)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isLoading) onSelectTopic(undefined);
          }
        }}
        aria-label="Select random topic"
        className={`group bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 text-white rounded-3xl p-5 sm:p-6 shadow-md hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer relative overflow-hidden ${
          isLoading ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''
        }`}
      >
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-64 h-full bg-white/10 opacity-30 transform skew-x-12 translate-x-16 group-hover:translate-x-8 transition-transform duration-500 pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner group-hover:scale-105 group-hover:bg-white/25 transition-all duration-200">
              <Shuffle className="w-7 h-7 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Surprise Me (Random)
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider">
                  Mixed loot
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/85 max-w-lg leading-relaxed">
                Draw a &quot;Why&quot; question from any domain and discover which materials your kingdom earns.
              </p>
            </div>
          </div>

          <div className="flex items-center sm:justify-end shrink-0">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white text-slate-900 font-bold text-xs sm:text-sm shadow-sm group-hover:bg-brand-50 group-hover:text-brand-700 transition-colors">
              <span>Choose Random</span>
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </div>
      </div>

      {/* Topics Header */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-600" />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Topics: Choose a Subject
            </span>
          </div>
          <span className="text-xs text-slate-400 font-medium">8 Knowledge Domains</span>
        </div>

        {/* Topics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {TOPICS.map((topic) => {
            const meta = TOPIC_METADATA[topic];
            const Icon = meta.icon;
            const resource = KNOWLEDGE_RESOURCES.find(item => item.topic === topic)!;

            return (
              <button
                key={topic}
                type="button"
                disabled={isLoading}
                onClick={() => onSelectTopic(topic)}
                aria-label={`Choose topic ${topic}`}
                className={`group text-left p-4 rounded-2xl border ${meta.borderLight} ${meta.bgLight} hover:bg-white ${meta.hoverBorder} hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex flex-col justify-between gap-3 cursor-pointer ${
                  isLoading ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-9 h-9 rounded-xl ${meta.iconBg} flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform duration-200`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition-all" />
                  </div>

                  <div>
                    <h3 className={`font-bold text-sm ${meta.textColor} group-hover:text-brand-600 transition-colors`}>
                      {topic}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-snug line-clamp-2">
                      {meta.description}
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400 group-hover:text-brand-600 transition-colors">
                  <span aria-hidden="true">{resource.symbol}</span>
                  <span>Primary resource: {resource.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
