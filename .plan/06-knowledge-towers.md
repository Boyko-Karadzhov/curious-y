# 06 — Eight Knowledge Towers

Source: [Gamify Learning App, section 6](https://chatgpt.com/share/6a9aca81-d5b4-83eb-be7c-9f0cc0dfadf5). Repository assessment: 2026-09-06; source inspection, not live verification.

## Intended outcome

One visually distinct tower per topic expresses what the player knows and gives modest domain-specific benefits. The source sketches Force (+0.5% heavy damage, +0.3% armor per level), Logic (+0.4% accuracy, +0.2% critical chance), and Life (+0.5% HP, +0.4% healing). It does not define tower XP, level thresholds, caps, or the other five towers' bonuses.

## Already implemented

- Eight canonical topics and resource colors/symbols provide a consistent visual vocabulary.
- Concept topic weights, mastery, reasoning tracks, and server-owned concept records provide potential learning evidence.
- Shared battle rules and the authoritative Kingdom snapshot provide the integration point for bonuses.

## Current gaps

- There is no tower state, progression rule, UI, migration, or battle modifier implementation.
- Resource balances measure unspent currency, not knowledge. Using balances as tower XP would make towers shrink when spending; using answer counts would reward repetition.
- Existing learning data includes assumed-mastered atomic concepts and aliases, so naïve aggregation inflates progress.
- The current battle lacks armor, accuracy, crit, healing, and several other proposed stats. Steps 2/5 may add some; every visible tower effect still needs a real consumer.
- Tower bonuses must not change an already-running battle halfway through a learning session.

## Proposed progression decision

Use earned proficiency evidence, not purchased upgrades: each distinct, non-atomic qualifying concept contributes one point, distributed over its normalized topic weights. Reuse step 5's Library eligibility rules. Proposed initial levels at 1/3/6/10/15 topic points, maximum level 5. Use deterministic fixed-point accounting and versioned thresholds. These thresholds and unspecified bonus choices are new defaults to validate, not source requirements.

## Ready-to-paste prompt

```text
Implement step 6 in .plan/06-knowledge-towers.md: eight visible Knowledge Towers whose progress reflects earned learning and whose modest bonuses affect the real game.

Start by inspecting the tower prerequisites delivered by steps 2–5. Reuse the canonical resource/topic catalog, Library eligibility rules, and battle modifier/snapshot model. Do not invent a second mastery system.

1. Define exactly one tower for each canonical topic, with stable ID, name, appearance, progress thresholds, cap, and effect descriptions. Use the plan's proposed earned-proficiency model: each distinct eligible non-atomic proficient/mastered concept contributes one point split by normalized topic weights; tower levels unlock at 1/3/6/10/15 points. Use deterministic fixed-point accounting. Resolve aliases and prevent duplicate/assumed mastery from counting.
2. Calculate/reconcile signed-in progress from trusted server learning records, including an explicit safe backfill for eligible existing concepts. Mirror this in Demo without trusting it on the server. Spending Resources must not lower a tower. Repeated answers to the same completed concept must not farm points. Document how corrected topic classifications or mastery data are reconciled, and version the progression rule.
3. Implement actual bounded domain bonuses. Use the source's Force, Logic, and Life examples where the required stats now exist; otherwise implement the necessary stat behavior or document a coherent substitute before shipping it. Define the remaining five towers' effects around their topic identities. Show exact additive/multiplicative stacking, caps, and affected unit tags. Avoid useless bonuses on absent mechanics, critical/accuracy probabilities above 100%, or zero/negative spawn times.
4. Apply effective tower modifiers when creating the authoritative battle snapshot. Learning that increases a tower during a fight takes effect in the next fight. Renderer/HUD must show snapshot values, and any combat randomness must be seeded and persisted for deterministic replay/catch-up.
5. Add a readable eight-tower Castle view showing levels, current effects, progress, and the next threshold, plus a compact representation beside learning. Make the player's topic strengths visible through distinct shapes/labels as well as colors. Link a tower to learning in its topic via the existing flow, while respecting pending Collect state. Keep the small-screen layout and reduced-motion accessibility usable.

Use additive migrations/versioned save conversion; preserve wallets, buildings, campaign, pending rewards, existing battles, reset generation, and account isolation. Keep Library and tower calculations based on shared evidence without double-counting.

Test all eight mappings, weighted contributions and boundaries, aliases, atomic exclusion, backfill, repeated answers, spending independence, reset, deterministic modifier stacking, unchanged active battles, and different tower profiles changing an appropriate battle outcome. Run relevant mastery/kingdom/server/UI tests, npm run test:db, npm run build, and npm run lint. Document the final progression/bonus table and release requirements without deploying.
```
