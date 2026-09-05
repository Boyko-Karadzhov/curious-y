# 07 — Units: collection and strategic builds

Source: [Gamify Learning App, section 7](https://chatgpt.com/share/6a9aca81-d5b4-83eb-be7c-9f0cc0dfadf5). Repository assessment: 2026-09-06; source inspection, not live verification.

## Intended outcome

An initial roster of about 20 units with rarity, level, stars, base stats, special abilities, traits, and equipment slots. Players maintain multiple viable builds: rarity should not simply dominate all lower-rarity options. The source names Spearman (anti-cavalry), Clockwork Gunner (every fifth shot pierces), and Astral Colossus (slow, durable, area damage), and sketches swarm/artillery/armored counter relationships.

## Already implemented

- Four concrete units: Swordsman, Archer, Knight, Catapult. Building ownership unlocks them, and building level sets HP/damage progression.
- Basic combat roles differ by speed/range/durability; Catapult has a hardcoded triple castle-damage rule.
- Existing artwork/animation renders these four roles, with no collection inventory or equipment system.

## Current gaps

- `BUILDINGS` doubles as the unit catalog; `Fighter.kind`, spawn schedules, HUD, renderer, and save validation assume four `BuildingId` values. Step 2 should begin separating these, and step 5 may introduce support units.
- No independent unit ownership, rarity, level, stars, traits, equipment-slot data, roster screen, or progression commands exist in the inspected baseline.
- No general ability/status/tag/counter system exists. Damage is applied each tick; the Gunner's fifth-shot behavior needs real attack counters and cadence persisted in battle state.
- There is no acquisition or promotion economy for 20 units. Random acquisition belongs to section 8; equipment crafting belongs to section 10.
- Current renderer mappings will not distinguish 20 units without an explicit visual identity/fallback strategy.

## Proposed initial acquisition

Provide deterministic unlocks from building levels, campaign milestones, and verified learning milestones. Upgrade levels/stars with documented Gold/resource costs and milestone gates; do not require unavailable gacha duplicates. Keep equipment-slot schema compatible with later gear, but leave slots empty until real items exist. Preserve the original four owned units and their effective power through migration.

## Ready-to-paste prompt

```text
Implement step 7 in .plan/07-unit-collection-and-builds.md: a collectible roster of approximately 20 genuinely playable units with distinct roles and viable counter-builds. Inspect and reuse the unit IDs/loadout, building progression, reward rules, and tower modifiers from the preceding steps.

1. Create a data-driven unit catalog separate from buildings. Each unit needs stable ID, name, rarity, tags/role, base combat stats, spawn cadence, ability definition, traits, and future equipment-slot definitions. Persist ownership and independent level/star progression separately. Include the existing four units, any Academy support unit, and the source examples Spearman, Clockwork Gunner, and Astral Colossus. Do not satisfy the roster target with cosmetic duplicates or inert entries.
2. Provide deterministic acquisition through building/campaign/verified-learning milestones, with visible unlock requirements. Define and implement bounded Gold/resource costs and gates for unit levels/stars. No gacha, paid rolls, duplicate-shard dependency, or equipment crafting in this step. Equipment slots can remain empty schema until section 10; do not show actions that cannot work.
3. Integrate the roster with the four army slots and existing buildings. Validate ownership, building eligibility, duplicate restrictions, and active-battle restrictions on the server. Explain the combined effects of unit level/stars, building upgrades, and towers in the UI. Rarity must carry tradeoffs such as spawn cadence or specialization, not a universal power multiplier that invalidates common units.
4. Implement the needed authoritative ability/counter mechanics: anti-cavalry damage for Spearman, actual fifth-shot piercing for Clockwork Gunner, and area damage for Astral Colossus, plus meaningful abilities for the rest. Use explicit attack cadence/counters, valid target selection, simultaneous-resolution rules, capped statuses/healing, and deterministic seeded randomness only where needed. Persist ability cooldowns/counters/seed in battle snapshots so polling, catch-up, and reload agree. Cosmetic animation events must never award damage.
5. Expand enemy compositions to exercise swarm, armored, ranged, cavalry, siege, and support counters. At comparable investment, demonstrate multiple viable compositions and at least one useful lower-rarity counter to a higher-rarity unit. Recheck the 45–90-second battle target and field-cap performance with the expanded abilities.
6. Build an accessible roster/detail/army-preparation UI with locked and owned states, role/ability explanations, upgrade previews/costs, and equip actions. Update spawn HUD, battlefield sprites/labels/effects, and result feedback so all units are distinguishable and accurately reflect the simulation. Reuse assets with honest visual distinctions where necessary; preserve mobile usability and reduced motion.
7. Migrate existing saves and signed-in state without losing the four original units, building investments, Resources, Gold, campaign progress, or pending rewards. Preserve comparable effective combat power and document the mapping. Keep existing in-flight battles compatible via versioned rules. Update strict parsing, server command and SQL allowlists, transactional purchases, reset behavior, and Demo parity.

Add focused tests for catalog integrity, acquisition eligibility, progression/costs, loadout validation, old-save migration, each distinct ability family, fifth-shot state after reload, counters, deterministic catch-up, bounded battle runtime, and duplicate/concurrent purchases or rewards. Extend existing kingdom/serverKingdom/journey/battleRenderer tests, run npm run test:db, npm run build, and npm run lint. Provide the roster/unlock table and representative balance results. Document future gacha/equipment integration points and release requirements; do not deploy.
```
