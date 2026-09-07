# Battle balance — rules 10

The initial numeric balance is provisional. Acquisition mechanics and the requested curve are unchanged. New rules remove purchased recruitment-building stat bonuses for both armies, retain class abilities at their level-1 baseline, and use uncapped XP-derived training (+20% per level). No additional enemy pacing adjustment was added. Enemy tiers still advance every ten stages. Library and Towers remain independent. See [mechanics](unit-collection.md).

Combat uses 0.25-second simulation steps at 5× playback, with a 450-simulation-second/90-real-second limit and at most 24 fighters per side. All times below are real seconds. Old frozen rules remain immutable.

## Analytic first discovery

`node scripts/measure-recruitment.mjs` writes [full evidence](recruitment-balance.json). For each threshold it computes `1-product((1-P(tier>=threshold))^3)` using the pre-action building level.

| At least tier | 10th / median / 90th percentile packs | Median resource cost |
| --- | --- | ---: |
| 2 | 12 / 21 / 37 | 315 |
| 3 | 108 / 155 / 189 | 2,325 |
| 4 | 314 / 375 / 414 | 5,625 |
| 5 | 526 / 578 / 615 | 8,670 |

These are per-building thresholds, not guarantees or estimates for every named type. At 20–25 resources entirely in the chosen topic per useful answer, median tier 2 costs roughly 13–16 answers and tier 5 costs 347–434, excluding construction/other spending. Mixed-topic payouts take longer; bosses can shorten this.

## Merging trajectories and unlucky paths

Measurements use the production recruitment flow: each pack automatically merges into the highest tier found and replaces the equipped veteran when appropriate. The fixed path uses deterministic low-discrepancy draws; the adverse path uses .999999 for every draw. Neither is a probability percentile. A single-family run uses Keep 1; mixed armies use Keep 3 and five families with the same pack count **per family**. Construction/Keep costs are additional, and no Library/Tower bonuses are included.

| Packs per family | Fixed melee recipient | Adverse melee recipient |
| ---: | --- | --- |
| 1 | Militia L2, 20 XP, 78 HP | same |
| 10 | Militia L7, 290 XP, 143 HP | same |
| 21 | Spearman L6, 620 XP, 390 HP | Militia L10, 620 XP, 182 HP |
| 37 | Spearman L8, 1,140 XP, 468 HP | Militia L14, 1,100 XP, 234 HP |
| 155 | Spearman L19, 6,100 XP, 897 HP | Militia L30, 4,640 XP, 442 HP |
| 375 | Royal Guard L14, 28,560 XP, 6,318 HP | Militia L46, 11,240 XP, 650 HP |
| 578 | Royal Guard L25, 89,990 XP, 10,179 HP | Militia L58, 17,330 XP, 806 HP |
| 990 | Champion L40, 688,910 XP, 46,332 HP | Swordsman L41, 78,810 XP, 5,265 HP |

| Packs per family | Five-family battle evidence |
| ---: | --- |
| 1 | Both paths win stage 10 in 14.05s and 11 in 18s; lose stage 21 in 33.5s |
| 10 | Both win stage 21 in 27.6s; lose stage 31 in 16.4s |
| 37 | Fixed wins stage 31 in 25.5s; adverse loses in 30.5s |
| 155 | Fixed wins stage 41 in 22.85s but loses stage 50 in 30.55s; adverse wins stage 31 in 27.95s |
| 375 | Fixed wins stage 50 in 15.2s; adverse loses stage 41 in 24.7s |
| 578 | Fixed wins stage 50 in 11.25s; adverse wins stage 41 in 58.05s but loses stage 50 in 14s |

The adverse path demonstrates useful lower-tier XP growth and later limits. It does not prove every unlucky player can beat every stage after a finite number of packs. Players can keep learning/recruiting, change composition, and develop the independent Keep/Library/Towers.

`node scripts/measure-roster.mjs` writes a separate [58-case roster sweep](roster-balance.json), with explicit acquired tiers and training, not an acquisition promise. `node scripts/measure-battles.mjs` additionally checks healer compositions at chapter boundaries 2–5; each measured composition wins in 11.9s. The tests retain class counters, guard, charge, capped splash, healer target/budget exclusions, catch-up/reload equivalence and the 48-fighter bound.
