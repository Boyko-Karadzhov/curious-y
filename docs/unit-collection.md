# Recruitment and XP merging — state 9, battle rules 10

| Class | Recruitment building | Tier 1 → 2 → 3 → 4 → 5 |
| --- | --- | --- |
| Melee | Barracks | Militia → Spearman → Swordsman → Royal Guard → Champion |
| Ranged | Archery Range | Slinger → Archer → Crossbowman → Ranger → Marksman |
| Mounted | Stable | Scout Rider → Horseman → Lancer → Knight → Royal Knight |
| Healer | Academy | Medic → Herbalist → Acolyte → Priest → High Priest |
| Siege | Siege Workshop | Ballista → Catapult → Trebuchet → Bombard → Great Bombard |

## One source of tuning

`supabase/functions/_shared/recruitment-tuning.json` (`recruitment-v1`) is consumed by Edge, Demo, previews and measurement scripts. A pack costs 15 of the building's primary resource and rolls three independent level-1 recruits and immediately merges them into one unit of the building’s class: Barracks Force, Range Astral Dust, Stable Essence, Workshop Logic Cores, Academy Essence. Gold is not used. Construction retains existing costs/Keep gates and grants **zero units**. Military building upgrades are no longer purchased.

Successful packs alone advance each building: `min(100, 1 + floor(recruitCount / 10))`. Resolve all three draws at the pre-action level, then commit charge, instances and count together. Packs 1–10 use level 1; pack 11 first uses level 2. Pack 990 reaches level 100; pack 991 first uses its odds. Recruitment continues at the cap independently of Keep level.

Level 1 odds are exactly `[1,0,0,0,0]`. Other levels discretize a normal distribution with sigma 0.45 at boundaries 1.5/2.5/3.5/4.5, clamping endpoint tails into tiers 1/5. Linearly interpolated mean anchors are `(2,.575812), (5,.8), (10,1.1), (20,1.65), (35,2.25), (50,3), (65,3.75), (80,4.45), (100,5.25)`. A stable survival function preserves tiny tails. Sampling uses full precision; UI labels positive odds below .01% as `<0.01%`. There are no campaign tier gates or pity. Recruitment automatically keeps the highest tier and merges every other recruit of that class into it.

## XP and effective stats

Every instance stores stable ID, unit type, investedXP and lock state. Tier comes from its type; training level comes from XP. For tier power `p = 3^(tier-1)`, innate XP is `10p`, cumulative threshold for level L is `5p(L-1)(L+2)`, and the next increment is `10p(L+1)`. An inverse square root corrected against BigInt integer thresholds derives the level without iteration over previous levels. Safe-integer guards bound storage; there is no gameplay level cap.

A donor transfers **innate XP plus all invested XP**, and is consumed atomically. The recipient's own innate XP never enters its training bar. Total innate plus invested XP across the living roster is conserved regardless of merge order. Two fresh Militia give a third 20 invested XP/level 2; another gives 30 XP and 10/30 progress; two more give 50 XP/level 3. A level-10 Militia with 540 XP transfers 550 into a fresh Spearman, making level 5 with 130/180 progress. Tier/type never changes through training.

Rules 10 preserve tier base power 1/3/9/27/81 and multiply HP/damage/healing output/healing budget by `1 + .20*(level-1)`. Tier and training apply once to healers, who still deal zero damage. Recruitment-building level only changes recruitment odds: its old combat multiplier is removed and all specialties stay at the former level-1 baseline. Melee guard, mounted charge, siege splash/Keep damage and finite healing remain. Class counters, movement/range, cadence, field limits, Library and Knowledge Towers retain their independent behavior. See `unitCollection.test.ts` for all 500 attacker/defender tier combinations.

## Ownership and interaction

The roster contains at most one unit in each of the five classes. Each paid pack and its mandatory merge commit together. The highest tier wins; an existing equal-tier unit keeps its identity. Every consumed unit contributes innate plus invested XP. If a higher tier replaces an equipped unit, it inherits that army slot automatically. Locks and manual merge commands are retired.

The collection is a read-only catalog of all 25 discoveries, current class units, training progress and effective stats. Slot assignment remains in army preparation. Recruitment reveals the three draws and the merged unit’s XP, tier and resulting level at the building. No extra confirmation or donor selection is needed. Recruitment during battle affects the next battle; the current effective snapshot is immutable.

Confirmed receipts trigger three-portrait reveals, permanent first-discovery accents and a compact merge result. Pending buttons disable duplicate submissions. Reload alone never triggers animation. Reduced motion uses text/highlight; details/status support keyboard focus and screen readers.

## Persistence and reset

Edge parses only supported intents, never trusted client prices, rolls, XP or outcomes. Service-only SQL reserves three random draws per account/request/generation before optimistic revision retries. Draws are retained through retries while the final committed pre-action level determines the tier curve. Charge, grant, count, roster mutations, army changes and the receipt commit under the existing account lock/revision transaction. A duplicate request returns the latest snapshot plus its original committed result. Retry exhaustion returns 503 so the browser retains its pending request across reload. SQL validates structural state/allowlists; no economy tuning is copied into SQL.

Demo applies the same pure logic with injected randomness. Its roster, receipt map and generation are saved in one localStorage write; Web Locks serialize commands across tabs where available. Without Web Locks, support is one active writer per browser storage. Demo is editable practice state and never trusted by live accounts.

Forward migration `20260907120000_automatic_class_merging.sql` consolidates existing collections into their highest tier per class, preserving total XP, discoveries, building progress, learning, wallets and frozen battles. Multiple equipped members collapse into the first occupied slot for their class. State becomes v9 and revisions advance. Historical receipts still deduplicate commands; their obsolete reveals are cleared. SQL rejects duplicate classes and retired manual merge/lock commands.

Demo v8 parsing performs the same consolidation and preserves command deduplication. Older v1–7 saves retain the previous military reset behavior. Explicit Reset Progress still performs the existing full account reset.

## Validation and release

Run `npm test`, `npm run test:db`, `npm run build`, `npm run lint`, and the database suite against an **empty local PostgreSQL 17** database via `SECURITY_TEST_DATABASE_URL` to exercise independent-connection races. `scripts/measure-recruitment.mjs` reproduces analytic discovery percentiles and 188 deterministic campaign cases. `scripts/measure-roster.mjs` measures 58 roster cases. See [balance evidence](battle-balance.md).

Review `supabase db push --dry-run`, apply the forward migration, deploy every inventoried Edge Function retaining JWT configuration, then push main and verify GitHub Pages. The application's function inventory is `learning`. Never roll back to a pre-v9 writer after deployment.

Release smoke: `node scripts/smoke-recruitment.mjs --linked` uses CLI credentials only in memory, creates a temporary account, verifies an admin-generated one-use link (without sending email), exercises real answer/collect and game HTTP commands, and deletes the account in `finally`. It does not change authentication settings or generate a paid AI question.
