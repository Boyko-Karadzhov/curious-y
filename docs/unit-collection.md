# Step 7: collectible units and counter builds

Schema 5 and battle rules 5 add 20 usable units. The catalog is `supabase/functions/_shared/units.ts`; buildings remain in `kingdom.ts`. IDs are permanent. Each catalog entry supplies rarity, tags, role, HP/damage/range/speed, recruitment cadence, Keep multiplier, an authoritative ability, traits, unlock gates, equipment-slot definitions, a badge/color and a local SVG. There are no random acquisition, payment, shard or equipment actions.

## Roster and deterministic unlocks

All listed requirements are conjunctive. Stages are the numeric campaign stages shown in scouting (stage 15 is 2-5). Verified concepts use the existing protected Library eligibility, excluding assumed/atomic concepts and merging aliases. Units remain owned after later knowledge corrections. The five starters are granted automatically by construction, including on migrated saves; the other fifteen have a free, idempotent Unlock action. Building eligibility remains necessary to equip an owned unit.

| Stable ID / unit | Rarity | Unlock | Role / ability | Base recruit seconds in rules 5 |
| --- | --- | --- | --- | ---: |
| `swordsman` / Swordsman | Common | Barracks 1 | Frequent frontline; +4 pp guard armor | 4.5 |
| `archer` / Archer | Common | Range 1 | +60% damage to swarm | 6 |
| `knight` / Knight | Rare | Stable 1 | Durable cavalry; first attack +60% | 9 |
| `catapult` / Catapult | Rare | Workshop 1 | Two-target 35% splash; triple Keep damage | 12 |
| `medic` / Medic | Common | Academy 1 | Capped single-ally healing | 12 |
| `spearman` / Spearman | Common | Barracks 1; clear 1 | +150% damage to cavalry | 5.25 |
| `shieldbearer` / Shieldbearer | Uncommon | Barracks 2; clear 3 | +28 pp armor; weak damage | 7.5 |
| `berserker` / Berserker | Uncommon | Barracks 2; clear 5 | +80% damage below half target HP | 6 |
| `duelist` / Duelist | Rare | Barracks 3; clear 10 | Every attack ignores armor | 7.5 |
| `slinger` / Slinger | Common | Range 1; clear 2 | Fragile swarm; +80% against siege | 3 |
| `crossbowman` / Crossbowman | Uncommon | Range 2; clear 4 | +90% damage to heavy units | 7.5 |
| `ranger` / Ranger | Uncommon | Range 2; clear 7 | Long reach; +60% against ranged | 8.25 |
| `clockwork-gunner` / Clockwork Gunner | Rare | Workshop 2; clear 8 | Every fifth shot ignores armor and pierces two targets behind | 9 |
| `scout-rider` / Scout Rider | Common | Stable 1; clear 3 | Fast swarm cavalry; double damage to supports | 5.25 |
| `lancer` / Lancer | Uncommon | Stable 2; clear 6 | Triple first-hit charge; vulnerable to pikes | 10.5 |
| `ram` / Battering Ram | Uncommon | Workshop 1; clear 5 | +20 pp armor; fivefold Keep damage, short reach | 12 |
| `bombardier` / Bombardier | Uncommon | Workshop 2; clear 9 | 50% splash to three neighbors, fragile and short ranged | 9.75 |
| `frost-mage` / Frost Mage | Rare | Academy 2; clear 5; 3 verified concepts | 30% movement slow for 2s, never stacks | 9.75 |
| `battle-sage` / Battle Sage | Rare | Academy 3; clear 10; 10 verified concepts | Three nearby non-support allies gain 15% damage for 2.5s | 12 |
| `astral-colossus` / Astral Colossus | Epic | Academy 3; clear 15; 15 verified concepts | Durable, slow; 50% area damage to four neighbors | 18 |

Rarity adds **zero** automatic HP/damage multiplier. The Colossus sacrifices movement and recruitment; cavalry is vulnerable to Spearman; specialists sacrifice health, range or ordinary damage. Attack cadences are explicit (0.75–3s). Source catalog stats are converted with the existing one-third battle tempo; the table gives actual recruitment seconds before Computation towers.

## Progression, costs and buildings

Ownership is `Kingdom.units[id]`; each record has independent `level` (1–5), `stars` (1–3), and `{weapon:null, armor:null, charm:null}`. No hidden gear contributes stats. A missing inventory entry means locked; building ownership deterministically restores starter entitlements.

At current level L, the next level costs **20L Gold plus 5L of each recruitment building's existing topic Resources**. Keep level L+1 is required. Costs are 20/40/60/80 Gold and 5/10/15/20 per required topic. Total level-1-to-5 cost is 200 Gold and 50 per topic.

At current star S, promotion costs **60S Gold plus 15S of each recruitment building's topic Resources**, requires unit level 2S and campaign stage 5S cleared. Star 2 costs 60 Gold/15 per topic, requires unit level 2 and clear 5; star 3 costs 120 Gold/30 per topic, requires level 4 and clear 10. Total full promotion costs 180 Gold and 45 per topic. Unlocking costs nothing. Units cannot be upgraded, unlocked or equipped during an active battle. An `expected` current level/star prevents two differently identified retries from buying successive levels unintentionally.

HP/damage multiplier before rounding is:

`(1 + .30 × (building level − 1)) × (1 + .08 × (unit level − 1) + .06 × (stars − 1))`.

Library HP multiplies this before integer HP rounding; damage retains the previous integer base rounding and one-third tempo. Existing tower modifiers apply once afterward, from catalog tags. Maximum unit progression adds 44%, irrespective of rarity. Barracks adds armor to its recruits, Range adds reach, Stable adds movement; Catapult retains Workshop reload/radius upgrades and Medic retains Academy healing upgrades. Other Workshop/Academy units inherit HP/damage progression and use their own ability cadence/radius. Treasury still snapshots victory Gold; towers still use earned learning rather than spendable Resources. Unit details show final HP/DPS/reach/cadence and before/after upgrade previews. Army details read frozen stats during battles.

## Authoritative combat and rendering

`unitCombat.ts` runs only for rules 5. Every 0.25s step recruits, snapshots the living field, selects valid targets, and accumulates damage/healing/movement/status changes. Counter units prefer a matching tag only when it is already in reach; otherwise nearest opponent wins. Distance then fighter ID breaks ties. No unit teleports through a frontline. Castle hits resolve together; simultaneous destruction is a draw.

All living fighters at the beginning of the step act even if the step kills them. Damage applies per hit after target armor (capped 50%); piercing bypasses armor on that specific hit. Healing applies afterward only to survivors, cannot exceed maximum HP, excludes healers and Keeps, and consumes each Medic's finite lifetime budget. Multiple healers reserve missing HP so they cannot spend beyond the missing amount. Slows and rally buffs apply after all attack decisions, refresh expiry times, and never stack. Rally excludes support allies, preventing recursive buff chains. Slow affects movement only; neither effect blocks attacks or prolongs battle duration.

The Gunner increments an actual attack counter only on a landed unit/Keep shot. Shots 5, 10, etc. bypass armor and hit at most two enemies within 9 world units behind the primary target, ordered by distance/ID. Every other shot is ordinary single-target fire. Splash hits bounded neighbor counts within each ability radius. Charges happen once per fighter; execute damage requires the target already below half HP at step start.

Snapshots persist the effective ability definition, cadence, damage period, cooldown, shot count, last attack time/target/position, healing budget remaining, and status expiry times. `seed:0` explicitly records that rules 5 use no randomness. Parsing compares ability **fields**, not object key order, because PostgreSQL JSONB reorders keys. Catch-up and polling consume the same fixed steps. New random abilities require a new rules version with a real persisted PRNG state; never use `Math.random()`.

There are 24 fighters per side (48 total), fixed 90s maximum and 360 steps. Enemy compositions cycle through swarm, armor, ranged, cavalry, siege, support and a mixed Colossus formation after five onboarding stages. Full slots, counters and named enemy roles appear in scouting. Cosmetic arrows/stones never change simulation state. New unit SVGs, all-unit text badges, team health bars, Gunner shot count/piercing beam, splash rings, slow outlines and rally markers derive from snapshots. Reduced motion keeps identities/health/badges and removes transient animation. Mobile roster uses two columns, 44px actions, visible locked requirements, and focuses/scrolls to selected details. No unavailable equipment actions are displayed.

## Save and rollout mapping

Existing v1–v4 saves become schema 5 through strict parsing; malformed modern saves do not silently reset. `barracks → swordsman`, `range → archer`, `stable → knight`, `workshop → catapult`, `academy → medic`, when that building is owned. Every migrated unit starts level 1/star 1, adding no progression multiplier: previous building HP/damage investment remains intact. Rules-5 Swordsmen gain guard and Knights gain their first-hit charge; base HP and sustained nominal damage remain comparable. Existing chosen/empty slots, wallets, buildings, Library/towers, campaign clears and pending rewards remain unchanged.

Migration `20260906100000_unit_collection.sql` adds starter inventory, updates the new-account/reset default and extends service-only SQL command/ID allowlists. It intentionally preserves existing schema tags until Edge parses the old shape and leaves battle JSON and reward receipts untouched. Account locking, generation/revision checks and command receipts serialize purchases with learning rewards, battle collection and reset. Reset creates an empty schema-5 inventory; stale purchases/rewards cannot repopulate it. Demo uses the same catalog, reducer, parser, gates and Web Locks, with existing Demo-only learning evidence; live learning eligibility remains SQL-owned.

**In-flight rules 1–4 stay on their original simulation.** Actual pre-change rules-4 snapshots captured from commit `87acfe7ddd4abe20daddae85cd5f4b3ec0ffdd81` with siege/healing are checked against outcomes generated by the previous engine, alongside existing historical fixtures. Pending victory Gold is still collected once. Do not reinterpret old fighter timers or reapply progression/towers to frozen configurations.

Release requirements: run `npm test`, `npm run test:db`, `npm run build`, `npm run lint`; apply database migration, deploy `learning` (which bundles `_shared`), then publish the frontend. Only `learning` is a deployable Edge Function. The GitHub main push workflow additionally runs separate-connection PostgreSQL concurrency tests and publishes Pages. Check deployment status and preserve prior rules in any forward fix. Older Edge builds cannot accept schema 5; avoid rolling back to them. Existing browser clients should reload after rollout.

## Balance evidence

`node scripts/measure-roster.mjs` (Node with TypeScript stripping, e.g. 24) writes `roster-balance.json`. All six builds use the same Keep 3 and all recruitment buildings 3, four level-2/star-1 units, **80 Gold and 35 total Resources** invested in those unit levels, and no Library/towers. Resource topic distributions differ. Each enemy archetype uses tier-3 stats, stage-21 Keep HP and one recruit every 8s. This controlled matrix isolates composition from campaign unlock timing; it is not a claim about PvP matchmaking.

| Build | Units | Swarm | Armored | Ranged | Cavalry | Siege | Support |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Balanced | Swordsman, Archer, Knight, Catapult | W 53.5 | W 68.25 | W 56.5 | W 61 | W 73.25 | W 54.5 |
| Pikes | Spearman, Crossbowman, Medic, Catapult | W 69 | W 83.25 | W 90 | W 71.5 | W 88.5 | W 70.75 |
| Common swarm | Swordsman, Slinger, Scout Rider, Archer | W 47.25 | W 61 | W 56.5 | W 54.75 | W 59.75 | W 47 |
| Artillery | Shieldbearer, Gunner, Bombardier, Medic | W 79 | D 90 | D 90 | W 88.25 | D 90 | W 78.5 |
| Mixed Colossus | Spearman, Archer, Colossus, Catapult | W 64.25 | W 85.25 | D 90 | W 72.25 | D 90 | W 68 |
| Astral support | Colossus, Battle Sage, Frost Mage, Shieldbearer | D 90 | D 90 | D 90 | D 90 | D 90 | D 90 |

W = victory, D = timeout draw; numbers are seconds. Several builds are viable, and high-rarity support saturation lacks finishing pressure. The mixed Colossus build succeeds against four archetypes but stalls against ranged/siege. Common-heavy armies remain competitive. These relatively lightly recruited enemies demonstrate viable campaign compositions, not universal dominance or optimized adversarial balance.

A direct counter fixture gives both sides an 18s recruitment budget at building/unit/star tier 1: three common Spearmen (15.75s required) defeat two rare Knights (18s) in **10.25s**, leaving two Spearmen. Three ordinary Swordsmen in the same formation instead lose at 16.5s. This is actual combat, including first-hit charge and armor, not only a damage multiplier comparison.

Existing campaign examples now win at stage 1: **72.5s**, 11: **75.25s**, 21: **59.5s**, 31: **75.5s**, 41: **82s** with the prior documented investments (`measure-battles.mjs`). Underprepared/unsupported armies can draw at 90s. A deliberately overprepared tier-5 army at stage 1 finishes in 40.5s; 45–90s is the comparable-investment target, not an artificial minimum that delays won battles. Matrix simulations use up to 28 total fighters and take roughly 17–39ms per whole battle on the development runtime. A separate 48-fighter, 360-step stress test checks hard caps and bounded processing, independent of rendering; production-device timings may differ.

## Future section 8 / 10 integration

Section 8 may introduce a separate acquisition policy, but deterministic earned ownership and these IDs must remain valid. Add a server-owned grant receipt/source before additional acquisition channels. Do not make existing units require duplicate shards. Any random draws need their own atomic cost/grant transaction and reviewed disclosure; none are implemented or advertised here.

Section 10 may replace null equipment slot values with validated item-instance IDs through a new schema migration, equipment inventory and transactional equip commands. Validate slot compatibility and ownership on the server, freeze item-derived stats into a new battle configuration, and retain rules-5 snapshot parsing. Crafting requires a working recipe/material economy before exposing an action. Changing combat tuning requires a new battle rules version plus preserved definitions for shipped snapshots; never silently mutate frozen abilities, tower rules, or reward obligations.
