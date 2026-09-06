# Weighted learning Resources — step 3

## Contract

The Castle earns 10 Resources for a correct answer and 3 for an incorrect answer. Boss status and reasoning complexity do not change these totals until step 4. Resource names, order, and the topic-name keys in `Kingdom.tokens` remain unchanged.

Issuance resolves the target within the authenticated user's concept registry. Exact canonical identity wins over an alias; names are case-insensitive with normalized whitespace. The Edge Function validates topic membership and prerequisites before issuance. The SQL transaction repeats identity resolution and checks the reserved topic and known prerequisites under the Castle account lock. Generated topic weights cannot relabel an existing concept or remove a prerequisite.

Only finite positive numeric weights for the eight recognized topics are usable. They are normalized; when none are usable, the verified question topic receives weight 1. If usable weights exclude the selected topic, generation is rejected. `questions.topic_weights` stores the resolved distribution at issuance and cannot be changed. New concepts persist that distribution when answered; existing canonical concept weights are never overwritten by a generated question. Mastery, reasoning tracks, explanations, chat, and topic selection retain their existing behavior.

`LearningReward` contains `id` (question ID), `correct`, `totalKnowledge`, `topicWeights`, and `lines: [{ key, amount }]`. Allocation floors each proportional share, assigns remaining units by descending remainder, and uses canonical resource order for ties. Zero lines are omitted. For example, 20 × Physics .7 / Mathematics & Logic .2 / Earth & Space .1 gives 14 Force / 4 Runes / 2 Astral Dust. The active total of 10 gives 7 / 2 / 1; the incorrect total of 3 gives 2 / 1.

One `learning_reward_events.reward` payload is stored on answer. Answer retries, pending recovery, and collection return that same payload. No client refresh or collection recalculates it from correctness or current concept weights. Collection locks the account then the event, credits every stored line in one transaction, and marks collection once. The existing revision check prevents concurrent Castle spending from overwriting the credit. Generation checks prevent reset races; ownership always comes from the authenticated Edge session, never request data. The event survives deletion of question content and reset, so an old event cannot be re-awarded.

## Compatibility and migration

Apply `20260906040000_weighted_learning_resources.sql` forward. It converts existing event metadata using each event's original `topic` and `tokens`, even if its concept has changed or its question was deleted. It preserves `collected_at`, wallet balances, generations, and revisions. Existing pending rewards still pay their original 10 or 3 to the original topic. Already-collected events remain collected. Pre-rollout issued questions receive the original single-topic distribution. Do not replay historical scoring or reset production progress.

The old scorer mixed legacy `game_stats` amounts (including Gold/Keys and reasoning multipliers) into Castle receipts. New scoring updates only legacy activity counters and mastery; its financial fields are frozen. Historical legacy balances are not erased, imported, or merged into the verified Castle wallet. The `stats` response remains for current typed answer/reset callers, but is not a wallet. Castle answer receipts have no Gold/Keys fields. Gold still comes from battle collection.

`src/game/economy.ts` retains the local helper exports used by simulations/tests, but `calculateLearningReward` now uses the shared fixed-total allocator and `applyLearningReward` grants no Gold/Keys. The shared Demo `answer` action retains its optional single-topic fallback for existing local callers; active App collection always passes the saved receipt. Signed-in Kingdom commands reject `answer` actions entirely.

Demo stores the distribution at issuance and the complete receipt with the pending question. Old Demo pending questions are upgraded once using their original single-topic 10/3 obligation; this upgrade is saved immediately. Collection rechecks the saved receipt inside the local wallet transaction and uses existing reward IDs for idempotency. Web Locks serialize tabs where supported; browsers without Web Locks retain the existing single-tab guarantee. Signed-in recovery never loads Demo pending storage.

The UI displays the stored total and lines before and after collection. Each credited resource animates to its corresponding HUD balance. Reduced motion skips flying particles; the updated receipt and HUD remain visible. Animation failures, cancellations, or stalled promises cannot delay wallet success or the Next button.

## Rollout

1. Run `npm test`, `npm run test:db`, `npm run build`, and `npm run lint`. To exercise real concurrent sessions, point `SECURITY_TEST_DATABASE_URL` at a new disposable **localhost-only** PostgreSQL database and run `npm run test:db` again. The test harness refuses existing Supabase databases and non-local targets.
2. Review `npx supabase db push --dry-run`; apply the migration with `npx supabase db push`. It must precede the updated Edge Function and frontend. No secrets or balance imports are required.
3. Deploy `npx supabase functions deploy learning` to the linked project. `learning` is the only Edge Function and includes the changed shared modules. Preserve its existing JWT verification configuration. Its answer response includes the receipt both at `reward` and `question.reward`; pending recovery returns `question.reward`; collection keeps the existing Kingdom snapshot shape and attaches `reward` (also exposed at the HTTP response top level).
4. Push the frontend commit to `main`, which runs the existing test/build/database checks and publishes GitHub Pages. Treat these deployments as one coordinated release: pre-step-3 frontends still assume a single-topic reward, and must be reloaded after deployment. Do not deploy the new frontend against the old Edge Function; it cannot recover a receipt the old pending response omits. A frontend rollback must retain receipt-aware rendering while weighted obligations exist.
5. Verify Pages workflow completion, migration synchronization, and the active `learning` function version. Existing pending rewards need only normal Collect; do not replay or backfill wallet credits.

Tests cover normalization and malformed input, the source example, tiny totals and conservation, canonical aliases, immutable snapshots, new concept persistence, selected-topic/prerequisite rejection, old pending and deleted-question receipts, identical answer/recovery/collection payloads, Demo/live HUD agreement, collection retries, real concurrent collections, both serialized reset race orders, wallet revisions, and cross-account/role rejection.
