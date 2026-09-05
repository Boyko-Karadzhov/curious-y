# 05 — The castle as a progression tree

Source: [Gamify Learning App, section 5](https://chatgpt.com/share/6a9aca81-d5b4-83eb-be7c-9f0cc0dfadf5). Repository assessment: 2026-09-06; source inspection, not live verification.

## Intended outcome

The Keep controls health, building caps, system unlocks, and visual evolution. Barracks, Range, Workshop, and Academy support distinct combat specialties; Forge, Treasury, and Library add longer progression. Library advancement reflects actual learning accomplishments.

## Already implemented

- Shared `MAX_LEVEL = 5`, `castleHp`, `castleCost`, and `buildingCost` implement a small progression system. Castle levels cap building levels and gate Stable/Workshop.
- Barracks, Archery Range, Stable, and Siege Workshop unlock four units. Each extra building level adds 30% of base HP and damage.
- Purchases already have authoritative commands, cost checks, active-battle restrictions, and transaction protection.
- The management panel displays upgrade costs and stat changes; the sidebar and battlefield use fixed castle artwork.

## Current gaps

- Building progression mostly raises two stats; armor, accuracy, multishot, area damage, penetration, healing, and crowd control are absent from combat.
- No Academy, Forge, Treasury building, or Library exists in the active Kingdom model. “Treasury” currently labels the Gold balance rather than a building.
- No milestone unlock graph or visual evolution represents Castle growth beyond the level number.
- Library levels are not derived from verified learning. Counting all mastered concepts blindly would count assumed-mastered atomic prerequisites as achievements.
- Expanding `BuildingId` currently affects fighter kinds, spawn records, parsing, command validation, SQL defaults, and UI. Step 2's separation of units/buildings should be reused.

## Proposed delivery boundary

Retain Stable as an existing building. Introduce distinct upgrade branches and a functioning Academy/support slice; add Library milestone progression at 10/30/75/150 qualifying proficient-or-mastered concepts, as sketched in the session. Define an explicit policy excluding assumed mastery. Keep Forge equipment crafting in section 10 and Treasury offline production in section 22 as later dependencies; do not pretend those whole systems are included here. Their registry/unlock definitions can be prepared without unusable navigation. Proposed Treasury behavior for this step is a modest victory-Gold bonus, with exact tuning documented.

## Ready-to-paste prompt

```text
Implement step 5 in .plan/05-castle-progression.md. Recheck steps 1–4 and evolve the existing Castle into a clear building progression tree while preserving current players' progress.

1. Make building definitions data-driven: stable IDs, unlock requirements, level caps, costs, upgrade branches, and explicit effects. Treat the existing Castle level as the Keep. Preserve Barracks, Range, Stable, and Workshop ownership/levels/cost obligations through a versioned migration; do not rename stored IDs casually.
2. Give existing military buildings meaningful specialties instead of only uniform HP/damage growth. Implement a bounded first set of real effects (for example Barracks durability, Range reach, Workshop area damage/reload, Stable mobility), with tooltips showing current and next effects. Implement whatever combat support those selected effects require; no display-only stat promises. Integrate with the prepared army/battle snapshot from step 2.
3. Add an Academy and a playable support-unit effect such as healing. It must fit the same army-slot/spawn rules, have counters/limits, and not produce unbounded healing or permanent battles. Step 7 can expand its roster.
4. Add a Library earned through verified learning: levels at 10, 30, 75, and 150 distinct qualifying proficient-or-mastered concepts. Resolve canonical aliases, exclude assumed-mastered atomic prerequisites, and document eligibility for existing server concepts. Derive progress from trusted mastery records and reconcile it idempotently; currency cannot buy Library progress. Include explicit, modest benefits and show the next knowledge milestone. Preserve mastery itself independently from game balancing.
5. Add a Treasury building with a bounded, documented victory-Gold bonus applied exactly once to eligible battle rewards. Snapshot applicable bonuses when a battle starts and show the actual paid amount in results. Keep passive/offline production for its later mechanic. Prepare Forge as a future building/unlock definition if useful, but do not ship a fake crafting screen or implement section 10 equipment here.
6. Show the Keep's visual evolution and the building/unlock tree in the existing responsive Castle interface. Use existing/local visual techniques where practical, preserve keyboard/reduced-motion support, and connect costs to step 1's learning goals. Keep building progression and source-defined future systems clearly distinguishable.

Update shared rules, save parsing/migrations, server command validation and SQL allowlists, Demo storage, snapshots, reset logic, HUD/result metadata, and documentation as required. Maintain server-authoritative purchases, atomic spending, and account isolation. Do not import editable Demo progress into signed-in accounts.

Test unlock/cap rules, effects in real battles, purchase races/retries, old-save migration, Library threshold crossings/aliases/atomic exclusions, refresh/reset, and Treasury payouts after upgrades/retries. Run relevant kingdom/server/journey tests, npm run test:db, npm run build, and npm run lint. Report the implemented branch/effect table, balance choices, and explicit Forge/offline dependencies. Do not deploy.
```
