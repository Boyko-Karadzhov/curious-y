import { Battle, BUILDINGS } from '../../lib/kingdom/game';

/** Artwork follows the simulation; no decorative units, timers, or battle progress. */
export function Battlefield({ battle, running }: { battle: Battle; running: boolean }) {
  return <div className="battlefield relative h-56 overflow-hidden rounded-2xl border border-emerald-800/30" role="img" aria-label={`Battlefield: ${battle.fighters.filter(f => f.side === 'player').length} allied units and ${battle.fighters.filter(f => f.side === 'enemy').length} enemies. Your castle ${Math.ceil(battle.playerHp)} HP, enemy castle ${Math.ceil(battle.enemyHp)} HP.`}>
    <div className="battle-sky absolute inset-x-0 top-0 h-[65%]" />
    <div className="battle-hills absolute inset-x-0 bottom-[25%] h-[50%]" />
    <div className="battle-ground absolute inset-x-0 bottom-0 h-[45%]" />
    <div className="battle-path absolute inset-x-0 bottom-[6%] h-[25%]" />
    <img className="pixel-art absolute -left-4 bottom-3 w-28 sm:w-36" src="/assets/tiny-swords/castle-blue.png" alt="" />
    <img className="pixel-art absolute -right-4 bottom-3 w-28 sm:w-36" src="/assets/tiny-swords/castle-red.png" alt="" />
    <span className="absolute left-3 top-3 rounded bg-slate-950/75 px-2 py-1 text-[10px] font-bold text-sky-100">YOUR ARMY →</span>
    <span className="absolute right-3 top-3 rounded bg-slate-950/75 px-2 py-1 text-[10px] font-bold text-rose-100">← ENEMY ARMY</span>
    {battle.fighters.map(fighter => {
      const spec = BUILDINGS.find(building => building.id === fighter.kind)!;
      const sprite = fighter.kind === 'barracks' ? 'warrior' : fighter.kind === 'range' ? 'archer' : null;
      const ally = fighter.side === 'player';
      return <span key={fighter.id} title={`${ally ? 'Allied' : 'Enemy'} ${spec.unit}: ${Math.ceil(fighter.hp)} HP`} className="absolute z-10 -translate-x-1/2" style={{ left: `${10 + fighter.x * 0.8}%`, top: `${ally ? 104 + fighter.id % 3 * 8 : 128 + fighter.id % 3 * 8}px` }}>
        {sprite ? <span aria-hidden="true" className={`block tiny-sprite tiny-${sprite} tiny-${sprite}-${ally ? 'blue' : 'red'}`} style={{ transform: ally ? undefined : 'scaleX(-1)', animationPlayState: running && !battle.result ? 'running' : 'paused' }} />
          : <span aria-hidden="true" className={`flex h-14 w-14 items-center justify-center text-3xl font-black ${ally ? 'text-sky-950' : 'text-rose-950'}`}>{spec.symbol}</span>}
        <span className="absolute left-1/2 top-2 h-1 w-7 -translate-x-1/2 overflow-hidden rounded bg-slate-950/60"><span className={`block h-full ${ally ? 'bg-sky-300' : 'bg-rose-300'}`} style={{ width: `${fighter.hp / fighter.maxHp * 100}%` }} /></span>
      </span>;
    })}
  </div>;
}
