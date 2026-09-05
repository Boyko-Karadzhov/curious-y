# 01 — The fantasy: learning builds your kingdom

Source: [Gamify Learning App, section 1](https://chatgpt.com/share/6a9aca81-d5b4-83eb-be7c-9f0cc0dfadf5).

This folder follows the first seven numbered mechanics in the shared design, not its later rollout phases. Each file contains a repository gap assessment and a pasteable implementation prompt. Assessments are based on source inspection on 2026-09-06; deployed database/frontend state was not checked. Follow the numeric order, and recheck the code before implementing each file because earlier steps will change it. Proposed decisions below make the original sketches implementable; they are not additional decisions already agreed in the session.

## Intended outcome

The player owns a castle whose army fights automatically. Learning produces resources that visibly buy improvements and help win battles. The player should understand which learning action advances their next game goal.

## Already implemented

- `src/App.tsx` connects learning, pending rewards, Collect, and Castle navigation.
- `supabase/functions/_shared/kingdom.ts` implements resource spending, castle/building upgrades, automatic combat, campaign progression, and victory Gold. `src/lib/kingdom/game.ts` re-exports it for the client.
- `src/components/game/QuestRail.tsx` shows Castle progress, the four current units, and the next stage. `src/components/kingdom/KingdomPanel.tsx` shows costs and missing resources.
- `src/lib/kingdom/useKingdom.ts` uses server state for signed-in players and local storage for Explorer Demo. Combat continues while the Castle panel is closed.
- Collection is already explicit, persistent, and idempotent. There is no need to rebuild this loop from scratch.

## Current gaps

- Goals are generic: the sidebar always points toward the Castle, and “Earn more by learning” does not carry a missing resource's topic into learning.
- A player cannot pin a specific building/upgrade and track its changing deficit through answering, collecting, and purchasing.
- There is no complete contextual bridge from “I need this upgrade” to “practice this topic” to “the upgrade is ready.”
- The session's larger loop includes rolls and loot, which belong to later mechanics. The first seven steps should establish the learn/build/fight loop without prematurely adding section 8's gacha.
- README contains stale claims that Castle state is device-local, despite the implemented server-authoritative path. Documentation needs a narrow consistency update.

## Implementation boundary

Treat this as a guided-goal and progression-feedback increment. Keep current economy amounts until steps 3–4, and keep the working battlefield. Goals must use the same cost/eligibility functions as purchases. This step should work with today's four buildings and remain extensible to steps 5–7.

## Ready-to-paste prompt

```text
Implement step 1 of our Curious-Y game plan: make the learning → Resources → upgrades → automatic battles → Gold loop clear and actionable. Read .plan/01-the-fantasy.md and inspect the current repository first. Implement the feature end to end, rather than returning another plan.

The playable loop, server persistence, explicit Collect action, and battlefield already exist. Extend them with a focused progression goal:
1. Let the player select a building construction, building upgrade, or Castle upgrade as their current goal. Give a new player a sensible initial Barracks goal; let them change or dismiss it. Compute unlock conditions, price, resource deficits, and readiness from the real Kingdom state and shared rules.
2. Show that goal beside learning and in Castle management. For each missing knowledge resource, provide a clear action that opens learning in its canonical topic. For missing Gold, link to the next available battle. Respect pending rewards, generation in progress, API-key requirements, and battle upgrade restrictions when navigating.
3. Update progress only from committed reward collection/purchase state. Show when an upgrade becomes affordable, offer the real upgrade action, and let the player choose a new goal after completion. Affordability must not be presented as purchasability when a Castle gate or active battle still blocks it.
4. Persist the selected goal across reloads and isolate it per account; it is a preference, never a trusted source of balances or unlocks. Handle deleted, completed, or invalid goal targets gracefully. Preserve Explorer Demo.
5. Keep mobile and keyboard interaction clear, preserve reduced-motion support, and use the existing visual style. Keep learning, explanations, and follow-up chat easy to reach.

Use src/App.tsx, QuestRail, the real components/kingdom/KingdomPanel.tsx, TopicSelectionPrompt, and the shared kingdom rules as entry points. components/game/KingdomPanel.tsx is only a re-export. Do not change reward math, add gacha/social systems, or rebuild combat in this step. Correct documentation that still describes the signed-in Castle as device-local.

Verify the journey from a fresh Demo account through a Physics answer, Collect, Barracks construction, and a first battle. Add focused integration coverage for topic navigation, goal completion, reload/account isolation, and unavailable/pending states. Run the relevant existing journey tests, npm run build, and npm run lint. Summarize changes, verification, and any remaining limitations.
```
