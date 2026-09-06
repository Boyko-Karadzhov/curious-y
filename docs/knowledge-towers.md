# Knowledge Towers — step 6

Progression rule `earned-proficiency-v1`; save schema 4; new battle rules 4. Each canonical resource/topic has exactly one stable tower. All towers exist at level 0 and cap at level 5, unlocking at **1 / 3 / 6 / 10 / 15 topic points**. Points continue accumulating above the level cap.

## Progress and evidence

Library and towers share the same eligible identity groups (`qualifyingConcepts` in Demo; `library_eligible_concepts` in SQL). A protected non-atomic proficient/mastered concept with positive reasoning evidence contributes exactly one concept to Library and one point to towers, split across its positive canonical topic weights. This is a projection of existing mastery, not another mastery system. The server-authority migration from step 2 already quarantined formerly editable learning records; this migration never imports local data or revives that quarantine.

One point is **1,000,000 integer units**. Hamilton allocation uses exact decimal weights, quotient/remainder, and canonical resource order for ties. For weights 7:2:1, shares are 700,000:200,000:100,000. Three equal weights award 333,334 to the first canonical topic and 333,333 to each other topic. Unknown, negative, zero and nonnumeric weights do not count. A historical identity with no usable classification stays in Library but contributes no tower points until classified; no arbitrary fallback topic is invented.

Trimmed, lowercased, whitespace-collapsed canonical names and aliases form connected identity groups. A group with any atomic member is excluded. Among earned members, the normalized canonical name, then original canonical name (binary order) select one stable representative whose topic weights are used; repeated/alias rows never sum. Exact duplicate canonical names are prohibited in server records; Demo uses canonical topic-value order to break duplicate ties. Correct a group's selected representative when repairing its classification. Assumed mastery with no positive track is excluded. Repeated answers, deleting question history, Collect and Resource spending never add a second point for a completed identity.

`20260906090000_knowledge_towers.sql` explicitly backfills every existing account from the protected concepts table. The shared reconciliation trigger reacts to concept insertion/deletion, mastery, reasoning, topic classification, alias, atomic and ownership corrections. It atomically recalculates Library and tower projections under the existing account lock; revisions change only if the projection changes. Corrected evidence can move or remove points, including lowering levels. This is intentionally not a permanent high-water mark. No wallets, purchases, campaign, reward receipts, pending Gold, battle configurations, clocks or reset generations are rewritten. Stale Edge commands fail revision comparison and retry; command commits also prohibit tower edits. Browser roles cannot execute reconciliation or write learning evidence.

Demo reconciles its local registry plus the existing earned ledger on load, answer and command. It is never accepted as server evidence. Account switches stay isolated. Reset clears evidence and the projection through the existing generation-checked reset transaction; stale questions cannot restore it.

## Final bonus table

Percentages below are per level; maximum values assume level 5. Shapes, symbols and text labels supplement the canonical resource colors.

| Stable ID / topic | Tower / appearance | Effect per level | Maximum tower contribution |
| --- | --- | --- | --- |
| `tower-force` / Physics | Force / battlements ⚙ | Heavy damage +0.5%; heavy armor +0.3 percentage points | +2.5% damage; +1.5 pp armor |
| `tower-runes` / Mathematics & Logic | Logic / diamond spire ◆ | Attacker precision damage +0.4%; Keep damage +0.2% | +2% damage; +1% Keep damage |
| `tower-reagents` / Chemistry | Alchemy / triangular furnace ▲ | Siege damage +0.5%; splash fraction +0.4 pp | +2.5% damage; +2 pp splash |
| `tower-essence` / Life | Life / flower canopy ✿ | All HP +0.5%; healer rate and lifetime budget +0.4% | +2.5% HP; +2% healing |
| `tower-cores` / Computer Science | Computation / lightning antenna ⚡ | All recruitment rate +0.4% | +2% rate |
| `tower-astral` / Earth & Space | Astral / star observatory ✦ | Ranged reach +0.5% | +2.5% reach |
| `tower-insight` / Mind & Behavior | Insight / circular eye ◉ | Mobile movement +0.5% | +2.5% movement |
| `tower-influence` / Society & History | Command / crown pavilion ♛ | Attacker Keep damage +0.3% | +1.5% Keep damage |

Heavy = Swordsman, Knight, Catapult. Ranged = Archer, Catapult, Medic. Siege = Catapult. Healer = Medic. Mobile = all except Catapult. Attacker = all except Medic. Force therefore helps the starter army; advanced specializations become useful when their buildings unlock.

The source's Force and Life effects use the real armor/HP/healing added in step 5. **Logic substitute:** combat has reliable damage ticks and no accuracy/critical probabilities. Precision is deterministic +0.4% damage per level, and weak-point targeting is +0.2% Keep damage per level. These replace the proposed accuracy and critical chance bonuses coherently without introducing missed attacks or a critical system into continuous damage. Alchemy strengthens siege projectiles; Computation automates recruitment; Astral improves targeting reach; Insight improves movement; Command coordinates attacks on the opposing Keep. There are no cosmetic-only bonuses or unused mechanics.

## Stacking and snapshots

Apply building stats and Library first, then tower effects once when `createBattle` constructs the authoritative configuration. The configuration stores both the progression rule/points and final effective unit stats. For levels F (Force), L (Logic), A (Alchemy), V (Life), C (Computation), E (Astral), M (Insight), S (Command):

- Damage = building damage × (1 + .005F for heavy + .005A for siege + .004L for attackers). The maximum combined tower damage multiplier is 1.07 on Catapults.
- HP = rounded building/Library HP × (1 + .005V). Library and Life multiply; Life does not affect Keeps.
- Keep multiplier = original Keep multiplier × (1 + .002L + .003S) for attackers, at most 1.025×. A Catapult reaches 3.075×. This multiplies its already modified attack damage.
- Armor = min(.5, building armor + .003F for heavy). Current largest total is .175 (17.5%) on level-5 Swordsmen. Incoming damage multiplies by 1 − armor.
- Siege splash fraction = min(.5, building fraction + .004A), at most .37 currently, applied to modified shot damage. Existing radius and two-target limit remain.
- Healer rate and lifetime budget each multiply by 1 + .004V; existing healing target, no-overheal, no-resurrection and no-Medic/Keep-healing rules apply. Maximum rate 7.14 HP/s and lifetime budget 48.96 HP.
- Recruitment interval = max(.25 seconds, building interval / (1 + .004C)). The quarter-second simulation spawns at the first step on/after the due time and carries its fractional schedule into the next spawn, so small bonuses remain effective. A spawn delayed for a full step by capacity resets from the current time; missed recruits do not accumulate. Computation 5 recruits the third Swordsman at 13.25 seconds instead of 13.5 seconds.
- Ranged reach and mobile speed multiply by 1 + .005E and 1 + .005M respectively, capped at 100. Modified stats round to six decimal places; unchanged movement/damage retain their previous precision.

There is **no combat randomness** in rules 1–4: no seed is needed, and no `Math.random` enters simulation. Quarter-second ticks, snapshot stats, fighter order, timers and cooldowns persist. Catch-up and replay consume this same state. Learning mid-fight updates the account's next-fight projection without touching any current fighter/configuration. Legacy rules 1–3 keep original behavior and rewards, including after parsing/reload. A future random mechanic must introduce a new rules version and persisted seed/state.

The renderer uses persisted fighters/configuration. Army details show actual effective HP, damage, armor, splash, reach, speed, recruitment and healing values; during combat they read the frozen configuration. Tower levels are labeled as frozen or next-battle. Castle shows eight distinct tower silhouettes, labels, effects, points and next thresholds; Learn has a compact eight-topic representation. Topic links call the existing learning flow, which recovers pending Collect before generating another question. In-flight operations disable these links. Tower visuals do not animate; keyboard focus, native progress semantics and responsive grids work with reduced motion.

## Release and verification

Required checks: `npm test`, `npm run test:db`, `npm run build`, `npm run lint`. Database tests apply all migrations in isolated PostgreSQL/PGlite, exercise historical backfill, SQL/Demo allocation parity (including extreme weights), aliases, atomic exclusion, correction, reset, account isolation, protected commits and stale revisions. Existing mastery, server, Library, reward, battle, renderer and UI journeys run alongside tower tests. A controlled 90-second battle draws without Force and wins with Force; catch-up equals stepwise replay. The existing optional `SECURITY_TEST_DATABASE_URL` path adds separate-connection race testing against an empty local PostgreSQL instance.

Release the migration, `learning` Edge Function and frontend together. Database → Edge → frontend is the safe rollout order. Only `learning` is a deployable function; `_shared` modules are bundled with it. Reload old open clients after rollout. A schema-3-only Edge build cannot parse schema 4, so do not roll back to it after migration; use a forward fix retaining schema-4 and battle-rules-4 parsing. Preserve the progression rule string and thresholds for all shipped snapshots; future tuning requires a new rule/version and explicit reconciliation decision. Check one signed-in account's projection and a pending reward after release; all tower writes remain server-owned.
