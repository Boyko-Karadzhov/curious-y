# Server-owned progression

The September 5 implementation replaces the signed-in local Castle with `kingdom_state`. The local game/storage code is retained exclusively for Explorer Demo and rendering. Existing browser saves are not imported.

- The answer transaction locks the account before the question, legacy stats, and concepts. It awards 10/3 topic tokens and a unique reward event atomically. Repeating the same answer returns its result; a different choice cannot replace it.
- Castle commands contain intent, a UUID request ID, and the observed progress generation. The Edge Function validates commands and computes state from a database snapshot. A service-only compare-and-swap RPC commits against the revision. Conflicts retry against current state; command IDs prevent replayed purchases. Time-only polls need no permanent command ledger.
- Combat rules are shared between demo rendering and the Edge Function. Live simulation advances only by elapsed database time, never by a submitted tick count, timestamp, fighter snapshot, or victory claim. No database transaction remains open during simulation or Gemini calls.
- Reset locks the same account, clears progress in one transaction, increments generation/revision, and invalidates question reservations. Old answers and commands cannot restore progress. Quotas and minimal reward identities survive reset and question-content deletion.
- Question generation reserves one account slot for up to two minutes; finalization checks the reservation and generation. The active question is reused across topic requests. Old questions are quarantined from new scoring. Registry reads fail closed and precede model-output eligibility validation.
- The former `upgrade` and `claim_daily` HTTP actions now return 410. Their unsafe read/write code and unused browser hook are removed. Legacy `game_stats` remains for history/learning compatibility and is not spendable through these endpoints.
- All browser writes and private function execution remain revoked. Browser schema CREATE and default function/sequence grants are restricted. Answered history is owner-filtered and paginated, capped at 100 records per call.
- Requests are limited to 8 KiB and 360/account/minute. Generation has request, new-generation, and 120/24-hour quotas. Gemini calls have 25-second deadlines and bounded output tokens. Demo reward logic cannot write verified data.

## Verification

`npm test` exercises UI journeys, actual Edge handler authorization, forged commands, server-time combat, and generation validation. `npm run test:db` executes all migrations in isolated PostgreSQL via PGlite, with test-only Auth/Vault interfaces. It checks actual grants/RLS, hidden answers, owner isolation, answer retries, one-time rewards, optimistic conflicts, generation invalidation, and retention of reward identities.

CI supplies an empty PostgreSQL 17 database to the same runner and uses separate connections to race answer submissions and spending. The runner rejects remote hosts and existing Auth databases. Vault cryptography and hosted Auth remain Supabase platform responsibilities, not emulated security claims.

## Release

1. Run lint, tests, `npm run test:db`, TypeScript build, and `deno check supabase/functions/learning/index.ts`.
2. Commit and push the tested source. CI validates real PostgreSQL concurrency before publishing the frontend.
3. Run `supabase db push --linked --skip-vault` and `supabase functions deploy learning` for the linked project. The SQL migration intentionally expires existing unconsumed questions; history remains.
4. Confirm migration history, active JWT-verified function, browser grants, and live security advisors. Compare deployed Edge source with the release commit.

Supabase's advisor flags the intentionally authenticated SECURITY DEFINER history function. Its owner/answered filters and empty search path are required because the base table is hidden; do not switch it blindly to SECURITY INVOKER. Password leak protection is a separate hosted Auth setting and requires plan support when password sign-in is used.
