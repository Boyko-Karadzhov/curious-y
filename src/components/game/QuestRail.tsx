import React from 'react';
import { Castle, Flag, Hammer } from 'lucide-react';
import { BUILDINGS, Kingdom, castleCost, stageLabel } from '../../lib/kingdom/game';

export const QuestRail: React.FC<{ state: Kingdom; onCastle: () => void }> = ({ state, onCastle }) => {
  const unitCount = BUILDINGS.filter(b => state.buildings[b.id] > 0).length;
  return <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="Castle progress">
    <section className="game-rail-card">
      <h2 className="flex items-center gap-2 font-bold text-white"><Castle className="h-5 w-5 text-amber-300" /> The Keep of Curiosity</h2>
      <img src="/assets/tiny-swords/castle-blue.png" alt="Your blue castle" className="pixel-art mx-auto h-36 object-contain" />
      <p className="text-sm font-bold text-white">Castle level {state.castle}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-300">{unitCount === 0 ? 'One correct answer earns enough tokens for your first Barracks after exchange.' : state.castle < 5 ? `Next Castle upgrade: ${castleCost(state.castle)} Gold. Adds 120 HP and unlocks higher building levels.` : 'Castle at maximum level. Strengthen your buildings for the next battle.'}</p>
      <button type="button" onClick={onCastle} className="mt-4 w-full rounded-xl bg-amber-300 px-3 py-2 text-sm font-black text-amber-950 hover:bg-amber-200">Manage Castle</button>
    </section>
    <section className="game-rail-card text-sm text-slate-200">
      <h3 className="flex items-center gap-2 font-bold text-white"><Hammer className="h-4 w-4 text-sky-300" /> Your army</h3>
      <p className="mt-2">{unitCount}/4 units unlocked</p>
      <ul className="mt-3 space-y-2 text-xs">{BUILDINGS.map(spec => <li key={spec.id} className="flex justify-between gap-2"><span>{spec.unit}</span><span className="text-slate-400">{state.buildings[spec.id] ? `Level ${state.buildings[spec.id]}` : `Build ${spec.name}`}</span></li>)}</ul>
    </section>
    <section className="game-rail-card">
      <h3 className="flex items-center gap-2 font-bold text-white"><Flag className="h-4 w-4 text-amber-300" /> Battle</h3>
      <p className="mt-2 text-xs text-slate-300">{state.cleared} battles won</p>
      <p className="mt-2 text-xs text-slate-400">{`Next: ${stageLabel(state.cleared + 1)}`}</p>
    </section>
  </aside>;
};
