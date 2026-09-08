# Battle balance — rules 13

Combat uses 0.25-second simulation steps at 5× playback, with a 450-simulation-second / 90-real-second limit. Each side supports 32 deployment points. A swarm deployment creates five creatures sharing one point until the final survivor dies. Duplicate types in separate army slots have independent timers. Battle Start freezes roster, equipment, learning bonuses and doctrine.

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

The guaranteed starter Militia alone wins stage 1 at Keep 1 in the deterministic baseline, then loses stage 2. Equipping the starter Slinger and Hatchling adds ranged support and five-body swarm deployments. Stronger Keeps and deliberate composition materially change outcomes; compare the recorded assumptions before comparing rows.

Swarm is designed to pressure single-target attackers and expose a weakness to siege splash. Doctrine tradeoffs introduce additional composition choices. Numeric balance remains provisional and should be tuned from playtesting, especially duplicate-heavy armies and high-tier swarm populations. The automated suite verifies capacity accounting, replay consistency, class interactions and the onboarding victory.

See [territory progression](territory-progression.md) for current resource recipes, rewards and research modifiers.
