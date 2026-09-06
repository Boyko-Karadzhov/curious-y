import { Kingdom, TopicName } from '../../lib/kingdom/game';
import { TOWERS, TOWER_SCALE, TOWER_THRESHOLDS, towerEffect, towerLevel } from '../../../supabase/functions/_shared/towers';
import { buildingArt } from '../../lib/kingdom/buildingArt';

export function KnowledgeTowers({ state, compact = false, onLearnTopic, learningBlocked, pendingReward = false }: {
  state: Kingdom; compact?: boolean; onLearnTopic?: (topic: TopicName) => void; learningBlocked?: string | null; pendingReward?: boolean;
}) {
  return <section aria-label={compact ? 'Topic strengths' : 'Knowledge Towers'} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100">
    <h2 className="font-bold">{compact ? 'Your topic strengths' : 'Eight Knowledge Towers'}</h2>
    {!compact && <p className="mt-2 text-sm text-slate-300">Earn one point per distinct proficient or mastered concept, shared across its topics. Spending Resources never lowers a tower. New bonuses apply in your next battle.</p>}
    <div className={`mt-3 grid gap-3 ${compact ? 'grid-cols-4 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
      {TOWERS.map(tower => {
        const points = state.towers.points[tower.key], level = towerLevel(points), next = TOWER_THRESHOLDS[level];
        const progress = `${Number((points / TOWER_SCALE).toFixed(6))}`;
        const remaining = next ? Number(((next * TOWER_SCALE - points) / TOWER_SCALE).toFixed(6)) : 0;
        return <article key={tower.id} aria-label={tower.name} title={`${tower.topic}: ${progress} points; ${next ? `level ${level + 1} at ${next} points — ${towerEffect(tower.key, level + 1)}` : `maximum level — ${towerEffect(tower.key, level)}`}`} className={`min-w-0 rounded-xl border border-slate-700 bg-slate-800/70 ${compact ? "p-2" : "p-3"}`}>
          <div className={`flex items-center gap-2 ${compact ? "flex-col text-center" : ""}`}>
            <img aria-hidden="true" alt="" src={buildingArt(tower.id)} width="512" height="512" className={`${compact ? 'h-10 w-10' : 'h-20 w-20'} shrink-0 object-contain ${level === 0 ? 'opacity-50 grayscale' : ''}`} />
            <div className="min-w-0"><h3 className={`${compact ? "text-[10px]" : "text-sm"} font-bold`}>{compact ? tower.name.replace(" Tower", "").replace("Computation", "Compute") : tower.name}</h3><p className="text-xs text-slate-300">{compact ? `Lv ${level}` : `Level ${level} / ${tower.cap}`}</p></div>
          </div>
          {!compact && <>
            <p className="mt-2 text-xs font-bold" style={{ color: tower.color }}>{tower.topic} · {tower.appearance}</p>
            {level > 0 && <div className="mt-3 text-sm text-slate-300"><p className="text-xs font-bold text-slate-400">{next ? 'Current bonus' : 'Maximum bonus unlocked'}</p><p className="mt-1">{towerEffect(tower.key, level)}</p></div>}
            {next && <div className="mt-3 rounded-lg border border-sky-300/25 bg-sky-300/5 p-3">
              <p className="text-xs font-bold text-sky-200">{level === 0 ? 'Unlock at level 1' : `At level ${level + 1} · total bonus`}</p>
              <p className="mt-1 text-sm font-medium text-white">{towerEffect(tower.key, level + 1)}</p>
              <p className="mt-2 text-xs text-slate-300">Earn {remaining} more {remaining === 1 ? 'point' : 'points'} in {tower.topic} to {level === 0 ? 'unlock' : 'upgrade'}.</p>
            </div>}
          </>}
          {!compact && <p className="mt-2 text-xs text-slate-300">{progress} points · {next ? `Next: ${next}` : 'Maximum level'}</p>}
          <progress aria-label={`${tower.name} progress`} value={Math.min(points, (next ?? 15) * TOWER_SCALE)} max={(next ?? 15) * TOWER_SCALE} className="mt-2 h-2 w-full" style={{ accentColor: tower.color }} />
          {onLearnTopic && <button type="button" disabled={!!learningBlocked} onClick={() => onLearnTopic(tower.topic)} aria-label={pendingReward ? `Collect first for ${tower.topic}` : `Learn ${tower.topic}`} title={learningBlocked ?? `Learn ${tower.topic}`} className="mt-2 min-h-11 w-full rounded-lg border border-slate-500 px-2 text-xs font-bold hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50">{pendingReward ? 'Collect first' : compact ? 'Learn' : `Learn ${tower.topic}`}</button>}
        </article>;
      })}
    </div>
    {learningBlocked && <p role="status" className="mt-3 text-xs text-amber-200">{learningBlocked}</p>}
    {!compact && <details className="mt-4 text-xs text-slate-300"><summary className="min-h-11 cursor-pointer py-3">Rules, classes & stacking</summary><p>Levels unlock at 1, 3, 6, 10 and 15 points (cap 5). Aliases count once; atomic foundations and assumed mastery do not count. Topic and mastery corrections can revise progress.</p><p className="mt-2">Every tier of a class receives the same bonuses. Force improves melee, mounted and siege units. Astral improves ranged units. Alchemy improves siege. Life improves all health and healer power. Insight improves movement for every class except siege. Logic and Command improve all attacking classes; healers cannot attack.</p><p className="mt-2">Tower damage bonuses add together, then multiply building damage. Life multiplies Library-adjusted HP. Logic and Command Keep bonuses add, then multiply siege Keep damage. Armor and splash add percentage points (50% ceiling). Recruitment time is divided by the rate bonus (minimum 0.25s); range and speed multiply their building stats (maximum 100). Healing multiplies both rate and lifetime budget. Logic uses reliable precision and Keep weak-point damage instead of random accuracy or critical rolls.</p></details>}
  </section>;
}
