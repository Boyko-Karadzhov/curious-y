# Learning-value rewards — step 4

Step 3 was verified in `20260906040000_weighted_learning_resources.sql`, the shared resource allocator, the answer/pending/collection responses, Demo recovery, and the wallet/journey tests. Step 4 extends its immutable receipt. It does not change the mastery thresholds, reasoning eligibility, prerequisites, Castle wallet keys, or explicit collection requirement.

## Version and calculation

`supabase/functions/_shared/learning-value-tuning.json` is the tuning source for `learning-value-v1`. The Demo calculator imports it. `node scripts/sync-learning-tuning.mjs` embeds the identical JSON in the forward migration; `npm run test:db` rejects drift and compares the actual TypeScript calculator with PostgreSQL over all seven reasoning factors and relevant states. Future balance changes require a new version and forward migration, updating the generator target; never rewrite a deployed migration or historical receipt.

Multiply base 20 by these factors, using the state **before** mastery changes:

| Factor | Multiplier |
| --- | --- |
| Correct / incorrect | 1 / 0.20 |
| Direct inference | 1 |
| Composition | 1.15 |
| Discrimination | 1.20 |
| Transfer | 1.30 |
| Counterfactual | 1.40 |
| Synthesis | 1.55 |
| Derivation | 1.75 |
| First successful canonical encounter, correct and non-atomic | 1.25 |
| Already mastered, non-due practice | 0.30 |
| Due review | 1.20 |
| Successful, verified boss, non-atomic | 4 |

Unmatched factors are 1. First success and due review are mutually exclusive. First success and boss bonuses require correctness; a due failed review can receive the review factor but also receives the incorrect factor and consumes the low-value budget. First success can stack with reasoning and a verified successful boss. Due review can stack with reasoning and a verified successful boss. Mastered practice and due review do not stack.

**Rounding:** apply all factors except repetition; cap this subtotal at 175, or at 10 for low-value attempts; apply the repetition factor; round once to the nearest integer, with halves rounded up. Final range is **0–175**. There is no positive minimum. In particular, a correct mastered direct-inference answer pays 6, and an incorrect one pays 1 before repetition limits. There are no minimums on individual resource lines.

**Additional anti-farming defaults:** after three successes on a reasoning axis, further non-due practice on that axis receives the same 0.30 practice factor and low-value treatment, even if other axes are not yet mastered. This closes a profitable repeated-direct-inference loop without changing learning eligibility or mastery progression. Atomic foundations and missing/invalid concept metadata also receive conservative 0.30 practice treatment. Low-value means any incorrect answer or any of those practice cases.

The first three low-value attempts across the **whole account and UTC day** use repetition factors **1, 0.50, 0.25**; subsequent ones use **0**. Because the subtotal cap is applied before repetition and rounding, the per-day maximum is **10 + 5 + 3 = 18 Resources**, including repeated bosses. Changing question IDs, topics, aliases or concepts cannot reset this budget. Ordinary learning successes and successful due reviews neither consume nor reset it. Zero-paying answers still advance eligible learning and create a receipt requiring Collect; this cap never blocks question access. Existing backend request/provider quotas are separate and unchanged.

## Worked payouts and affordability

Examples assume the day's first low-value attempt unless otherwise stated:

| Encounter | Arithmetic | Total |
| --- | --- | ---: |
| First correct direct inference | 20 × 1 × 1 × 1.25 | 25 |
| Continued useful direct inference | 20 | 20 |
| Useful composition | 20 × 1.15 | 23 |
| Useful discrimination | 20 × 1.20 | 24 |
| Useful transfer | 20 × 1.30 | 26 |
| Useful counterfactual | 20 × 1.40 | 28 |
| Useful synthesis | 20 × 1.55 | 31 |
| Useful derivation that completes mastery | 20 × 1.75, using pre-answer proficiency | 35 |
| First successful derivation boss | 20 × 1.75 × 1.25 × 4 | 175 |
| Due mastered direct inference | 20 × 1.20 | 24 |
| Mastered non-due direct inference | 20 × 0.30 | 6 |
| Wrong direct inference | 20 × 0.20 | 4 |
| Wrong mastered direct inference | round(20 × 0.20 × 0.30) | 1 |
| Missing concept metadata, correct | 20 × 0.30; bonuses suppressed | 6 |
| Repeated mastered direct inference today | round(6 × [1, .5, .25, 0…]) | 6, 3, 2, 0… |
| Repeated wrong direct inference today | round(4 × [1, .5, .25, 0…]) | 4, 2, 1, 0… |

Step 3's Hamilton allocation floors proportional shares, then awards leftovers by descending remainder and canonical resource order for ties; zero lines are omitted. A first-success total of 25 at Physics .7 / Mathematics & Logic .2 / Earth & Space .1 pays **18 Force, 5 Runes, 2 Astral Dust**. A total of 28 pays **20 Force, 5 Runes, 3 Astral Dust**. The latter exposed binary-floating-point tie instability; the shared allocator now uses decimal integers for normalization/allocation, preserving the intended rule and SQL agreement. Existing receipts are not reallocated.

Keep the initial Barracks at **10 Force**: one fresh correct 100%-Physics direct-inference answer pays 25 Force, leaving 15 after construction. The mixed-topic first success above leaves 8 Force after construction. One mastered direct-inference answer is insufficient; repeated wrong direct-inference farming totals only 7 Resources per UTC day. Useful learning therefore funds the kingdom substantially faster. Goal copy shows actual missing Resources and explains variable, split payouts instead of promising one answer always earns 10. Later construction prices are unchanged; monitor early progression before retuning them.

## Authoritative answer transaction

The authenticated Edge Function accepts a question ID and selected index. It does not accept client-declared correctness, topic distribution, boss/review status, first success, reward amounts, or time. Issuance already validates canonical identity, topic membership and prerequisites. Account reads cannot write questions, concepts, budgets or reward events.

The database locks the account, issued question, existing event (if present), canonical concept, and daily budget in that order. The account lock serializes generation, distinct alias questions, answer retries, collection, spending and reset. A retry returns the saved receipt and does not touch attempts, mastery, review dates, or the budget. A second outstanding question cannot be answered until the first receipt is collected. After collection it sees the committed canonical success and cannot receive novelty again.

For a new target, the trusted issued concept name and definition establish metadata. Existing concepts resolve canonical names before aliases, normalizing whitespace and case. Canonical identity is passed into the existing mastery scorer so a legacy alias cannot create a duplicate concept. A missing target/definition or invalid reasoning uses a declared conservative fallback: no reasoning, novelty, review or boss premium; practice ×0.30 and the account low-value limit apply. A successful fallback with an identifiable concept is still recorded as a success so later metadata recovery cannot retrospectively earn novelty.

Each receipt stores the version, server answer time, canonical identity, pre-answer mastery, atomic status, previous successes, axis successes, next-due timestamp, low-value count, reasoning/boss inputs, all factors, raw/capped values, rounding rule, final integer total and exact resource lines. The existing immutable-event trigger protects it. Later collection, balance-version changes, mastery changes, or refreshes do not recalculate it. Legacy `game_stats` activity counters remain compatible; financial fields remain frozen and are not new Castle rewards. Gold comes from battle collection.

## Persisted review schedule

Concepts store `reward_attempts`, `reward_successes`, `last_attempt_at`, `last_success_at`, `review_step` and `next_due_at`. Automatic atomic mastery contributes no earned success, novelty or review schedule. The migration marks pre-existing non-atomic earned tracks/mastery as having prior success (a conservative historical lower bound) to prevent granting old novelty again. It does **not** fabricate a last-success timestamp or derive a review deadline from `last_asked`; review dates start on the next successful practice. Counters for new attempts are recorded from rollout onward.

- First success schedules **answer time + 1 day**, step 0.
- A due success advances through **3, 7, 14, 30 days**, then stays at 30 days; each interval starts at that answer's server time.
- A successful early practice keeps the existing deadline and step. It cannot accelerate the ladder or repeatedly receive a due bonus.
- A failure before any success records the attempt but leaves the deadline null.
- A failure after prior success, early or due, resets to step 0 and schedules a retry **one day after that attempt**. It preserves earned mastery, success count and last-success time. Repeated failures reschedule that one-day retry and encounter the account payout cap.
- Due means a non-atomic, previously successful concept with a persisted `next_due_at <= server answer time`. The exact boundary is inclusive. Neither `lastAsked` nor `isReinforcement` proves due status.

The learning flow prioritizes the oldest eligible due concept in the requested topic through a separate review lane, including mastered concepts. The normal mastery eligibility engine stays intact. Both generation paths honor prerequisites and reasoning gates; atomic concepts and blocked dependencies are excluded. Review generation normally requests a non-boss question. SQL decides the actual bonus at answer time, including a deadline that passed after issuance.

## Demo and compatibility

Explorer Demo uses the same calculator with local pre-answer snapshots. One local ledger write saves receipt, canonical progress, attempts/successes, due schedule, budget and pending question together. Account-specific Web Locks serialize answers and wallet changes where supported; reset uses the same lock and increments a generation to invalidate old issued questions. Without Web Locks the guarantee is single-tab. Local time is used only in Demo; signed-in rewards never use Demo state or time.

Old pending Demo questions without a receipt retain their promised 10/3 single-topic obligation. Step 3 weighted receipts and all old server events are left intact. Old collected receipts remain collected. Collection remains explicit and idempotent, including a retry after wallet success but pending cleanup failure. Reset clears the Demo ledger and invalidates server events by generation; another account cannot recover or collect them.

## Release requirements

1. Run `npm test`, `npm run test:db`, `npm run build`, and `npm run lint`. Also run `npm run test:db` with `SECURITY_TEST_DATABASE_URL` pointing to a new disposable localhost PostgreSQL database to exercise independent connections. The harness refuses remote hosts and an existing Supabase schema. Tests cover every reasoning factor, SQL/Demo parity, exact allocation ties, aliases and distinct concurrent issuances, pre-answer mastery, due boundaries, atomic foundations, failures, verified bosses, version changes, old obligations, collection retries and reset/account isolation.
2. Review `npx supabase db push --dry-run`; apply the forward `20260906050000_learning_value.sql` and `20260906060000_stable_reward_identity.sql` migrations. The latter gives exact canonical names priority over historical case variants and makes tie-breaking independent of database locale. Step 3 must already be installed. Do not replay scoring or backfill credits.
3. Deploy `npx supabase functions deploy learning` to the linked project, retaining JWT configuration. It is the only Edge Function. The migration must precede this deploy because generation reads the new review columns.
4. Push the committed frontend to `main` and confirm the existing Pages workflow passes and publishes. Step 3 clients can still collect the exact receipt during rollout; reload to see explanations and use the updated Demo ledger. Preserve receipt-aware rendering on rollback.
5. Verify remote migration synchronization, the active Edge Function deployment and the Pages commit. No additional secrets, wallet imports or destructive resets are required. Check completion rates, first-building time and the share of zero-paying attempts before changing tuning.

The initial checks retain the existing AuthContext fast-refresh lint warning and Vite bundle-size advisory; neither blocks release.

Release verification on 2026-09-06: 353 tests passed across 39 suites; 1,456 database checks passed in PGlite and 1,499 passed against disposable PostgreSQL 18 with real concurrent sessions. CI's PostgreSQL locale exposed a case-variant identity ambiguity, addressed by the follow-up migration and an additional client/server identity test. The 1,499 checks also pass in a fresh English ICU database reproducing CI's case ordering. Production build and lint passed (the existing warnings above remain).
