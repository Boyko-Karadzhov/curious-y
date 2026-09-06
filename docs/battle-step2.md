# Prepared armies and short battles

Step 2 introduces save schema 2 and battle rules 2. Stable unit IDs are `swordsman`, `archer`, `knight`, and `catapult`. Four persisted `armySlots` permit null entries, reject duplicates and unconstructed unlocks, and require one equipped unit to start. First construction equips its unit in the first empty slot; upgrades and later reloads preserve explicit choices. Construction and army changes are rejected during combat.

`UNITS` owns combat definitions; buildings supply eligibility and the existing 30%-per-level HP/damage modifier. Start freezes four effective slot definitions, passive modifiers, opponent rotation and recruitment cadence, rules version, tick size, duration and field limit. Fighters carry unit IDs and their effective castle multiplier. Subsequent recruitment reads only this snapshot. Oldest-due recruitment with slot-order ties keeps the 24-unit field fair without banking missed spawns.

New fights have a 90-second maximum. Rules 2 apply one-third tempo to both sides' movement and damage and triple recruitment intervals. This preserves relative roles, reach, upgrade scaling and pressure while allowing readable fights. It does change which armies can finish before timeout: unsupported high-level infantry can draw where the old rules won. Mixed armies and siege remain useful. Castle destruction, including simultaneous destruction, resolves before the timeout draw on the final tick.

Measurements from `node --experimental-strip-types scripts/measure-battles.mjs` (Node 22.6+, no rendering or wall-clock input):

| Example | Stage | Castle | Building levels: Barracks / Range / Stable / Workshop | Simulated seconds | Outcome |
| --- | --- | --- | --- | --- | --- |
| First army | 1-1 | 1 | 1 / 0 / 0 / 0 | 73.75 | Victory |
| Infantry and support | 2-1 | 2 | 1 / 1 / 0 / 0 | 65.5 | Victory |
| Four roles | 3-1 | 3 | 1 / 1 / 1 / 1 | 65 | Victory |
| Mixed upgrades | 4-1 | 3 | 2 / 2 / 1 / 1 | 67.25 | Victory |
| Late mixed army | 5-1 | 5 | 3 / 3 / 3 / 3 | 67.25 | Victory |
| Underprepared | 9-1 | 1 | 1 / 0 / 0 / 0 | 83.25 | Defeat |
| Unsupported infantry | 5-1 | 5 | 5 / 0 / 0 / 0 | 90 | Draw |
| Overprepared | 1-1 | 5 | 5 / 5 / 5 / 5 | 49.25 | Victory |

All unlocked units are equipped in these examples. The four representative mixed-army victories average 59.56 seconds. These are reproducible regression scenarios, not a claim that every army or campaign stage lasts a minute. Tests assert durations and outcomes, deterministic replay, migration, field fairness, final-tick outcomes, retreat/retry, offline catch-up and reward deduplication.

## Persistence and authority

`20260906020000_prepared_army.sql` backfills missing slots from original ownership, increments affected revisions, updates new-account/reset defaults, and adds only `army` to the command allowlist. Existing battles and clocks remain untouched in SQL. Original schema-1 saves are converted on read by `parseKingdom`: building-keyed fighters/timers become unit-keyed, and legacy effective stats and 120-second rules are frozen. Existing HP, positions, counters, rewards and outcomes remain intact. Missing modern data and unknown rules are rejected with the source save preserved. Three captured original-simulator fixtures verify identical continuation and results; the server boundary separately verifies progression beyond 90 seconds to the legacy 120-second limit.

The existing `learning/index.ts` route already parses intent, obtains database time, checks generation and request identity, retries optimistic revisions, and commits through the service role. The new command follows that route. It accepts no client stats, balances, victory, modifiers or clock values. Server catch-up derives its step bound from the battle snapshot. A long absence resolves at most one explicitly started fight and saves its victory reward for collection; it never auto-starts another stage. Client snapshot conversion also covers GET, command, reward and reset responses without importing browser ownership into signed-in accounts.

Demo uses the same model and local save conversion and keeps its existing account-owned 250ms tick loop. It resumes from its persisted simulation position after reload; offline wall-time catch-up remains a signed-in server feature. The canvas and CSS rings are decorative, including reduced-motion, stale-data and visibility handling. They cannot spawn units, advance combat or award Gold.

## Step 7 integration

`PassiveBattleModifiers` is the small HP/damage multiplier seam. It is currently the identity modifier, with no collection state, acquisition commands or placeholder controls. Later collection systems must derive modifiers from trusted ownership at Start and freeze them with effective stats. They must never accept multipliers from client commands. The original four-unit order and definitions used by legacy conversion must remain available if the roster is later reordered or retuned; introduce a new rules version for new semantics.

Real attacks and abilities belong in the fixed-step simulator. A future rules version should persist each fighter's next attack tick and attack counter, derive stable events such as `(fighterId, attackSequence, tick, targetId)`, and collect all same-tick effects before applying deaths and castle outcomes. Abilities such as every fifth shot use that persisted counter. Any gameplay projectile delay is a due simulation tick. Renderers may consume bounded event data for effects, and skip old effects on catch-up; frame callbacks, sprite releases, interpolation and animation completion must never trigger damage. Keep the rules-1/rules-2 continuous-damage path for existing battles.

## Release steps (not performed)

1. Back up account state and coordinate a brief release window for kingdom commands; older Edge code must not write over prepared armies during rollout.
2. Apply `20260906020000_prepared_army.sql` after the existing migrations. It preserves battle clocks and leaves old battle conversion to trusted code.
3. Release the updated `learning` Edge function and frontend together, and require existing browser tabs to refresh because the fighter/save schema changed. Keep both battle rules versions available. Do not downgrade saved schema-2 state to the old server; use a forward fix if necessary.
4. Smoke-test an existing active 120-second battle, a fresh account, a selected/empty army, retry after a network interruption, offline return, and Reset Progress. Verify no duplicate Gold and no browser-to-account import.

Validation commands: `npm test`, `npm run test:db`, `npm run build`, `npm run lint`. Database tests apply every migration to isolated PostgreSQL/PGlite, with no production connection. No deployment is part of this implementation.

Implementation validation: 319 tests across 36 files passed; all 117 database security/transaction checks passed; production build and lint passed. The existing AuthContext Fast Refresh lint warning and Vite bundle-size warning remain.

## Army and reward interaction update

Army preparation now uses five portrait squares. A square opens detailed stats and explicit assignment controls; construction never assigns a unit. An available, unassigned unit keeps the next empty square highlighted, including after a reload or clearing a slot. Goal completion controls navigate to the normal Castle or building section without purchasing.

New victories save `battle.rewardCollected: false` and advance the campaign without crediting Gold. The battlefield shows Collect until the trusted `collect-battle` command credits the stage reward and saves `rewardCollected: true` atomically. Starting another battle is rejected while a reward is pending. Commands include the stage to reject stale collection requests; retries cannot credit twice. Historical victories with no collection field are already paid and convert to collected; historical active battles require collection when they finish.

Apply `20260906030000_battle_reward_collection.sql`, then release the updated `learning` Edge function and frontend together. Use the coordinated release window described above so older code cannot auto-credit new pending victories. The migration only adds the collection command to the existing trusted commit allowlist; it does not change balances. These release steps have not been performed.

## Initial recruitment and Gold animation

New battles start with no fighters. Each equipped unit waits one full effective spawn interval before its first recruit (4.5s Swordsman, 6s Archer, 9s Knight, 12s Catapult), then continues on the same cadence. Existing battles keep their saved recruitment deadlines. The measurements above include this initial wait.

Successful victory collection flies Gold coins from Collect into the Gold HUD balance. Failed saves keep the reward pending without an animation; reduced motion skips the flight. Deploy the updated `learning` Edge Function and frontend; no database migration is required for this update.
