# Castle progression — recruitment release

State schema 8 uses five army slots. Keep, Treasury, Library and Knowledge Tower progression remain independent of recruitment XP. `castle` is the stored Keep level. [Recruitment and merging](unit-collection.md) describes the producing buildings and current save reset; [battle balance](battle-balance.md) contains measured rules-10 evidence.

The Keep starts at level 1, caps at 5 and costs `10 × current level` each of Runes and Influence to upgrade. Its HP is `(240 + 120 × (level-1)) × 3^(level-1)`.

| Building | Keep gate | One-time construction cost | Recruitment resource |
| --- | ---: | --- | --- |
| Barracks | 1 | 10 Force | Force |
| Archery Range | 1 | 15 Astral Dust + 15 Insight | Astral Dust |
| Stable | 2 | 20 Essence + 20 Reagents | Essence |
| Siege Workshop | 3 | 30 Logic Cores + 30 Force | Logic Cores |
| Academy | 2 | 20 Essence + 20 Insight | Essence |

Construction gives no units. Each three-unit pack costs 15 of the listed resource. Building level is earned every ten packs, capped at 100 independently of Keep. Its only effect is odds. There are no purchased military upgrades or building-level combat specialties. Army effects remain frozen at Start, including Library, Towers, Keep and Treasury. Recruitment and merging are allowed during battle and apply to the next battle; building/Keep purchases and ordinary army changes retain their existing active-battle restriction.

Treasury construction requires Keep 2 and 20 each of Runes/Influence. Subsequent levels cost base Resources times next level plus `20 × current level` Gold, capped by Keep/5. Its victory bonus is 2% per level, rounded down. Library cannot be purchased. Forge remains reserved and unavailable.

The initial goal is Learn → Collect → Build Barracks → Recruit → Equip or merge → Battle. Goals can target one-time military construction, the next recruitment pack, Keep or Treasury upgrades. A direct-inference first-success answer weighted entirely to Physics earns 25 Force: exactly 10 to build and 15 to recruit.

## Verified Library policy

The protected, account-scoped `concepts` table is the authority. A concept qualifies when its persisted mastery is **proficient or mastered**, it has a positive earned reasoning-track value, and its canonical identity is not atomic. Currency balances, editable Demo saves, rewards paid and client-declared counts are never evidence.

Existing server concepts are eligible immediately under the same rule, including earned records that predate `reward_successes`. The earlier server-authority migration already quarantined formerly editable legacy mastery. No new mastery reset or retuning occurs here. Atomic prerequisites remain assumed mastered for learning eligibility but never count toward Library progress, even if their generated track is positive. A non-atomic mastered record with no earned track is excluded.

Names use trimmed, lowercase, collapsed-whitespace normalization. Connected canonical names and aliases count as one identity, including transitive aliases and collisions. An atomic record anywhere in an identity group conservatively excludes the group. This may merge ambiguous names rather than grant duplicate milestones. Mastery rows are never renamed, deleted or rewritten by this reconciliation.

The migration backfills counts. A trigger reconciles protected mastery/track/alias/atomic changes under the same per-account lock used by answers, purchases and reset. Reconciliation changes the Castle revision only when the derived count or Library level changes. Repeated answers/reconciliation cannot grant duplicate progress. A concurrent purchase must retry its stale revision, preserving the new Library count. Protected identity corrections may lower the derived count; game balance changes never modify mastery. Deleting question history does not remove concept achievements. Reset clears concepts and all game buildings through the existing atomic account reset.

Demo computes the same identity policy from its local concept registry and earned ledger on load/command. It remains editable practice data and never enters signed-in storage. A step-4 regression found during this work was also fixed: zero-value Demo learning receipts now collect successfully and deduplicate without minting Resources.

## Treasury payout contract

Only victory at the next unbeaten stage qualifies. Base Gold is unchanged: `60 + 10 × (stage - 1)`. Start snapshots base Gold, Treasury percentage, `floor(base × percent / 100)` bonus and total. Collection writes the actual paid amount and marks the battle collected in the same atomic revision/request-ID transaction. Results display that stored payment. Stage 1 with Treasury 1 pays 61; upgrading Treasury to level 2 after victory but before Collect still pays 61. Treasury 5 on a new stage-1 battle would pay 66. Multiple retries, overlapping collection and upgrade commands cannot multiply payment.

## Release checks

Run unit/UI, isolated database, PostgreSQL concurrent-connection, build and lint checks. Apply the forward recruitment migration before deploying the JWT-protected learning function and frontend. Full account reset remains explicit; deployment only resets development military/campaign state as documented in the collection guide.
