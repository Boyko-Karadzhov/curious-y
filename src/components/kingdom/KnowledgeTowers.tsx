import { Kingdom, TopicName } from '../../lib/kingdom/game';
import { TOWERS, TOWER_SCALE, TOWER_THRESHOLDS, towerEffect, towerLevel } from '../../../supabase/functions/_shared/towers';

const roofs = ['M16 29V16H23V22H29V16H36V22H42V16H49V29', 'M16 29L32 3L49 29',
  'M12 29L32 9L53 29Z', 'M16 29Q4 10 23 15Q32 -3 41 15Q60 10 49 29',
  'M20 29V12H28V3H37V12H45V29', 'M16 29L21 17L15 8L29 12L34 1L39 14L52 10L47 29',
  'M16 29C-1 -3 65 -3 49 29', 'M16 29L10 9L25 18L32 3L39 18L55 9L49 29'];
export function KnowledgeTowers({ state, compact = false, onLearnTopic, learningBlocked, pendingReward = false }: {
  state: Kingdom; compact?: boolean; onLearnTopic?: (topic: TopicName) => void; learningBlocked?: string | null; pendingReward?: boolean;
}) {
  return <section aria-label={compact ? 'Topic strengths' : 'Knowledge Towers'} className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100">
    <h2 className="font-bold">{compact ? 'Your topic strengths' : 'Eight Knowledge Towers'}</h2>
    {!compact && <p className="mt-2 text-sm text-slate-300">Earn one point per distinct proficient or mastered concept, shared across its topics. Spending Resources never lowers a tower. New bonuses apply in your next battle.</p>}
    <div className={`mt-3 grid gap-3 ${compact ? 'grid-cols-4 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
      {TOWERS.map((tower, index) => {
        const points = state.towers.points[tower.key], level = towerLevel(points), next = TOWER_THRESHOLDS[level];
        const progress = `${Number((points / TOWER_SCALE).toFixed(6))}`;
        return <article key={tower.id} aria-label={tower.name} title={`${tower.topic}: ${progress} points; ${next ? `next level at ${next}` : "maximum level"}`} className={`min-w-0 rounded-xl border border-slate-700 bg-slate-800/70 ${compact ? "p-2" : "p-3"}`}>
          <div className={`flex items-center gap-2 ${compact ? "flex-col text-center" : ""}`}>
            <svg aria-hidden="true" viewBox="0 0 64 84" className={compact ? 'h-8 w-6 shrink-0' : 'h-20 w-14 shrink-0'} style={{ color: tower.color }}>
              <path d="M18 29H47L51 77H13Z" fill="currentColor" opacity=".25" /><path d={roofs[index]} fill="currentColor" opacity=".85" />
              <path d="M18 29H47L51 77H13ZM9 78H55" stroke="currentColor" strokeWidth="2" fill="none" />
              <text x="32" y="48" textAnchor="middle" fill="currentColor" fontSize="17">{tower.symbol}</text>
              {Array.from({ length: level }, (_, i) => <rect key={i} x={19 + i * 6} y="60" width="3" height="8" fill="currentColor" />)}
            </svg>
            <div className="min-w-0"><h3 className={`${compact ? "text-[10px]" : "text-sm"} font-bold`}>{compact ? tower.name.replace(" Tower", "").replace("Computation", "Compute") : tower.name}</h3><p className="text-xs text-slate-300">{compact ? `Lv ${level}` : `Level ${level} / ${tower.cap}`}</p></div>
          </div>
          {!compact && <><p className="mt-2 text-xs font-bold" style={{ color: tower.color }}>{tower.topic} · {tower.appearance}</p><p className="mt-2 text-sm">{towerEffect(tower.key, level)}</p></>}
          {!compact && <p className="mt-2 text-xs text-slate-300">{progress} points · {next ? `Next: ${next}` : 'Maximum level'}</p>}
          <progress aria-label={`${tower.name} progress`} value={Math.min(points, (next ?? 15) * TOWER_SCALE)} max={(next ?? 15) * TOWER_SCALE} className="mt-2 h-2 w-full" style={{ accentColor: tower.color }} />
          {onLearnTopic && <button type="button" disabled={!!learningBlocked} onClick={() => onLearnTopic(tower.topic)} aria-label={pendingReward ? `Collect first for ${tower.topic}` : `Learn ${tower.topic}`} title={learningBlocked ?? `Learn ${tower.topic}`} className="mt-2 min-h-11 w-full rounded-lg border border-slate-500 px-2 text-xs font-bold hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50">{pendingReward ? 'Collect first' : compact ? 'Learn' : `Learn ${tower.topic}`}</button>}
        </article>;
      })}
    </div>
    {learningBlocked && <p role="status" className="mt-3 text-xs text-amber-200">{learningBlocked}</p>}
    {!compact && <details className="mt-4 text-xs text-slate-300"><summary className="min-h-11 cursor-pointer py-3">Rules, unit tags & stacking</summary><p>Levels unlock at 1, 3, 6, 10 and 15 points (cap 5). Aliases count once; atomic foundations and assumed mastery do not count. Topic and mastery corrections can revise progress.</p><p className="mt-2">Heavy: Swordsman, Knight, Catapult. Ranged: Archer, Catapult, Medic. Siege: Catapult. Healer: Medic. Mobile: all except Catapult. Attackers: all except Medic.</p><p className="mt-2">Tower damage bonuses add together, then multiply building damage. Life multiplies Library-adjusted HP. Logic and Command Keep bonuses add, then multiply siege Keep damage. Armor and splash add percentage points (50% ceiling). Recruitment time is divided by the rate bonus (minimum 0.25s); range and speed multiply their building stats (maximum 100). Healing multiplies both rate and lifetime budget. Logic uses reliable precision and Keep weak-point damage instead of random accuracy or critical rolls.</p></details>}
  </section>;
}
