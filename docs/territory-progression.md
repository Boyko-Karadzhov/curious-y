# Territory progression — state 11, battle rules 14

Learn across related subjects, recruit copies at one Hall, equip up to five copies, and conquer permanent territory. Recruitment and equipment are the two randomized collections. The Keep, Treasury, War Academy, Library and Knowledge Towers provide permanent progression.

## Territory and daily tribute

Each first-time stage victory adds one territory. Daily tribute is `floor(territories × 10 × (100 + 2 × Treasury level) / 100)` Gold. One correct answer pays today's tribute automatically; a wrong answer leaves the player free to try another question. Resource Collect remains a separate, idempotent learning reward action. Neither Treasury construction nor clicking Collect is required for tribute.

Days reset at **00:00 UTC**. Only today's income is available: absent days do not accumulate or reduce savings, territory or lifetime Gold. The first conquest starts income immediately, including when the player already answered correctly today. Further conquests join the next day's territory count. A Treasury upgrade affects future unpaid tribute; it does not reopen an already paid day.

First-time victories separately pay `60 + 10 × (stage − 1)` Gold on battle collection. Treasury no longer boosts that payment. Gold funds permanent kingdom upgrades; lifetime Gold counts all earned tribute, victory rewards and equipment sales, and never decreases when spending. It is a personal score, without a shared leaderboard.

## Related resource recipes

| Use | Recipe | Gate / progression |
| --- | --- | --- |
| Build Recruitment Hall | 5 Essence + 5 Astral Dust | Keep 1 |
| Recruit three copies | 8 Essence + 8 Astral Dust | Life + Earth & Space; one Hall for every class |
| Build Forge | 10 Force + 10 Reagents | Keep 2 |
| Forge one equipment item | 8 Force + 8 Reagents | Physics + Chemistry |
| Upgrade Keep from level L | 40L Gold + 10L Insight + 10L Influence | Mind & Behavior + Society & History; cap 5 |
| War Academy level 1 / 2 | 30 / 60 Gold + 10 / 20 each Runes and Logic Cores | Mathematics & Logic + Computer Science; Keep 2 |
| Treasury next level N | 40N Gold | Keep at least max(2,N); cap 5 |

There is no resource exchange. Library milestones and eight Knowledge Towers retain their learning-based progression. The former Range, Stable and Workshop plots are removed from the current map.

## Recruitment, copies and merging

The starter pack guarantees a Militia, Slinger and Hatchling. Every later draw chooses uniformly among melee, ranged, swarm, healer and siege, then uses the Hall's tier odds. Three independent copies are kept; none are automatically merged. Every ten successful packs raise Hall level, capped at 100. The existing tier probability curve and training XP formulas remain in shared tuning.

Five army slots may contain the same type repeatedly, but require five distinct owned copy IDs. Each slot has its own deployment timer. Optional merging transfers donor innate plus invested XP into a chosen recipient of the same class. Donors are consumed, recipient tier stays fixed, and equipped or protected donors cannot be selected. Battles never consume owned copies. See [recruitment mechanics](unit-collection.md).

## Swarm and research

Cavalry is replaced with Hatchling → Forager → Stinger → Ravager → Hive Guard. Each deployment creates five independently targetable creatures. Together they reserve one capacity point until the last creature dies. Each side has **32 deployment points**, allowing up to 160 swarm creatures. Area attacks can hit clusters. Replays preserve slot timers and deployment group IDs.

War Academy unlocks freely selectable doctrines between battles. Balanced has no modifiers. Level 1 unlocks Shield wall: +10 armor percentage points, capped at 50% total, with 20% slower movement. Level 2 unlocks Rapid reserves: 15% shorter deployment intervals with 10% less health. Start freezes the selected effects in the battle snapshot.

## Persistence and release

`20260908120000_territory_armies.sql` resets development army, campaign, equipment, construction and goals, preserving resource/Gold wallets, learning, earned Library progress and Knowledge Towers. Existing Gold initializes lifetime Gold. Generation advances so old game commands cannot replay into the new system; pending learning rewards move with the generation.

Signed-in tribute is derived from a verified correct-answer event inside its database transaction. The per-account lock serializes answers, commands, collection and resets. The service-only command commit protects tribute from command-authored qualification. Demo uses the same UTC rules and a saved answer timestamp, so collecting yesterday's answer today cannot qualify for today's tribute.

Apply the migration, deploy the `learning` Edge Function, then publish the frontend. Validation covers daily rollover, no double payment, first-conquest tribute, independent copies, protected merge donors, swarm capacity/replays, doctrine tradeoffs, database permissions and the full Demo journey.
