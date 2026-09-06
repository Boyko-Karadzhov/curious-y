# Castle progression — step 5

Implemented on top of steps 1–4: account goals, four prepared army slots, frozen short battles, weighted Resources and learning-value receipts. `castle` remains the stored Keep level; neither building IDs nor topic-keyed balances are renamed. Save schema 3 adds Academy, Treasury, Library and a reserved Forge ID. `KEEP_DEFINITION` and `BUILDING_DEFINITIONS` own caps, gates, branch labels, costs and numerical specialty tuning; purchases, goal options, tooltips and combat consume them.

## Branches and prices

These are independent branches from the Keep, not irreversible specializations. All buildings may be owned; five equipped unit types make the battle choice. Purchased levels cannot exceed the Keep or level 5. The Keep starts at level 1 with 240 HP; levels add 120 HP through level 5. Its upgrade price is `10 × current level` each of Runes and Influence.

Each combat building costs `base Resources × (current level + 1)` with no Gold requirement. Only Treasury adds `20 × current level` Gold. Goals link combat progression directly to the required learning topics.

| Branch / stored ID | Keep gate | Base Resources | Real specialty, levels 1 → 5 |
| --- | --- | --- | --- |
| Frontline / `barracks` | 1 | 10 Force | Swordsman: 0 / 4 / 8 / 12 / 16% incoming damage reduction |
| Ranged / `range` | 1 | 15 Astral Dust + 15 Insight | Archer: reach 18 / 20 / 22 / 24 / 26 |
| Cavalry / `stable` | 2 | 20 Essence + 20 Reagents | Knight: movement 3.33 → 4.67 units/sec; +10% base speed per upgrade |
| Siege / `workshop` | 3 | 30 Logic Cores + 30 Force | Catapult: 3 / 2.75 / 2.5 / 2.5 / 2.25s reload; splash radius 4 → 8 |
| Support / `academy` | 2 | 20 Essence + 20 Insight | Medic: 3 / 4 / 5 / 6 / 7 HP/sec; lifetime healing budget 24 / 30 / 36 / 42 / 48 HP |
| Economy / `treasury` | 2 | 20 Runes + 20 Influence | +2 / 4 / 6 / 8 / 10% victory Gold, rounded down |
| Verified learning / `library` | 1 | Cannot be purchased | 10 / 30 / 75 / 150 qualifying concepts grant levels 1–4 and +1 / 2 / 3 / 4% army HP |
| Future equipment / `forge` | Planned at 4 | Unavailable | Reserved definition only; cap 0, no purchase or crafting screen |

Original units retain +30% **base** HP and damage per upgrade, so prior investment is preserved. Medic gets the HP growth but has zero damage. Recruit intervals remain 4.5 / 6 / 9 / 12 seconds for Swordsman / Archer / Knight / Catapult, with Medic at 12 seconds. Enemy units use the same versioned specialties; specialty scaling stops at tier 5 even as campaign base strength increases.

## Combat and balance limits

New battles use rules 8: 0.25-second simulation steps at 5× wall speed, a 90-second real-time deadline, and 24 units per side. Rules 1–7 retain their saved behavior. See [current balance](battle-balance.md); the measurements below document the original rules-3 release. All effective unit effects, healing budgets, Library HP multiplier, Keep level, opponent configuration and Treasury reward are frozen at Start. Upgrades and army changes remain prohibited during an active battle. Learning may advance the Library during battle; that change applies to the next battle only.

- Armor reduces all incoming unit damage, including splash, by at most 16%. It does not reduce damage to the Keep.
- Reach changes actual targeting distance. Cavalry movement changes actual travel and respects the existing frontline stop rule.
- Catapults have authoritative cooldowns. A direct shot deals three seconds of its base DPS, then 35% of that shot to at most two additional enemies near the primary target. Selection uses stable fighter order. Castles take the existing 3× direct hit and no splash. Reload is `3 / (1 + 0.08 × upgrades)`, rounded to the nearest 0.25-second simulation step; the tooltip shows that exact cadence. The UI reports average direct DPS and per-shot damage. Animation never awards damage.
- Medics choose the injured non-Medic ally with lowest health fraction in reach 14; fighter ID breaks ties. They heal one ally and spend a finite lifetime budget. Healing is capped at missing HP, cannot revive lethal damage, cannot target Keeps or other Medics, and cannot produce attacks. They stop behind enemies and are vulnerable to longer reach and splash. With a 12-second recruit interval, one Medic slot can recruit at most seven Medics before a 90-second battle ends: at most 336 total HP at Academy 5, usually much less. Every healer consumes ordinary field capacity; support-only armies cannot destroy the enemy Keep. Draw/defeat/retreat grants no reward.
- Library multiplies army HP before integer rounding; small 1% bonuses can round away on low-health units. It does not change mastery, resource rewards, damage, recruit speed or field capacity.

Representative deterministic rules-3 measurements (all four original units selected when owned):

| Stage | Keep | Barracks / Range / Stable / Workshop | Result | Seconds |
| --- | --- | --- | --- | --- |
| 1 | 1 | 1 / 0 / 0 / 0 | Victory | 73.75 |
| 11 | 2 | 1 / 1 / 0 / 0 | Victory | 65.5 |
| 21 | 3 | 1 / 1 / 1 / 1 | Victory | 65 |
| 31 | 3 | 2 / 2 / 1 / 1 | Victory | 70.25 |
| 41 | 5 | 3 / 3 / 3 / 3 | Victory | 65.5 |
| 81 | 1 | 1 / 0 / 0 / 0 | Defeat | 75.75 |
| 41 | 5 | 5 / 0 / 0 / 0 | Draw | 90 |

## Verified Library policy

The protected, account-scoped `concepts` table is the authority. A concept qualifies when its persisted mastery is **proficient or mastered**, it has a positive earned reasoning-track value, and its canonical identity is not atomic. Currency balances, editable Demo saves, rewards paid and client-declared counts are never evidence.

Existing server concepts are eligible immediately under the same rule, including earned records that predate `reward_successes`. The earlier server-authority migration already quarantined formerly editable legacy mastery. No new mastery reset or retuning occurs here. Atomic prerequisites remain assumed mastered for learning eligibility but never count toward Library progress, even if their generated track is positive. A non-atomic mastered record with no earned track is excluded.

Names use trimmed, lowercase, collapsed-whitespace normalization. Connected canonical names and aliases count as one identity, including transitive aliases and collisions. An atomic record anywhere in an identity group conservatively excludes the group. This may merge ambiguous names rather than grant duplicate milestones. Mastery rows are never renamed, deleted or rewritten by this reconciliation.

The migration backfills counts. A trigger reconciles protected mastery/track/alias/atomic changes under the same per-account lock used by answers, purchases and reset. Reconciliation changes the Castle revision only when the derived count or Library level changes. Repeated answers/reconciliation cannot grant duplicate progress. A concurrent purchase must retry its stale revision, preserving the new Library count. Protected identity corrections may lower the derived count; game balance changes never modify mastery. Deleting question history does not remove concept achievements. Reset clears concepts and all game buildings through the existing atomic account reset.

Demo computes the same identity policy from its local concept registry and earned ledger on load/command. It remains editable practice data and never enters signed-in storage. A step-4 regression found during this work was also fixed: zero-value Demo learning receipts now collect successfully and deduplicate without minting Resources.

## Treasury payout contract

Only victory at the next unbeaten stage qualifies. Base Gold is unchanged: `60 + 10 × (stage - 1)`. Start snapshots base Gold, Treasury percentage, `floor(base × percent / 100)` bonus and total. Collection writes the actual paid amount and marks the battle collected in the same atomic revision/request-ID transaction. Results display that stored payment. Stage 1 with Treasury 1 pays 61; upgrading Treasury to level 2 after victory but before Collect still pays 61. Treasury 5 on a new stage-1 battle would pay 66. Multiple retries, overlapping collection and upgrade commands cannot multiply payment.

Legacy active/pending battles retain base-only Gold; historical victories already paid remain collected. Parsing preserves all stored costs, ownership, explicit army choices and battle clocks. The SQL migration retains schema 1 for battles that still require the existing Edge compatibility conversion; schema 2 saves become schema 3 additively. Malformed modern saves fail closed rather than silently reset.

## Future dependencies and release

Forge equipment acquisition, crafting, inventory and equipping belong to **section 10**. Treasury passive/offline production needs **section 22**'s production rates, caps, clock accounting and collection design. It is not implemented here. Server catch-up of an existing battle is separate from offline production. **Step 7** may expand the Academy/unit roster using the existing unit IDs, slots and effect snapshots.

Release the additive `20260906070000_castle_progression.sql` migration, the `learning` Edge Function and frontend together; old open clients should reload after rollout. Keep battle rule versions immutable when changing balance. Do not use old frontend/Edge code as a rollback after schema-3 writes without a compatible parser.

Verification covers the original journeys/security suites plus every unlock/cap, legacy battle fixtures, actual effect ticks, Medic limits, Library thresholds/aliases/atomic exclusions, Demo refresh/reset, trusted answer threshold crossings, migration backfill, RLS, purchase retries and separate-connection purchase/Library/Treasury collection races. Run `npm test`, `npm run test:db`, the same DB suite against an empty local PostgreSQL database for races, `npm run build`, and `npm run lint`. Responsive browser review covers the tree, keyboard anchor focus and 390px mobile layout without horizontal overflow.
