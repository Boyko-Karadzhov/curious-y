import { UnitRoster } from './UnitRoster';
import { TOWERS, towerLevel } from '../../../supabase/functions/_shared/towers';
import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import { Action, battleSeconds, battleSpeed, stageLabel, Kingdom, ALL_UNIT_IDENTITIES, reconcileUnits, createBattle, unitDamagePerSecond } from '../../lib/kingdom/game';
import { Battlefield } from '../game/Battlefield';
import { BattleHud } from '../game/BattleHud';
import { ArmyPreparation } from './ArmyPreparation';

interface Props {
  state: Kingdom;
  act: (action: Action) => Promise<boolean>;
  unavailable: boolean;
  onLearn: () => void;
  firstArmyPrompt?: React.ReactNode;
}

export const BattlePanel: React.FC<Props> = ({ state, act, unavailable, onLearn, firstArmyPrompt }) => {
  state = reconcileUnits(state);
  const [busy, setBusy] = useState(false);
  const battle = state.battle;
  const active = !!battle && !battle.result;
  const preview = createBattle(state);
  const preparation = active ? battle : preview;
  const displayBattle = battle ?? preview;
  const perform = async (action: Action) => {
    setBusy(true);
    try { return await act(action); } finally { setBusy(false); }
  };
  const blocked = busy || unavailable;

  return (
    <div className="space-y-6" aria-label="Battle management">
      <section id="kingdom-battle" tabIndex={-1} className="space-y-3 scroll-mt-4" aria-label="Battle">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white"><Swords className="h-6 w-6 text-amber-300" /> Battle</h1>
        <Battlefield battle={displayBattle} running={active && !unavailable}>
          <BattleHud state={state} battle={displayBattle} active={active} blocked={blocked} unavailable={unavailable} perform={perform} onLearn={onLearn} firstArmyPrompt={firstArmyPrompt} />
        </Battlefield>
      </section>

      <section className="rounded-2xl bg-slate-900 p-5 text-white" aria-label="Army preparation">
        <h2 className="text-lg font-bold">Prepare your army</h2>
        <p className="mt-1 text-sm text-slate-300">Equip up to four different units. At least one is required. {active ? 'Retreat or finish this battle to change slots.' : `Stage ${stageLabel(preview.stage)}: ${battleSeconds(preview, preview.config.maxSeconds)}s maximum; unresolved fights end in a draw.`}</p>
        <p aria-label="Battle tower snapshot" className="mt-3 text-xs text-sky-200">{active ? 'Frozen at battle start' : 'Next battle towers'}: {preparation.config.towers ? TOWERS.map(t => `${t.symbol} ${t.name} ${towerLevel(preparation.config.towers!.points[t.key])}`).join(' · ') : 'Legacy battle · no tower bonuses'}</p>
        <ArmyPreparation state={state} preparation={preparation} active={active} blocked={blocked} perform={perform} />
        <div className="mt-4 text-sm" aria-label="Opponent scouting">
          <h3 className="font-bold">Opponent · Stage {stageLabel(preparation.stage)}</h3>
          <p>{preparation.enemyMaxHp} castle HP · first recruit at {battleSeconds(preparation, preparation.config.enemy.firstSpawn)}s, then every {battleSeconds(preparation, preparation.config.enemy.spawnInterval)}s in the order below.</p>
          {preparation.config.enemy.units.map((u, i) => <p key={`${u.id}-${i}`} className="mt-1 text-xs text-slate-300">{ALL_UNIT_IDENTITIES.find(spec => spec.id === u.id)!.name}: {u.hp} HP · {Number((unitDamagePerSecond(u) * battleSpeed(preparation.config.rulesVersion)).toFixed(2))} damage/sec · {ALL_UNIT_IDENTITIES.find(spec => spec.id === u.id)!.role}</p>)}
        </div>
      </section>
      <UnitRoster state={state} blocked={blocked} perform={perform} />
    </div>
  );
};
