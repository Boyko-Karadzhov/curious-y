# Battle balance — rules 7

See [the unit collection](unit-collection.md) for the authoritative five-class roster, tier gates, stat growth and matchup matrix.

Battles retain fivefold playback: one 0.25-second deterministic simulation step takes 50 milliseconds. The maximum is 90 simulation seconds / 18 real seconds. Damage, healing, movement and recruitment scale together; UI times are real seconds. Older frozen battles keep their original rules and clocks.

The enemy roster advances one tier each ten-stage chapter. Both enemy and player Keeps scale with the new 3× unit growth. Recruitment accelerates within each chapter but resets at the next chapter's stronger roster, so encounters remain readable.

## Reproducible measurements

Run node scripts/measure-roster.mjs with Node 22.6+ for the complete [58-case results](roster-balance.json). No Library or Tower bonuses are included; all examples use one star.

| Stage | Investment | Outcome | Real seconds |
| --- | --- | --- | ---: |
| 1 | militia; Keep/buildings 1, training 1 | victory | 14.5 |
| 2 | militia; Keep/buildings 1, training 1 | draw | 18 |
| 2 | militia, slinger; Keep/buildings 1, training 1 | victory | 16.2 |
| 5 | militia, slinger; Keep/buildings 1, training 1 | draw | 18 |

The 50-stage progression sweep uses melee/ranged/mounted/siege of the chapter's roster tier, building level max(2, tier), Keep max(3, building), training level 3, and one star. It wins all 50 stages. This is an achievable investment check, not a claim that buildings or training can be skipped.

At chapter transitions (stages 11/21/31/41), the previous roster tier with building levels 2/3/4/5 and training 1 draws at the 18-second limit. The matching new tier wins. The unit-level combat suite additionally checks that each fresh successor beats a predecessor with maximum training/stars at equal building investment.

The hard cap remains 24 units per side. Separate tests exercise all 48 fighters through bounded fixed-step combat and compare catch-up to reload between every step. Campaign measurements include peak fighter counts.

## Release checks

Run npm test, npm run test:db, npm run build, and npm run lint. Apply the five-class migration, deploy the learning Edge Function, and push main for GitHub Pages. Historical fixtures continue to verify older battle outcomes and reward collection.
