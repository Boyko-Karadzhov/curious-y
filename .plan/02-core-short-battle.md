# 02 — The core 60-second battle

Source: [Gamify Learning App, section 2](https://chatgpt.com/share/6a9aca81-d5b4-83eb-be7c-9f0cc0dfadf5). Repository assessment: 2026-09-06; source inspection, not live verification.

## Intended outcome

Automatic horizontal tug-of-war fights, normally lasting 45–90 seconds, with meaningful preparation through four unit slots. The design also mentions one Commander, three Relics, and an optional Doctrine; their collectible systems are described later in the session.

## Already implemented

- `supabase/functions/_shared/kingdom.ts`: deterministic 0.25-second simulation, moving fighters, simultaneous damage, ranged attacks, castle attacks, victory/defeat/draw, and explicit start/retry/retreat.
- All built military buildings spawn their unit immediately and then independently. The allied field cap is 24; overdue spawns wait for space without banking a burst.
- `supabase/functions/learning/kingdom.ts`: server-time catch-up, capped at 480 ticks for the current 120-second battle.
- `Battlefield.tsx`, `BattleHud.tsx`, `battleRenderer.ts`, and `battleAnimation.ts` render actual combat state and expose health, time, results, and spawn progress.
- Victory advances the next unbeaten stage and awards Gold once. Players can continue learning during combat.

## Current gaps

- The timeout is 120 seconds, repeated in simulation, save validation, server catch-up, and HUD. No demonstrated tuning establishes the desired 45–90-second normal fight length.
- There is no selectable loadout: owning a building automatically fields its unit. Unit identity and spawn timers are keyed by `BuildingId`.
- Stats are essentially HP, damage per second, range, and speed. There are no general abilities, counters, Commander, Relic, or Doctrine modifiers.
- The renderer uses cosmetic attack timings while simulation applies continuous damage. Future “every fifth shot” abilities require actual authoritative attack events, not animation callbacks.

## Proposed scope and dependencies

Step 1 can precede this independently. Introduce four explicit unit slots using stable unit IDs and the four existing units; step 7 will populate the larger roster. Reserve extensible battle modifiers, but defer Commander/Relic acquisition to section 9 and Doctrine content until designed. Use a proposed 90-second cap for new battles and tune representative fights toward 60 seconds. Version battle rules so existing 120-second battles can finish safely.

## Ready-to-paste prompt

```text
Implement step 2 of the Curious-Y plan, using .plan/02-core-short-battle.md and the current code. Extend the working deterministic tug-of-war battle into a prepared four-slot army with short, readable fights.

1. Add stable unit IDs and four persisted army slots, initially populated by eligible existing Swordsman, Archer, Knight, and Catapult units. A constructed building unlocks eligibility; only equipped units spawn. Allow empty slots but require at least one eligible unit to start. Reject duplicate or ineligible selections. Migrate existing ownership to an equivalent default loadout so players keep their army.
2. Separate the minimal unit definitions from building identity now, so step 7 can expand the roster without another battle-state redesign. Keep building upgrades as modifiers and preserve current unit roles. Do not implement the full collection system yet.
3. Freeze the validated loadout, effective stats, and rules version in each battle snapshot. Reject preparation changes during active combat. Keep deterministic simulation, explicit start/retry, fair field-cap scheduling, server-time catch-up, simultaneous outcomes, and one-time victory Gold.
4. Centralize battle duration and related limits. Use a 90-second maximum for new battles, targeting approximately 60 seconds in representative balanced encounters. Measure actual simulated fight durations and outcomes; do not just change the timer text. Preserve pre-existing 120-second battles through a versioned compatibility path.
5. Update preparation UI, spawn indicators, countdown, and renderer to use the selected slots and authoritative battle configuration. Show enough opponent information and unit roles to support a preparation decision. Keep rendering decorative and combat progression on the existing authoritative clock.
6. Add only the minimal extension points for passive battle modifiers. Commander and Relic collection belongs to later sections; do not ship nonfunctional controls. Document how step 7's real attack/ability events will integrate without making animation timings authoritative.

Inspect the shared kingdom model, parseKingdom, learning/kingdom.ts, learning/index.ts, useKingdom, BattleHud, Battlefield, battleAnimation, battleRenderer, and SQL command allowlists. Add migrations and safe save conversion where required. Preserve signed-in authority, revision/request-ID/generation checks, reset handling, and Demo support.

Test loadout eligibility and migration, empty-army rejection, spawn fairness, deterministic results, duration boundaries, simultaneous castle destruction, retreat/retry, resume after absence, and reward deduplication. Extend existing kingdom/serverKingdom/journey/battle renderer tests. Run relevant tests, npm run test:db if persistence changes, npm run build, and npm run lint. Report measured duration examples and required release steps; do not deploy as part of this implementation.
```
