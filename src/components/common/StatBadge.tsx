import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatBadgeProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: 'brand' | 'emerald' | 'amber' | 'indigo' | 'rose';
  className?: string;
}

export const StatBadge: React.FC<StatBadgeProps> = ({
  icon: Icon,
  label,
  value,
  color = 'brand',
  className = '',
}) => {
  const colorMap = {
    brand: 'bg-brand-50 text-brand-700 border-brand-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs ${colorMap[color]} ${className}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>
        <span className="opacity-80 mr-1">{label}:</span>
        <span className="font-bold">{value}</span>
      </span>
    </div>
  );
};
