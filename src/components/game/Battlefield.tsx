import { memo, ReactNode, useEffect, useRef } from 'react';
import { Battle } from '../../lib/kingdom/game';
import { BattleRenderer } from '../../lib/kingdom/battleRenderer';

/** React owns accessible status; the canvas owns presentation between snapshots. */
export const Battlefield = memo(function Battlefield({ battle, running, children }: { battle: Battle; running: boolean; children?: ReactNode }) {
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

  return <div className="battlefield relative isolate h-[440px] sm:h-[420px] overflow-hidden rounded-2xl border border-emerald-800/30" role="group" aria-label="Battlefield">
    <div className="absolute inset-0" role="img" aria-label={`Battlefield: ${battle.fighters.filter(f => f.side === 'player').length} allied units and ${battle.fighters.filter(f => f.side === 'enemy').length} enemies. Your castle ${Math.ceil(battle.playerHp)} HP, enemy castle ${Math.ceil(battle.enemyHp)} HP.`}>
    <div className="battle-sky absolute inset-x-0 top-0 h-[65%]" />
    <div className="battle-hills absolute inset-x-0 bottom-[25%] h-[50%]" />
    <div className="battle-ground absolute inset-x-0 bottom-0 h-44" />
    <div className="battle-path absolute inset-x-0 bottom-20 h-16" />
    <img className="pixel-art absolute -left-4 bottom-[76px] w-28 sm:w-36" src="/assets/tiny-swords/castle-blue.png" alt="" />
    <img className="pixel-art absolute -right-4 bottom-[76px] w-28 sm:w-36" src="/assets/tiny-swords/castle-red.png" alt="" />
    <canvas ref={canvas} className="absolute inset-x-0 bottom-16 h-64 w-full" aria-hidden="true" />
    </div>
    {children}
  </div>;
});
