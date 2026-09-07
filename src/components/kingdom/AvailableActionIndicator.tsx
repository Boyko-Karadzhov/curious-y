import { Sparkles } from 'lucide-react';

export function AvailableActionIndicator({ label, className = '' }: { label: string; className?: string }) {
  return <span aria-hidden="true" title={label} className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#fff0b1] bg-[#f5d777] text-[#2d4c2f] ${className}`}><Sparkles size={13} /></span>;
}
