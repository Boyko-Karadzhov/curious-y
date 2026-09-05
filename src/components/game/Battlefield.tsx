import { memo, useEffect, useRef } from 'react';
import { Battle } from '../../lib/kingdom/game';
import { BattleRenderer } from '../../lib/kingdom/battleRenderer';

/** React owns accessible status; the canvas owns presentation between snapshots. */
export const Battlefield = memo(function Battlefield({ battle, running }: { battle: Battle; running: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<BattleRenderer>();
  useEffect(() => {
    if (!canvas.current || typeof CanvasRenderingContext2D === 'undefined') return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    renderer.current = new BattleRenderer(canvas.current, context);
    return () => { renderer.current?.dispose(); renderer.current = undefined; };
  }, []);
  useEffect(() => { renderer.current?.update(battle, running); }, [battle, running]);

  return <div className="battlefield relative h-64 overflow-hidden rounded-2xl border border-emerald-800/30" role="img" aria-label={`Battlefield: ${battle.fighters.filter(f => f.side === 'player').length} allied units and ${battle.fighters.filter(f => f.side === 'enemy').length} enemies. Your castle ${Math.ceil(battle.playerHp)} HP, enemy castle ${Math.ceil(battle.enemyHp)} HP.`}>
    <div className="battle-sky absolute inset-x-0 top-0 h-[65%]" />
    <div className="battle-hills absolute inset-x-0 bottom-[25%] h-[50%]" />
    <div className="battle-ground absolute inset-x-0 bottom-0 h-[45%]" />
    <div className="battle-path absolute inset-x-0 bottom-[6%] h-[25%]" />
    <img className="pixel-art absolute -left-4 bottom-3 w-28 sm:w-36" src="/assets/tiny-swords/castle-blue.png" alt="" />
    <img className="pixel-art absolute -right-4 bottom-3 w-28 sm:w-36" src="/assets/tiny-swords/castle-red.png" alt="" />
    <span className="absolute left-3 top-3 rounded bg-slate-950/75 px-2 py-1 text-[10px] font-bold text-sky-100">YOUR ARMY →</span>
    <span className="absolute right-3 top-3 rounded bg-slate-950/75 px-2 py-1 text-[10px] font-bold text-rose-100">← ENEMY ARMY</span>
    <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
  </div>;
});
