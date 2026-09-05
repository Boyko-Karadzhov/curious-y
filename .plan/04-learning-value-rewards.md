# 04 — Reward learning value

Source: [Gamify Learning App, section 4](https://chatgpt.com/share/6a9aca81-d5b4-83eb-be7c-9f0cc0dfadf5). Repository assessment: 2026-09-06; source inspection, not live verification.

## Intended outcome

Meaningful progress should earn more than repeated easy answers. The session proposes correctness, reasoning difficulty, mastery need, novelty, and due-review multipliers, distributed through topic weights.

## Already implemented

- `Question` records reasoning complexity and boss status. `Concept` has mastery, a seven-axis reasoning track, topic weights, and `lastAsked`.
- `src/lib/concepts/mastery.ts` implements the learning rules. Atomic concepts are assumed mastered, which must not be mistaken for earned game achievements.
- The older `src/game/economy.ts` calculator and `score_question_internal` SQL contain reasoning multipliers, a boss multiplier, and correctness scaling.
- Server answer processing updates mastery and records a single-use learning reward event. However, the active Castle still uses flat 10/3 rewards.

## Current gaps

- There is no active Castle scoring for novelty, mastery need, or due spaced review.
- `lastAsked` alone is insufficient for a due-review system; in the inspected scoring SQL it updates on successful tracked answers, not all attempts. There is no explicit persisted review schedule in the current reward path.
- Current pending UI discards the richer backend reward metadata. Step 3 should establish the authoritative payload this step extends.
- First-success and pre-answer mastery must be determined before mastery mutation, inside the same transaction. Client state and newly generated question IDs cannot establish novelty.
- Wrong-answer and mastered-question farming need explicit limits. The old minimum of 10 for correct answers would erase some intended low-value penalties.

## Proposed initial tuning

These are implementation defaults to validate, not established balance:

- Base 20; correctness 1 or 0.20.
- Reasoning: direct inference 1, composition 1.15, discrimination 1.20, transfer 1.30, counterfactual 1.40, synthesis 1.55, derivation 1.75.
- First successful canonical concept encounter ×1.25; already-mastered and not-due practice ×0.30; genuinely due review ×1.20; successful boss ×4. Other factors default to 1.
- First success and due review cannot apply to the same encounter. Boss/first-success bonuses require correctness. Record wrong attempts without letting repeated misses generate an unlimited profitable loop.
- Add a small server review schedule with documented intervals (proposed 1/3/7/14/30 days). A reinforcement flag alone does not prove review eligibility. Keep learning unlimited; any reward repetition cap limits reward bonuses/amounts, not access to questions.

## Ready-to-paste prompt

```text
Implement step 4 in .plan/04-learning-value-rewards.md after verifying step 3's authoritative multi-resource reward contract is present. Replace flat Castle answer rewards with learning-value scoring; keep the learning/mastery engine's eligibility and progression rules intact.

Implement a versioned, explainable reward calculation using the proposed tuning in the plan: base 20, correctness 1/0.20, seven reasoning multipliers, first-success novelty 1.25, mastered non-due practice 0.30, due review 1.20, and a successful boss multiplier of 4. Specify rounding, minimum/maximum reward, factor stacking, and a bounded policy for repeated low-value attempts. Ensure minimum payouts do not cancel mastered-practice penalties. Keep all tuning centralized and document adjustments with worked examples.

Derive inputs from trusted issued-question metadata and persisted pre-answer concept/attempt state. In the answer transaction, resolve canonical identity and aliases, lock the needed records, determine first success and due status, calculate and store the reward/factor breakdown, update mastery/review state, and create the pending entitlement exactly once. Retrying or concurrently answering must not award novelty twice. Missing concept metadata must use an explicit conservative fallback.

Implement the minimum reliable persisted spaced-review schedule needed to establish review eligibility; use server time, distinguish attempts from successes, and persist next-due state. The proposed interval sequence is 1/3/7/14/30 days. Define failure/rescheduling rules. Make due practice reachable through the learning flow while honoring prerequisites. Do not infer due status just from isReinforcement or lastAsked, and do not let clients declare a review or boss bonus. Automatically mastered atomic prerequisites are not earned novelty/mastery milestones.

Apply step 3's exact integer distribution to the computed total. Keep reward snapshots immutable across refresh, later mastery changes, collection, and balance-version updates. Preserve old pending rewards at their originally promised amounts. The actual Castle wallet and displayed reward must agree; do not expose legacy game_stats Gold/Keys as new rewards. Collection remains explicit and idempotent.

Show concise resource lines and understandable bonus/penalty explanations after answering. Mirror the same scoring rules in Explorer Demo using locally snapshotted inputs, while keeping signed-in rewards server-authoritative. Revisit first-building affordability and goal copy now that one answer is no longer always worth 10/3. Demonstrate that useful learning advances the kingdom more efficiently than repetitive mastered or wrong-answer farming.

Test every reasoning factor, first success including aliases/concurrency, pre-answer mastery, due/not-due time boundaries, atomic concepts, repeated failures, boss correctness, integer allocation, old reward migration, collection retries, and reset/account isolation. Run relevant mastery/economy/security/journey tests, npm run test:db, npm run build, and npm run lint. Document worked payouts, anti-farming behavior, and release requirements; do not deploy.
```
