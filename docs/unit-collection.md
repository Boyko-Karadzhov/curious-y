# Recruitment and XP merging — state 11

All classes are recruited at the Recruitment Hall. Build it for 5 Essence + 5 Astral Dust; each three-copy pack costs 8 of each resource. Construction gives no units. The starter pack guarantees a Militia, Slinger and Hatchling; subsequent copies choose uniformly among five classes.

| Class | Tier 1 → 2 → 3 → 4 → 5 |
| --- | --- |
| Melee | Militia → Spearman → Swordsman → Royal Guard → Champion |
| Ranged | Slinger → Archer → Crossbowman → Ranger → Marksman |
| Swarm | Hatchling → Forager → Stinger → Ravager → Hive Guard |
| Healer | Medic → Herbalist → Acolyte → Priest → High Priest |
| Siege | Ballista → Catapult → Trebuchet → Bombard → Great Bombard |

## Tier odds

Shared `recruitment-tuning.json` is consumed by Edge, Demo, previews and measurement scripts. Successful packs advance Hall level: `min(100, 1 + floor(recruitCount / 10))`. Resolve the pack using its pre-action level. Packs 1–10 use level 1; pack 11 uses level 2. There are no campaign gates on tier odds.

Level 1 always rolls tier 1. Other levels discretize a normal distribution with sigma .45 at boundaries 1.5/2.5/3.5/4.5. The existing mean anchors and tiny-tail handling remain unchanged. The UI displays the current tier odds and class probability; paid packs never automatically consume copies.

## XP and effective stats

Every instance stores stable ID, unit type, investedXP and lock state. Tier comes from its type; training level comes from XP. For tier power `p = 3^(tier-1)`, innate XP is `10p`, cumulative threshold for level L is `5p(L-1)(L+2)`, and the next increment is `10p(L+1)`. An inverse square root corrected against BigInt integer thresholds derives the level without iteration over previous levels. Safe-integer guards bound storage; there is no gameplay level cap.

A donor transfers **innate XP plus all invested XP**, and is consumed atomically. The recipient's own innate XP never enters its training bar. Total innate plus invested XP across the living roster is conserved regardless of merge order. Two fresh Militia give a third 20 invested XP/level 2; another gives 30 XP and 10/30 progress; two more give 50 XP/level 3. A level-10 Militia with 540 XP transfers 550 into a fresh Spearman, making level 5 with 130/180 progress. Tier/type never changes through training.

Rules 14 use tier power 1/3/9/27/81 and +20% per training level. Hall level affects recruitment odds only. Swarm stats apply to each of five creatures; all five share one deployment point. Both sides have 32 deployment points. Player deployment intervals are doubled from rules 13; enemy units gain 3× health, damage and healing from 1-2 onward. See [battle balance](battle-balance.md).

## Ownership and persistence

Each copy has a stable ID, invested XP and protection flag. Multiple copies of the same type can fill different army slots; one copy cannot fill two slots. Each of the five slots deploys independently. The collection shows copy numbers, level, protection and equipped state.

Choose a recipient, select spare copies of its class, review the XP result and explicitly consume those donors. Equipped and protected donors cannot be consumed. The recipient keeps its type and slot. Recruitment and merging do not change an already frozen battle snapshot. Battle casualties never consume roster copies.

Server reservations save six draws per pack (three tiers and three classes) by account, generation and request ID. Charges, grants, count, discoveries and receipt commit atomically. Retries recover the original result. Demo uses a local receipt and shared account lock. Reload alone does not replay celebration.

See [territory progression](territory-progression.md) for resource recipes, daily tribute, research, state reset and deployment order. `scripts/smoke-recruitment.mjs --linked` verifies a temporary live account through real answer/collect and game HTTP commands, then deletes it without sending email or generating a paid question.
