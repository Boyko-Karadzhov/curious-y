# Battle balance — rules 14

Combat uses 0.25-second simulation steps at 5× playback, with a 450-simulation-second / 90-real-second limit. Each side supports 32 deployment points. A swarm deployment creates five creatures sharing one point until the final survivor dies. Duplicate types in separate army slots have independent timers. Battle Start freezes roster, equipment, learning bonuses and doctrine.

Player recruitment takes twice as long as rules 13, for both the first deployment and every replacement, at every tier. Base real-time intervals are 3.6s melee, 4.8s ranged, 7.2s swarm, and 9.6s healer/siege. Tower and doctrine reductions apply to these intervals. Enemy deployment cadence is unchanged. From 1-2 onward, enemy units have 3× their previous health, damage and healing; 1-1 retains its previous enemies. Saved battles retain their frozen rules and stats.

`node scripts/measure-recruitment.mjs` produces [188 deterministic campaign examples](recruitment-balance.json) and discovery percentiles. `node scripts/measure-roster.mjs` produces [58 hypothetical roster comparisons](roster-balance.json). These are reproducible examples, not estimated win probabilities or guarantees. Default scenarios use Balanced doctrine without Library or Towers. The simulated recruitment strategy deliberately merges each class into its highest-tier copy; the actual game lets players retain duplicates instead.

## Discovery

Tier probability uses the pre-pack Hall level. The chance of at least one tier at or above a threshold over successive packs is `1 − product((1 − tierProbability)^3)`. These are any-class discoveries; discovering a particular class takes longer. Class draws are uniform after the guaranteed starter pack.

| Tier at least | 10th / 50th / 90th percentile packs | Median cost of each recruitment resource |
| --- | --- | --- |
| 2 | 12 / 21 / 37 | 168 |
| 3 | 108 / 155 / 189 | 1,240 |
| 4 | 314 / 375 / 414 | 3,000 |
| 5 | 526 / 578 / 615 | 4,624 |

Construction costs are excluded. The Hall consumes both Essence and Astral Dust; the listed amount is charged to each resource.

## Early combat

`node scripts/measure-early-balance.mjs` records the tuning sweep, before/after examples and campaign ceilings in [early-battle-balance.json](early-battle-balance.json). It tests all 75 five-slot class multisets obtainable from the guaranteed starter pack plus one more tier-1 pack, with canonical slot order, Keep 1, Balanced doctrine and no Forge/Library/Towers. These counts describe composition coverage, not random-pack win probabilities; slot permutations are not exhaustively tested.

| 1-2 tuning | Winning five-slot compositions |
| --- | --- |
| Previous rules | 75 / 75 |
| Double player recruitment time only | 73 / 75 |
| Double time + 2× enemy stats | 42 / 75 |
| Double time + 2.5× enemy stats | 27 / 75 |
| Double time + 3× enemy stats (selected) | 5 / 75 |
| Double time + 3.5× enemy stats | 0 / 75 |

The selected tuning makes 1-2 resist most initial armies while retaining openings for strong ranged compositions. Level-2 units win with 26 / 75 compositions and level-3 units with 37 / 75. The best unupgraded tested roster clears 1-4 and stops at 1-5, using the same army without spending its rewards.

The guaranteed starter Militia alone still wins 1-1 in 29.05 real seconds; the full Militia/Slinger/Hatchling pack wins in 15.65s, then loses 1-2. A five-class level-1 army loses 1-2 in 17.85s with a peak of 12 fighters, versus a 14.6s victory and 35 fighters before. A Militia/two-Slingers/Hatchling/Ballista formation loses at level 1 and wins at level 2 in 39.75s. The five-class formation wins at level 4. Training examples assume those levels on every equipped copy and exclude donor acquisition costs.

Swarm is designed to pressure single-target attackers and expose a weakness to siege splash. Doctrine tradeoffs introduce additional composition choices. Numeric balance remains provisional and should be tuned from playtesting, especially duplicate-heavy armies and high-tier swarm populations. The automated suite verifies capacity accounting, replay consistency, class interactions, the onboarding victory, two-pack resistance and a viable training path.

See [territory progression](territory-progression.md) for current resource recipes, rewards and research modifiers.
