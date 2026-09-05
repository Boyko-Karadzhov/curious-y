# 03 — Eight topics become eight resources

Source: [Gamify Learning App, section 3](https://chatgpt.com/share/6a9aca81-d5b4-83eb-be7c-9f0cc0dfadf5). Repository assessment: 2026-09-06; source inspection, not live verification.

## Intended outcome

Split each learning reward using the target concept's topic weights. The session's example distributes 20 Resources as 14 Force, 4 Runes, and 2 Astral Dust from weights 0.7/0.2/0.1.

| Topic | Resource | Identity from the session |
| --- | --- | --- |
| Physics | Force | Armor, impact, siege |
| Mathematics & Logic | Runes | Accuracy, critical hits, formations |
| Chemistry | Reagents | Fire, poison, explosives |
| Life | Essence | Health, healing, regeneration |
| Computer Science | Logic Cores | Automation, spawn speed |
| Earth & Space | Astral Dust | Range, area damage, control |
| Mind & Behavior | Insight | Morale, evasion, disruption |
| Society & History | Influence | Economy, command, army size |

## Already implemented

- All eight names and canonical mappings exist in `supabase/functions/_shared/resources.ts`, and HUD/topic cards display them.
- `Kingdom.tokens` retains topic-name storage keys; resource-specific building costs are already active.
- `Concept.topics` supports weights. `src/game/economy.ts::calculateLearningReward` accepts weighted topics, but is not the active Castle reward path.

## Current gaps

- Active Demo rewards in shared `applyAction` credit one topic. The current SQL answer/collection functions also persist and credit one `topic`/`tokens` pair.
- `LearningRewardCard`, `AnswerReward`, pending-reward recovery, and `collectResources` assume a single topic and derive the amount from correctness.
- The older weighted helper rounds each line independently and gives every line at least one unit, so line amounts can exceed the stated total. It must not simply be wired in unchanged.
- The live scoring function creates new concepts with `{question.topic: 1}`. Generation does not currently supply a validated multi-topic distribution for newly introduced concepts.
- The legacy `game_stats` reward payload differs from the actual Castle credit. The display, ledger, and wallet need one consistent authoritative resource breakdown.

## Proposed boundary

Implement distribution first, retaining the active total of 10 correct / 3 incorrect until step 4. Validate and snapshot weights on the server. Preserve existing wallet keys and old reward obligations; never recalculate historical rewards from a mutable concept record. Keep selected learning topic and interdisciplinary reward distribution as separate concepts.

## Ready-to-paste prompt

```text
Implement step 3 in .plan/03-eight-topic-resources.md: split learning Resources by authoritative concept topic weights throughout the actual Castle economy, UI, and persistence.

Keep the existing eight topic/resource mappings and Kingdom.tokens save keys. For this step retain the current total of 10 for correct answers and 3 for incorrect answers; step 4 will replace total-value calculation.

1. Resolve the target concept through its canonical identity/aliases on the server. Validate finite positive weights for recognized topics, normalize them, and snapshot the resolved distribution into the issued question/reward data. If no usable weights exist, fall back to the verified question topic. For new concepts, extend generation and persistence with validated topic weights; do not let this bypass the chosen-topic or prerequisite checks. Reuse existing canonical concept weights rather than overwriting them on each generated question.
2. Allocate the integer total using largest remainders, with canonical topic order breaking ties. Nonnegative line amounts must sum exactly to the total; omit zero lines. Test the source example 20 × 0.7/0.2/0.1 = 14/4/2, plus tiny totals and malformed input.
3. Persist one immutable reward breakdown per answered question. Collection atomically credits every line exactly once. Preserve account ownership, reset generation, request retry behavior, and wallet locking. Use a forward migration: old pending rewards must still pay their original topic/amount, and collected rewards must never be re-awarded.
4. Return that same stored payload from answer, pending-reward recovery, and collection paths as needed. Update backend types, App, Demo pending storage, AnswerReward, LearningRewardCard, QuestionCard, and collection animation to consume it. Do not reconstruct amounts from correctness or current concept weights on refresh. Animate each credited resource toward its matching HUD balance, with a reduced-motion fallback and no dependency of wallet success on animation success.
5. Resolve the mismatch between legacy game_stats reward metadata and the active Castle reward contract. Do not reintroduce answer Gold/Keys or merge legacy balances into the verified Castle wallet. Retain compatibility only where current callers need it, and document it clearly.

Inspect the shared resources/kingdom modules, src/game/economy.ts, learning/index.ts, the authoritative kingdom and collect-learning-rewards migrations, and all pending-reward paths. Keep learning topic selection, mastery, explanations, chat, and explicit Collect-before-Next behavior intact. Maintain the Demo/live behavioral parity without trusting Demo data for signed-in rewards.

Test normalized distributions, rounding conservation, fallback, immutable snapshots, exact UI/wallet agreement, old pending rewards, refresh recovery, repeat/concurrent collection, reset races, and cross-account rejection. Run relevant economy/journey/security tests, npm run test:db, npm run build, and npm run lint. Document migration and Edge Function/frontend rollout requirements without deploying.
```
