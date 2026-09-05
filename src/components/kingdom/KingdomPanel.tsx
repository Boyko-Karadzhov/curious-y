import React, { useState } from 'react';
import { Castle, Coins, Flag, Hammer, BookOpen, Shield, Swords } from 'lucide-react';
import { TOPICS } from '../../types';
import { Action, BUILDINGS, Kingdom, MAX_LEVEL, buildingCost, castleCost, castleHp, createBattle, unitStats } from '../../lib/kingdom/game';
import { Battlefield } from '../game/Battlefield';
import { BattleHud } from '../game/BattleHud';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';

interface Props {
  state: Kingdom;
  act: (action: Action) => Promise<boolean>;
  unavailable: boolean;
  serverBacked?: boolean;
  onLearn: () => void;
}
const button = 'rounded-xl px-4 py-2 text-sm font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors';

export const KingdomPanel: React.FC<Props> = ({ state, act, unavailable, serverBacked = false, onLearn }) => {
  const [busy, setBusy] = useState(false);
  const battle = state.battle;
  const active = !!battle && !battle.result;
  const displayBattle = battle ?? createBattle(state);
  const perform = async (action: Action) => {
    setBusy(true);
    const ok = await act(action);
    setBusy(false);
    return ok;
  };
  const blocked = busy || unavailable;
  const missingGold = (cost: number) => Math.max(0, cost - state.gold);

  return (
    <div className="space-y-6" aria-label="Castle management">
      <section className="space-y-3" aria-label="Battle">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white"><Swords className="h-6 w-6 text-amber-300" /> Battle</h1>
        <Battlefield battle={displayBattle} running={active && !unavailable}>
          <BattleHud state={state} battle={displayBattle} active={active} blocked={blocked} unavailable={unavailable} perform={perform} onLearn={onLearn} />
        </Battlefield>
      </section>

      <section className="rounded-3xl bg-slate-900 text-white p-5 sm:p-8 overflow-hidden">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-amber-300">Built from what you learn</p>
            <h2 className="text-3xl font-extrabold mt-2 flex items-center gap-3"><Castle className="w-9 h-9" /> Your Castle · Level {state.castle}</h2>
            <p className="text-sm text-slate-300 mt-3 max-w-lg">Answer questions, exchange topic tokens for Gold, and build an army that can push through the enemy line.</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-3"><p className="text-xs text-amber-200">Treasury</p><p className="text-2xl font-black">{state.gold} Gold</p></div>
        </div>
        <div className="flex flex-wrap gap-3 mt-6 text-sm">
          <span className="rounded-xl bg-white/10 px-3 py-2"><Shield className="inline w-4 h-4 mr-1" /> {castleHp(state.castle)} castle HP</span>
          <span className="rounded-xl bg-white/10 px-3 py-2"><Swords className="inline w-4 h-4 mr-1" /> {BUILDINGS.filter(b => state.buildings[b.id] > 0).length}/4 units unlocked</span>
          <span className="rounded-xl bg-white/10 px-3 py-2"><Flag className="inline w-4 h-4 mr-1" /> {state.cleared} battles won</span>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className={button} disabled={blocked || active || state.castle === MAX_LEVEL || state.gold < castleCost(state.castle)} onClick={() => perform({ type: 'castle' })}>
            {state.castle === MAX_LEVEL ? 'Castle at max level' : `Upgrade Castle · ${castleCost(state.castle)} Gold`}
          </button>
          <p className="text-xs text-slate-300">{active ? 'Finish or retreat from battle to upgrade.' : state.castle === MAX_LEVEL ? 'All building levels available.' : `Next: +120 castle HP, building level ${state.castle + 1}${state.castle === 1 ? ', unlock Stable' : state.castle === 2 ? ', unlock Siege Workshop' : ''}.`}</p>
        </div>
        {!active && state.castle < MAX_LEVEL && missingGold(castleCost(state.castle)) > 0 && <p className="text-xs text-amber-200 mt-3">{missingGold(castleCost(state.castle))} more Gold needed. Every correct answer is worth 20 Gold after exchange.</p>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div><h2 className="font-extrabold text-lg flex items-center gap-2"><Coins className="w-5 h-5 text-amber-600" /> Topic treasury</h2>
            <p className="text-sm text-slate-500 mt-1">Correct answer: +10 tokens. Learning attempt: +3. Each token exchanges for 2 Gold.</p></div>
          <button type="button" onClick={onLearn} className={button}><BookOpen className="inline w-4 h-4 mr-1" /> Earn more by learning</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {TOPICS.map(topic => <div key={topic} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3">
            <div className="min-w-0"><p className="text-sm font-bold">{topic}</p><p className="text-xs text-slate-500">{KNOWLEDGE_RESOURCES.find(resource => resource.topic === topic)?.name} · {state.tokens[topic]} tokens → {state.tokens[topic] * 2} Gold</p></div>
            <button type="button" className="text-xs font-bold rounded-lg px-3 py-2 bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed" disabled={blocked || !state.tokens[topic]} aria-label={`Exchange ${topic} tokens`} onClick={() => perform({ type: 'exchange', topic })}>Exchange</button>
          </div>)}
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 sm:p-6">
        <h2 className="font-extrabold text-lg flex items-center gap-2 mb-2"><Hammer className="w-5 h-5 text-brand-600" /> Four buildings, four units</h2>
        <p className="text-sm text-slate-500 mb-4">Construct a building to automatically recruit its unit in battle. Each building upgrade adds 30% of base health and damage. Building levels cannot exceed your Castle.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {BUILDINGS.map(spec => {
            const level = state.buildings[spec.id];
            const locked = state.castle < spec.unlock;
            const capped = level >= state.castle;
            const cost = buildingCost(spec.id, level);
            const stats = unitStats(spec.id, Math.max(1, level));
            const next = unitStats(spec.id, level + 1);
            return <article key={spec.id} className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col items-start">
              <div className="flex items-center gap-3"><span aria-hidden="true" className="text-3xl text-brand-700 bg-brand-50 rounded-xl w-12 h-12 flex items-center justify-center">{spec.symbol}</span><div><h3 className="font-extrabold">{spec.name}</h3><p className="text-xs text-slate-500">{locked ? `Locked · Castle level ${spec.unlock}` : level ? `Level ${level} · ${spec.unit} unlocked` : 'Not built'}</p></div></div>
              <p className="font-bold text-sm mt-4">{spec.unit} · Spawns every {spec.spawnInterval}s</p>
              <p className="text-xs text-slate-500 mt-1">{spec.role}</p>
              <p className="text-sm mt-3">{stats.hp} HP · {stats.damage} damage/sec</p>
              {!!level && !capped && <p className="text-xs text-emerald-700">Upgrade → {next.hp} HP · {next.damage} damage/sec</p>}
              <div className="mt-auto pt-4 w-full">
                <button type="button" className={`${button} w-full`} disabled={blocked || active || locked || capped || state.gold < cost} onClick={() => perform({ type: 'building', id: spec.id })}>
                  {locked ? `Requires Castle ${spec.unlock}` : capped ? (level === MAX_LEVEL ? `${spec.name} max level` : 'Upgrade Castle first') : `${level ? 'Upgrade' : 'Build'} ${spec.name} · ${cost} Gold`}
                </button>
                {!locked && !capped && !active && state.gold < cost && <p className="text-xs text-slate-500 mt-2">Need {cost - state.gold} more Gold.</p>}
              </div>
            </article>;
          })}
        </div>
      </section>

      <p className="text-xs text-slate-500 text-center">{serverBacked ? 'Your Castle and campaign save securely to your account. Earlier browser saves are not imported.' : 'Explorer Demo · Progress saves to this browser.'}</p>
    </div>
  );
};
