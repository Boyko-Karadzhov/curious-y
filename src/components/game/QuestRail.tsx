import type { LearningShortcut } from '../../lib/kingdom/learningPath';
import { KnowledgeTowers } from '../kingdom/KnowledgeTowers';
import { TopicName } from '../../lib/kingdom/game';
import React from 'react';
import { Castle, Flag, Hammer } from 'lucide-react';
import { BUILDINGS, UNITS, Kingdom, castleHp, castleCost, formatCost, stageLabel } from '../../lib/kingdom/game';
import { AvailableActionIndicator } from '../kingdom/AvailableActionIndicator';
import { KeepVisual } from '../kingdom/KeepVisual';

export const QuestRail: React.FC<{ state: Kingdom; castleActionAvailable?: boolean; onCastle: () => void; goalCard?: React.ReactNode; onLearnTopic?: (topic: TopicName, shortcut?: LearningShortcut) => void; learningBlocked?: string | null; pendingReward?: boolean }> = ({ state, castleActionAvailable = false, onCastle, goalCard, onLearnTopic, learningBlocked, pendingReward }) => {
  const unitCount = BUILDINGS.filter(b => state.buildings[b.id] > 0).length;
  return <aside className="order-first lg:order-last space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="Castle progress">
    {goalCard}
    <KnowledgeTowers state={state} compact onLearnTopic={onLearnTopic} learningBlocked={learningBlocked} pendingReward={pendingReward} />
    <section className="game-rail-card hidden lg:block">
      <h2 className="flex items-center gap-2 font-bold text-white"><Castle className="h-5 w-5 text-amber-300" /> The Keep of Curiosity</h2>
      <div className="flex justify-center"><KeepVisual level={state.castle} /></div>
      <p className="text-sm font-bold text-white">Keep level {state.castle}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">{unitCount === 0 ? 'Collect 5 Essence and 5 Astral Dust to build your Recruitment Hall. New learning and due reviews earn more; mixed-topic rewards split across Resources. Conquer territory for daily tribute.' : state.castle < 5 ? `Next Castle upgrade: ${formatCost(castleCost(state.castle))}. Adds ${castleHp(state.castle + 1) - castleHp(state.castle)} HP and unlocks construction.` : 'Castle at maximum level. Recruit and merge units for the next battle.'}</p>
      <button type="button" onClick={onCastle} aria-description={castleActionAvailable ? 'Castle actions available' : undefined} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 py-2 text-sm font-black text-amber-950 hover:bg-amber-200">Manage Castle{castleActionAvailable && <AvailableActionIndicator label="Castle actions available" />}</button>
    </section>
    <section className="game-rail-card hidden lg:block text-sm text-slate-200">
      <h3 className="flex items-center gap-2 font-bold text-white"><Hammer className="h-4 w-4 text-sky-300" /> Your army</h3>
      <p className="mt-2">{state.discovered.length}/{UNITS.length} types discovered · 5 slots</p>
      <ul className="mt-3 space-y-2 text-xs">{BUILDINGS.map(spec => <li key={spec.id} className="flex justify-between gap-2"><span>{spec.unit}</span><span className="text-slate-400">{state.buildings[spec.id] ? `Level ${state.buildings[spec.id]}` : `Build ${spec.name}`}</span></li>)}</ul>
    </section>
    <section className="game-rail-card hidden lg:block">
      <h3 className="flex items-center gap-2 font-bold text-white"><Flag className="h-4 w-4 text-amber-300" /> Battle</h3>
      <p className="mt-2 text-xs text-slate-300">{state.cleared} territories conquered</p>
      <p className="mt-2 text-xs text-slate-400">{`Next: ${stageLabel(state.cleared + 1)}`}</p>
    </section>
  </aside>;
};
