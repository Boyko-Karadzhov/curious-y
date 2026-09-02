import React from 'react';
import { Sparkles, Atom, FlaskConical, Binary, Landmark, BookOpen, Dna, Cpu, Globe, Brain } from 'lucide-react';

interface TopicBadgeProps {
  topic: string;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export const TopicBadge: React.FC<TopicBadgeProps> = ({
  topic,
  size = 'md',
  interactive = false,
  selected = false,
  onClick,
}) => {
  const getTopicStyle = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('physic')) {
      return {
        bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        activeBg: 'bg-indigo-600 text-white border-indigo-600',
        icon: Atom,
      };
    }
    if (lower.includes('math') || lower.includes('logic') || lower.includes('algeb') || lower.includes('calc')) {
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        activeBg: 'bg-amber-600 text-white border-amber-600',
        icon: Binary,
      };
    }
    if (lower.includes('chem')) {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        activeBg: 'bg-emerald-600 text-white border-emerald-600',
        icon: FlaskConical,
      };
    }
    if (lower.includes('life') || lower.includes('bio')) {
      return {
        bg: 'bg-teal-50 text-teal-700 border-teal-200',
        activeBg: 'bg-teal-600 text-white border-teal-600',
        icon: Dna,
      };
    }
    if (lower.includes('comput') || lower.includes('cs') || lower.includes('code') || lower.includes('software')) {
      return {
        bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        activeBg: 'bg-cyan-600 text-white border-cyan-600',
        icon: Cpu,
      };
    }
    if (lower.includes('earth') || lower.includes('space') || lower.includes('astro') || lower.includes('planet')) {
      return {
        bg: 'bg-sky-50 text-sky-700 border-sky-200',
        activeBg: 'bg-sky-600 text-white border-sky-600',
        icon: Globe,
      };
    }
    if (lower.includes('mind') || lower.includes('behavior') || lower.includes('psych') || lower.includes('cognit')) {
      return {
        bg: 'bg-purple-50 text-purple-700 border-purple-200',
        activeBg: 'bg-purple-600 text-white border-purple-600',
        icon: Brain,
      };
    }
    if (lower.includes('societ') || lower.includes('histor') || lower.includes('politi')) {
      return {
        bg: 'bg-orange-50 text-orange-800 border-orange-200',
        activeBg: 'bg-orange-600 text-white border-orange-600',
        icon: Landmark,
      };
    }
    return {
      bg: 'bg-brand-50 text-brand-700 border-brand-200',
      activeBg: 'bg-brand-600 text-white border-brand-600',
      icon: BookOpen,
    };
  };

  const style = getTopicStyle(topic);
  const Icon = style.icon || Sparkles;

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-0.5 gap-1.5',
    md: 'text-xs font-semibold px-3 py-1.5 gap-2',
    lg: 'text-sm font-semibold px-4 py-2 gap-2.5',
  };

  return (
    <span
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`inline-flex items-center rounded-full border transition-all duration-200 ${
        sizeClasses[size]
      } ${
        selected
          ? style.activeBg + ' shadow-sm scale-105'
          : style.bg
      } ${
        interactive
          ? 'cursor-pointer hover:scale-105 hover:shadow-xs active:scale-95'
          : ''
      }`}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{topic}</span>
    </span>
  );
};
