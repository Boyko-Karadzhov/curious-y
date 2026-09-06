# Battle balance — rules 6

New battles run the whole simulation at **5× wall speed**. Each existing 0.25-second simulation step takes exactly 50 milliseconds in both Demo and the authoritative server clock. Movement, recruitment, attack cooldowns, healing, status expiry and projectiles advance together. Sprite poses retain their original animation cadence, independently of travel speed. UI countdowns, scouting and unit statistics show wall time. The 90-second simulation budget is 18 real seconds; an unobstructed basic swordsman reaches the enemy attack line in about 8 seconds.

Rules 1–5 snapshots retain their original clocks, stats, opponents and rewards. The rules-5 fixture was captured from the previous engine before tuning and checks exact final battle equality. No save migration is required. Release the frontend and `learning` Edge Function together; an already-running old battle finishes under its saved rules.

Keep, military construction/upgrades, unit levels and stars cost **zero Gold**. Existing Resource prices and building/Keep/milestone requirements still apply. Answering questions funds combat progression. Treasury remains the sole Gold-priced upgrade because its effect is economic. Library and Towers retain earned-learning progression.

Every chapter has ten deliberate formations: infantry, infantry/archers, screened swarms, shields/ranged, cavalry, armor counters, healing support, cavalry/pikes/rangers, screened artillery and a mixed final army. Enemy effective tier increases by 0.09 per encounter and 1.1 per chapter; recruitment also accelerates. After chapter one, chapter openers combine shields, crossbows, cavalry and artillery. Later chapter finales introduce the Colossus with support and counters.

Enemy Keep HP grows by 20 per encounter, then by 120 at each chapter transition (320 at 1-10 to 440 at 2-1). This combines with the stronger composition and tier jump to require another investment.

Run `node scripts/measure-battles.mjs` to reproduce these checks. No Tower or Library bonuses are included; unit stars are 1 throughout.

| Stage | Army investment | Result | Real seconds |
| --- | --- | --- | ---: |
| 1-1 | Keep 1, Barracks 1, Swordsman level 1 | Victory | 14.5 |
| 1-2 | Same Swordsman army | Draw | 18 |
| 1-2 | Add Range 1 and Archer level 1 | Victory | 16.8 |
| 1-4 | Same two-unit army | Draw | 18 |
| 1-10 | Keep/buildings 2; Swordsman, Archer, Knight, Medic level 1 | Victory | 14.05 |
| 2-1 | Same chapter-one army | Draw | 18 |
| 2-1 | Keep/buildings 3; Swordsman, Archer, Knight, Catapult level 2 | Victory | 17.5 |

Battlefield Keep artwork is scaled fivefold in each dimension. The home artwork is mirrored so its doorway faces inward. Outer walls extend beyond the battlefield frame; narrow layouts shift the gates outward to preserve a visible fighting lane. Castle-map artwork is unaffected.
