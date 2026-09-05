# Supabase access and anti-cheating review

This is the historical pre-fix review. See [the implementation record](implementation.md) for the subsequent remediation; the saved live inventories below describe the pre-deployment state.

Reviewed 2026-09-05. **The deployed database restricts direct access correctly, but the playable Castle economy and campaign are still client-authoritative.** Moving those rules and persistence behind trusted commands is the main required change. Moving code into an Edge Function alone is insufficient: resource changes and reward claims must also be transactional.

This is a review and implementation decision record. No application code, database data, policies, or deployments were changed.

## Verified scope

- Read all seven migrations, every application-defined SQL function, the `learning` Edge Function and its helpers, client Supabase calls, both game implementations, authentication/settings, and relevant tests.
- Queried the linked project's live grants, column privileges, RLS policies, role capabilities, function definitions, default privileges, publication membership, and Storage configuration. Queries returned metadata and aggregate counts, never user content or saved keys.
- All seven migrations are applied. Deployed `learning` version 11 is active with `verify_jwt=true`; all three deployed source files match the repository after line-ending normalization. All eight deployed public SQL function bodies match the final migration.
- All six application tables have RLS enabled. Only three SELECT policies remain. No public application views or public-table publication memberships were found. No Storage buckets or Storage policies were found.
- A read-only check as `authenticated` with an unrelated identity returned zero concepts, chats, stats, and history. ACL inspection found no extra browser column grants that bypass the table restrictions. This is not a full two-account REST mutation/concurrency test.
- Seven existing test files passed: **62 tests**. Local diagnostic executions of the actual game code and Edge handler reproduced the two leading findings. Database concurrency attacks were not executed against production.

Evidence: [access inventory](live-access-inventory.json), [function definitions and column grants](live-function-inventory.json), [restricted-role read result](live-role-read-checks.json), [Supabase advisors](live-security-advisors.json), and [original reproduction results](local-reproduction-results.txt). The SQL files beside this report allow the read-only checks to be repeated. The CLI returns the final result set from the role-check script; the saved result is the unrelated-identity check. The original vulnerable-code diagnostic was replaced by automated regression tests with the remediation.

## What users can access directly today

Both table privileges and RLS must permit an operation. An ownership policy only determines whose rows are accessible; it does not establish whether a score or balance is legitimate. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

| Database surface | Unauthenticated `anon` | Signed-in `authenticated` | Consequence |
| --- | --- | --- | --- |
| `public.questions` | No access | No direct SELECT, INSERT, UPDATE, DELETE, or TRUNCATE | Active answer index and explanation cannot be fetched from this table. |
| `public.concepts` | No access | SELECT all columns of own rows only | Users can see definitions, aliases, topics, prerequisites, mastery, reasoning counters, atomic status, and timestamps; cannot change them. |
| `public.chat_messages` | No access | SELECT all columns of own rows only | Users can read their conversation records; cannot insert fabricated assistant/system messages. |
| `public.game_stats` | No access | SELECT all columns of own row only | All legacy balances/progress are visible but cannot be directly edited. This is **not** the current Castle wallet. |
| `public.backend_rate_limits` | No access | No access | Users cannot directly reset counters or choose their own quotas. |
| `public.user_ai_settings` | No access | No access | Secret mappings are hidden. Key operations use authenticated Edge actions. |
| `vault.secrets`, `vault.decrypted_secrets` | No schema usage or table access | No schema usage or table access | Saved keys cannot be read directly, including by their owner. |
| `public.user_settings` | Absent | Absent | The legacy plaintext-key/provider/model table has been dropped. |
| Storage | No buckets/policies configured | No buckets/policies configured | No application file access is currently offered. Platform Storage tables have some broad grants, but RLS has no allow policies; do not confuse grants alone with a working Storage API operation. |

The API roles cannot log in to PostgreSQL directly and have neither superuser nor BYPASSRLS privileges. The Edge service role has BYPASSRLS, so every privileged command must perform authorization itself. The handler obtains identity from `auth.getUser()`, never from a submitted `userId`.

| SQL function | Direct browser execution | Authorization/boundary |
| --- | --- | --- |
| `get_question_history()` | Authenticated only | SECURITY DEFINER with empty search path; filters `q.user_id = auth.uid()` and `answered_at IS NOT NULL`. Returns every question column, including answers, only after submission. |
| `record_question_answer(uuid,uuid,integer)` | Denied | Service role only; owns the answer transaction, checks owner/expiry/replay, updates rewards/mastery. |
| `consume_backend_rate_limit(uuid,text,integer,integer)` | Denied | Service role only; row lock serializes counter consumption. |
| `set_user_gemini_key`, `get_user_gemini_key`, `delete_user_gemini_key` | Denied | Service role only; explicit user ID must come from authenticated Edge identity. |
| `handle_new_user`, `cleanup_user_gemini_secret` | Denied | Trigger functions. Cleanup remains callable by its trigger without a browser EXECUTE grant. |
| Vault helper functions | Denied | No browser EXECUTE or schema usage. |

Users can always edit browser storage, JavaScript, requests, and their own display. The security requirement is that such edits cannot become accepted account progress.

## What users can request through `learning`

Every action is accessible to any valid signed-in caller, regardless of whether the current UI exposes its button. The handler validates the session before constructing the privileged client.

| Action | Accepted intent and current behavior | Assessment |
| --- | --- | --- |
| `generate` | Topic from an eight-topic allowlist; reads own registry, selects/generates and stores question; withholds answer/explanation | Correct location. Enforce issuance concurrency and reward metadata deterministically. Six new-generation requests/minute; reuse path precedes this limit. |
| `answer` | Question ID and choice; service-only answer RPC | Correct location and good one-use transaction. Extend it to award the real Castle wallet atomically. |
| `chat` | Own **answered** question ID and message, truncated to 2,000 characters | Correct location; 20/minute. Roles/context are server-built, and chat output cannot modify progress. |
| `key_status` | Returns a boolean for caller | Appropriate. Does not disclose key. |
| `save_key` | Caller-supplied key, validated with Gemini and saved in Vault | Appropriate; five/minute. Model and provider endpoint are fixed by server code. |
| `validate_key` | Proposed or stored key; returns success | Appropriate; five/minute. |
| `delete_key` | Deletes caller's key mapping; trigger deletes Vault secret | Appropriate. |
| `delete_question` | Deletes caller's answered question and cascaded chat | Preserves ownership, but erases evidence used for novelty and future progress reconciliation. Errors are ignored. |
| `reset` | Separately deletes chats, questions, concepts, stats, then creates stats | Not atomic; can interleave with generation/answering and ignores deletion errors. |
| `upgrade` | Checks/spends legacy resources and increases legacy castle level | Has optimistic `updated_at` protection, but still interacts unsafely with daily claims. Not the playable Castle upgrade. |
| `claim_daily` | After five answers today, adds legacy gold/key once | Duplicate claim guard works; balance update has a confirmed stale-read race. |

## Findings, in priority order

### F1 — P1: Signed-in Castle progression can be fabricated entirely in the browser

Evidence: `src/App.tsx:44,209–216`, `src/lib/kingdom/useKingdom.ts:5–27`, `src/lib/kingdom/storage.ts:4–35`, `src/lib/kingdom/game.ts:99–160,167–188`.

The active app always uses `useKingdom(user.id)`, which loads `curious_y_phase1_v1_<userId>` from localStorage. After a real server answer, the client independently calls `kingdom.act({type:'answer', id, topic, correct})`. It does not use the server's stats/reward as the authoritative playable wallet.

A user can set Gold to 1,000,000, Castle/buildings to level 5, and `cleared` to 5. The parser accepts that shape. They can also invent distinct question IDs, mark them correct, and receive tokens, or clear the local `rewarded` array to remove deduplication. Battle health, fighter stats, supply, timing, result, and unlocked fronts are editable too. Browser Web Locks only coordinate cooperating tabs.

**Reproduced locally:** accepted the forged level-5 completed-campaign save; 100 never-issued answer IDs generated 2,000 spendable Gold. This does not modify protected Supabase stats, but it controls the game users actually play.

**Decision:** move the account wallet, answer-to-token rewards, exchange, Castle/building purchases, campaign gates, battle rules, and completion into trusted commands backed by database state. Keep demo play local. Never import an existing local save as verified progress. Offer a fresh verified account state or an explicitly unverified legacy sandbox; reconstruct only from records with trusted provenance.

### F2 — P1: Daily claim can refund gold spent by a concurrent upgrade

Evidence: `supabase/functions/learning/index.ts:381–409`.

`claim_daily` reads a balance, then writes the literal `oldGold + 250` with only `daily_claimed=false` as its concurrency predicate. An upgrade can commit between the read and write. The claim then overwrites the reduced balance while retaining the upgraded level and spent knowledge.

**Reproduced locally using the actual handler:** start with 1,000 Gold, five answers, and upgrade resources. Pause claim after reading; complete upgrade, leaving 500 Gold and level 2; resume claim. Final Gold is **1,250**, whereas either serial order yields **750**. A second claim is rejected, so this is not a duplicate-claim finding. Concurrent answers can instead have their newly earned gold/keys overwritten.

The deployed code contains the same defect. Its present impact is limited to the legacy economy, which the UI hides, but the API remains callable.

**Decision:** retire unused legacy commands, or replace claim/upgrade with SQL transactions that lock the same account row, recheck the day and eligibility, and apply arithmetic to current balances. Use a unique `(user_id, reward_day)` claim record. Edge code should authenticate and invoke the transaction. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

### F3 — P2: Reset is a sequence of independent transactions

Evidence: `supabase/functions/learning/index.ts:371–378`; generation spans `201–300`.

A generated question can be inserted after reset has deleted questions; it then represents the old registry in the new progress state. An answer can interleave with the individual deletes and leave mastery/rewards inconsistent. Earlier deletions can succeed even if a later delete/insert fails. Waiting for the current tab's promise does not serialize requests from other tabs or scripts.

**Decision:** implement one reset transaction with a per-user lock and a monotonically increasing progress generation/version. Reserve question issuance with that generation before calling Gemini; reject final insertion and submission if reset changed it. All progress commands must follow the same lock order. Keep rate-limit history across reset. Check every database error. No production race was attempted.

### F4 — P2, latent: The security migration does not quarantine formerly client-controlled records

Evidence: `supabase/migrations/20260904190000_secure_server_authoritative_backend.sql:3–8,315–324,364–400`; earlier question/concept write policies.

Existing question rows receive NULL `answered_at` and NULL `expires_at`, even if their old `selected_index` already records an answer. The answer RPC interprets those rows as unconsumed and non-expiring. Their answer indexes were previously browser-readable, and their contents were previously browser-writable. They can be scored once again if their IDs are retained. The new history RPC also hides old answered rows without a backfill. Formerly editable concept mastery/atomic flags remain trusted inputs to generation.

**Live qualification:** the current snapshot contains one question with no null expiry/unmarked answer, and one concept created after the security migration timestamp. No affected legacy rows were observed. This is a migration/data-provenance defect, not evidence of existing cheating.

**Decision:** identify legacy records using migration provenance, mark old answered history appropriately, and permanently disallow legacy records from earning verified rewards. Require a trusted issuance marker and non-null expiry for new scored questions. Do not recalculate verified mastery from history that was itself client-writable. No bulk deletion is recommended as part of this review.

### F5 — P2: Answer commitment and real-wallet credit are not recoverable as one operation

Evidence: `src/App.tsx:209–216`; answer RPC's replay rejection at migration line 321.

If the answer commits but its HTTP response is lost, the browser never receives the outcome and never credits its local wallet. A retry receives “already answered.” Local-storage failure or another device produces the same split. Existing tests simulate a rejected request followed by a fresh success; they do not cover a committed answer whose response was lost.

**Decision:** award the real wallet and record a unique reward event inside the answer transaction. A retry with the same choice returns the committed outcome without crediting twice; a conflicting choice is rejected. Refresh wallet state from the server. History deletion must not erase the deduplication/event record.

### F6 — P2 hardening: Future object privileges are not fully restricted

Evidence: final migration line 421 and live default/schema privileges.

New table defaults are restricted, but function defaults still fall back to PostgreSQL's PUBLIC EXECUTE, and sequence defaults grant browser access. Live `anon` and `authenticated` also have CREATE on `public`. Current custom privileged functions explicitly revoke browser execution, and the browser has no exposed arbitrary SQL/DDL command; therefore this is **not** a demonstrated current privilege escalation.

**Decision:** revoke PUBLIC/anon/authenticated default function EXECUTE for every migration-owner role, remove unneeded sequence defaults and schema CREATE, and explicitly grant each intended endpoint. Preserve UUID helpers and managed Supabase objects; avoid indiscriminate changes to extension/Storage internals. Add CI assertions for every new relation and function. [Supabase function privileges](https://supabase.com/docs/guides/database/functions).

## Additional boundary decisions

- **Question issuance:** concurrent generate requests can both miss the active question and insert separate questions; changing topic also leaves old questions answerable. If one active question is intended, persist an account issuance slot/reservation and finalize it transactionally. Do not hold a database transaction open while calling Gemini.
- **Reward eligibility:** reasoning difficulty and boss status come from model output. The server validates dependencies and enforces direct inference for unseen non-boss concepts, but does not fully enforce the prompt's complexity schedule for learning concepts. Derive reward multipliers/boss eligibility from server rules and stored mastery. This is an AI-output validation concern, not proof that a caller can inject those fields directly.
- **Deletion:** keep a minimal trusted reward/progression ledger independent of removable question/chat content. Use soft deletion for display or a separate immutable reward ID/amount record; define actual retention/privacy requirements. Do not retain full question content solely for deduplication.
- **Request abuse:** the existing per-user Gemini rate limits are useful. Add quotas/concurrency limits before expensive registry reads, explicit request/output size limits, and deadlines. Currently `answer`, `reset`, and legacy economy actions have no application rate limits. Wrong answers intentionally earn rewards, so automation can farm legitimate issued questions within quotas; server authority alone does not prove human learning.
- **Legacy frontend writes:** `src/services/database.ts` still contains question inserts/updates, chat inserts, and concept upserts/deletes. Deployed grants deny them; they are not a current RLS bypass. Remove those paths for authenticated accounts and make demo-only storage explicit. Do not restore grants to silence their errors.
- **Supabase advisors:** the history SECURITY DEFINER warning is intentional and its owner/answered filters were reviewed; changing it blindly to invoker would break access to the hidden table. Leaked-password protection is also disabled; review this if password sign-in is enabled in production. Neither warning explains the Castle exploit.
- **Deployment checks:** the GitHub workflow runs frontend tests/build/deployment but does not apply SQL or deploy the Edge Function. Today source/deployment match, but future releases need an explicit backend deployment and permission-verification step.

## Recommended target architecture

| Responsibility | Trusted location | Browser responsibility |
| --- | --- | --- |
| Authentication, request schema, allowlists, quotas, Gemini/Vault access | Edge Function | Send user intent; never send authoritative identity, correctness, cost, reward amount, or state snapshot |
| Answer scoring, mastery, token credit, reward deduplication | One service-only SQL transaction invoked by Edge | Submit question ID + option; show committed outcome |
| Token exchange, Castle/building upgrade | Service-only SQL transaction: lock wallet, compute cost/unlocks, debit and upgrade together | Submit topic/building ID; render returned state |
| Battle creation, unit unlocks/stats, deployment legality, timing, victory and front completion | Trusted battle engine plus transactional versioned persistence | Send commands or render an automatic battle; animate/predict only |
| Reset and progress generation invalidation | One SQL transaction shared with all progress commands | Request reset and reload state |
| Own concepts, chat, safe wallet snapshot | Direct SELECT with owner RLS is sufficient | Read/render |
| Answered history | Existing constrained RPC, with explicit output columns and pagination | Read/render |
| Demo, animation, layout, sound, display preferences | Browser | Entirely local |

For battles, do not expose “save battle JSON,” “claim victory,” or an unrestricted client-driven `tick` endpoint. For automatic battles, the server can simulate from a stored starting roster and rules version, then persist the result once. If manual deployment remains, process sequenced commands with server-validated elapsed time and reconstruct/simulate the authoritative state. A final replay submitted entirely by the browser permits offline search for the best sequence unless command timing is also constrained. The renderer may stay in the browser; a database write for every animation frame is unnecessary.

Suggested new persistence: `kingdom_state` (owner-readable, no browser writes), `reward_events` with a unique user/question/source identity, `battle_sessions` with progress generation and version, and unique daily claims if retained. These may be separate tables or equivalent transactional structures. Their invariant is more important than the naming: **only a validated command can advance authoritative state, and each reward source can credit once**.

Implementation order:

1. Establish the real server wallet and answer/reward transaction; make signed-in Castle use it. Keep local saves unverified.
2. Move exchange, Castle/building purchases, and battle progression to trusted commands; retire the unused legacy economy endpoints or fix their transactions before reuse.
3. Make reset atomic, make answer retries recoverable, add issuance/progress versions, and retain minimal deduplication records independently of visible history.
4. Close latent migration/default-privilege gaps and add integration gates before deployment.

Acceptance checks should run against an isolated Supabase test project: anon denial; two-account isolation even when client filters are removed; denial of direct mutation and privileged RPC calls; no answer leak through REST/RPC/GraphQL; parallel same-question answers credit once; answer response-loss recovery; exchange/upgrade/claim races conserve balances; reset invalidates in-flight generation; local-storage forgery has no effect on verified state; impossible battle commands cannot unlock fronts. Keep the existing unit tests, but do not treat mocked Supabase tests as proof of live authorization.
