# Implement recruitment and XP-based unit merging

Implement the system below throughout Curious Y, including Explorer Demo, signed-in persistence, the Castle/Army UI, onboarding, combat integration, and tests. This is a replacement for the current unit acquisition, paid training, and stars systems. Carry the implementation through validation and release according to AGENTS.md. Do not stop at another design proposal.

This prompt records the agreed design and proposes concrete initial balance values. The mechanics are intentional; the numeric tuning is a starting point that will change. Keep tuning centralized and easy to adjust. Inspect the repository again before implementation: this plan was prepared against the code on 2026-09-06.

## 1. Agreed behavior

- Constructing a unit-producing building grants no unit. It enables a **Recruit** action.
- Each successful Recruit action costs that building's main learning resource and grants exactly three permanent roster recruits. Roll each recruit independently. All fresh recruits have unit level 1 and zero invested XP; their unit type/tier depends on building level.
- The first building level produces only its tier-1 unit: three Militia per Barracks recruitment, for example.
- Every ten successful Recruit actions levels up that particular building, starting at level 1 and ending at level 100. Building progression improves recruitment odds. It is not a purchased upgrade.
- Higher-tier unit identities come only from recruitment. Militia NEVER turn into Spearmen through merging, leveling, promotion, campaign victories, or an Unlock button.
- **Merge spare recruits** is a manually initiated, previewed action. Donors are consumed and contribute XP to one chosen recipient from the same producing building. Different tiers and levels in that family can be merged together.
- Progress accumulates immediately. There is no need to assemble a complete group of equal-level units. Three fresh Militia can become one level-2 Militia by keeping one and feeding it the other two.
- Unit levels increase automatically when a confirmed merge crosses XP thresholds. Show a quick, satisfying animation. There is no separate level-up purchase, star purchase, or promotion button.
- Preserve every donor's accumulated XP as well as its innate recruit value. A veteran Militia can train a newly discovered Spearman without losing prior investment.
- No pity counter, guaranteed higher-tier drop, loss-streak correction, or campaign gate on a recruited unit. Improving building odds is the intended mechanism. Do not add a guarantee as a balancing fix.
- Recruitment builds the permanent roster. Battle spawning stays automatic, and battlefield deaths do not consume owned recruits.

## 2. Current-game anchors

Read these sources before editing:

- `supabase/functions/_shared/units.ts`: 25 unit types, five classes with five tiers each. Current base HP/damage/healing scale by `3 ** (tier - 1)`.
- `supabase/functions/_shared/kingdom.ts`: construction costs and Keep gates, state/actions, ownership, unit stats, battle snapshots and versioned rules. At plan time state version is 7 and current battle rules are 9.
- `supabase/functions/_shared/learning-value-tuning.json` and `learningValue.ts`: current learning rewards. A useful direct-inference answer normally yields 20 total resources; a first correct, non-atomic direct inference yields 25. Topic weights split this total. Do not mistake the legacy 10/3 fallback in `resources.ts` for current normal earnings.
- `supabase/functions/learning/kingdom.ts`, `supabase/functions/learning/index.ts`, and the kingdom SQL migrations: command validation, transaction/revision handling, receipts and reset generations.
- `src/lib/kingdom/`, `src/components/kingdom/`, and `src/components/game/FirstBarracksPrompt.tsx`: Demo/live clients, army, collection, map, progression goals and onboarding.
- `docs/unit-collection.md`, `docs/battle-balance.md`, `docs/learning-value-rewards.md`, relevant tests and battle-measurement scripts.

Preserve the existing five class ladders and class matchups. Barracks remains Militia / Spearman / Swordsman / Royal Guard / Champion. Other buildings use their existing five-tier ladders.

## 3. Initial recruitment costs and construction

Use a fixed cost of **15 of one primary resource for three recruits**, independent of building level or rolled results:

| Building | Recruit cost | Keep required to construct | Existing construction cost to retain |
| --- | --- | --- | --- |
| Barracks | 15 Force | 1 | 10 Force |
| Archery Range | 15 Astral Dust | 1 | 15 Astral Dust + 15 Insight |
| Stable | 15 Essence | 2 | 20 Essence + 20 Reagents |
| Siege Workshop | 15 Logic Cores | 3 | 30 Logic Cores + 30 Force |
| Academy | 15 Essence | 2 | 20 Essence + 20 Insight |

For buildings currently listing two construction resources, the first topic is the proposed primary recurring recruitment resource. Stable and Academy intentionally both use Essence; they already share Life investment, while construction retains their secondary-resource distinction. Preserve wallet topic keys and resource allocation rules.

Recruitment costs no Gold and merging costs no currency. Do not change learning payouts to subsidize the new system. A 25-Force opening reward can fund Barracks construction and one recruitment exactly. Mixed-topic or lower-value rewards may require more learning; onboarding must show actual deficits rather than promise one answer always suffices.

Construction still has its existing Keep requirement. Remove the existing `Keep level >= next building level` rule for recruitment progression: a Keep capped at 5 must not cap a Barracks at 5. Keep, Treasury, Library, Forge, Knowledge Towers and their progression remain otherwise separate from this feature.

## 4. Building progression and recruitment probabilities

Persist the number of successful recruitment actions per building, `recruitCount`:

```text
buildingLevel = min(100, 1 + floor(recruitCount / 10))
progressToNextLevel = recruitCount % 10
```

Unbuilt buildings remain level 0. At level 100 show MAX rather than a misleading next-level bar; recruitment remains available. One pack counts as one action, not three. Rejected commands and retries do not advance the count.

Resolve all three recruits using the building level BEFORE that action. Then charge/grant/increment together atomically. Thus actions 1-10 use level-1 odds, action 10 raises the building to level 2, and action 11 first uses level-2 odds. Level 100 is reached after 990 recruitment actions; its odds apply from action 991.

Use a discretized, endpoint-clamped normal distribution for tiers 1-5. This directly expresses the requested moving center. For level 1 explicitly return `[1, 0, 0, 0, 0]`. For levels 2-100, use standard deviation **0.45** and linearly interpolate the mean between these anchors:

| Building level | Mean |
| --- | ---: |
| 2 | 0.575812 |
| 5 | 0.80 |
| 10 | 1.10 |
| 20 | 1.65 |
| 35 | 2.25 |
| 50 | 3.00 |
| 65 | 3.75 |
| 80 | 4.45 |
| 100 | 5.25 |

For `X ~ Normal(mean, 0.45²)`, define:

```text
P(tier 1) = P(X < 1.5)
P(tier 2) = P(1.5 <= X < 2.5)
P(tier 3) = P(2.5 <= X < 3.5)
P(tier 4) = P(3.5 <= X < 4.5)
P(tier 5) = P(X >= 4.5)
```

All mass below/above the supported ladder belongs to tier 1/5. Do not discard the tails and renormalize over five point weights; that is a different curve. Use a numerically stable CDF/survival calculation, or generate a shared full-precision table from these parameters. Sample categorical probabilities with server-owned random draws. Do not round probabilities to UI percentages before sampling.

Approximate percentages for reference (display rounding can make tiny positive tails appear zero):

| Building level | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 100 | 0 | 0 | 0 | 0 |
| 2 | 98.000 | 1.999 | 0.001 | ~0 | ~0 |
| 10 | 81.297 | 18.610 | 0.093 | ~0 | ~0 |
| 20 | 36.944 | 60.111 | 2.943 | 0.002 | ~0 |
| 35 | 4.779 | 66.295 | 28.652 | 0.274 | ~0 |
| 50 | 0.043 | 13.283 | 73.348 | 13.283 | 0.043 |
| 65 | ~0 | 0.274 | 28.652 | 66.295 | 4.779 |
| 80 | ~0 | 0.001 | 1.737 | 52.685 | 45.576 |
| 100 | ~0 | ~0 | 0.005 | 4.774 | 95.221 |

There are no additional tier gates beyond construction and these odds. Very rare early high-tier drops are permitted. Every upper-tail probability `P(tier >= k)` must be nondecreasing with building level; the probability of a particular intermediate tier can rise and later fall.

Expose current odds and the change at the next building level. Display tiny nonzero odds as `<0.01%` rather than falsely calling them impossible.

### Initial pacing expectations

Analytic first-discovery estimates using three independent draws per action and the pre-action level convention above:

| First recruit of at least this tier | 10th percentile actions | Median actions | 90th percentile actions |
| --- | ---: | ---: | ---: |
| Tier 2 | 12 | 21 | 37 |
| Tier 3 | 108 | 155 | 189 |
| Tier 4 | 314 | 375 | 414 |
| Tier 5 | 526 | 578 | 615 |

These are per-building discovery statistics, not guarantees or estimates for collecting every named type. Higher-tier draws count as reaching the threshold. Reproduce them with `1 - product((1 - P(tier >= k at action n)) ** 3)`.

At 15 resources per action, median tier-2-or-better discovery costs 315 recruitment resources, and median tier-5 discovery costs 8,670. At 20-25 resources earned entirely in the chosen topic per useful answer, those are roughly 13-16 and 347-434 answers respectively, excluding construction and other spending. Mixed-topic rewards take longer; boss rewards can shorten this. This is deliberately a long-term curve for a 100-level building, not a promise to finish all tiers in one session. Document measured pacing and make the anchors easy to retune.

## 5. XP, levels and conservation

Separate **tier** (unit identity, obtained through recruitment) from **level** (training, earned through merging).

Let `p = 3 ** (tier - 1)`. Assign each fresh recruit an innate merge value of `10 * p`:

| Tier | Barracks example | Innate merge XP |
| --- | --- | ---: |
| 1 | Militia | 10 |
| 2 | Spearman | 30 |
| 3 | Swordsman | 90 |
| 4 | Royal Guard | 270 |
| 5 | Champion | 810 |

Each owned recruit has **investedXP**, initially 0. A donor transfers `innateMergeXP(donor tier) + donor.investedXP`. The recipient adds this amount to its existing investedXP. Its own innate value is not part of its training bar and is not added again. Destroy the donor in the same transaction.

The invariant is that the sum of `innateMergeXP + investedXP` across all living roster recruits is conserved by merging. Recruitment creates exactly the sum of the three new innate values. No XP is discarded, rounded away, or created by merge ordering or back-and-forth transfers.

For a unit of tier multiplier `p`, use this cumulative invested-XP threshold to reach level `L >= 1`:

```text
threshold(L, tier) = 5 * p * (L - 1) * (L + 2)
increment from level L to L+1 = 10 * p * (L + 1)
level = highest integer L for which investedXP >= threshold(L, tier)
```

| Unit level | Cumulative tier-1 XP | Additional XP from previous level |
| --- | ---: | ---: |
| 1 | 0 | - |
| 2 | 20 | 20 |
| 3 | 50 | 30 |
| 4 | 90 | 40 |
| 5 | 140 | 50 |
| 6 | 200 | 60 |
| 7 | 270 | 70 |
| 8 | 350 | 80 |
| 9 | 440 | 90 |
| 10 | 540 | 100 |
| 20 | 2,090 | 200 |

Multiply both XP columns by the tier multiplier for other tiers. There is no gameplay cap on unit level in this first version; only building level caps at 100. Use safe-integer validation and overflow guards, and derive levels efficiently without iterating through every prior level. If using an inverse square-root formula, correct against integer thresholds at the boundary.

Examples that must work:

1. Three fresh Militia: keep one, merge two donors worth 10 each. Recipient has 20 invested XP and becomes Militia level 2.
2. Feed it one more Militia: 30 XP total, still level 2, with 10/30 progress toward level 3. Feed two more: 50 XP total, level 3.
3. A Militia with 540 invested XP is level 10 and transfers **550 XP** when consumed. A fresh Spearman receiving it becomes level 5: threshold 420 XP, with 130/180 toward level 6. Its type stays Spearman. The original 540 XP and the Militia's innate 10 are both retained.
4. A fresh Militia contributes 10 XP to a Spearman; a fresh Spearman contributes 30. Both always help, including after more advanced units are discovered.
5. A batch crossing several levels carries all excess XP and reports one final result; it must not discard XP at each level boundary.

## 6. Combat integration and initial stat tuning

Keep existing tier base stats at `1x / 3x / 9x / 27x / 81x`. Replace the old training/star multiplier with:

```text
unitTrainingMultiplier = 1 + 0.20 * (unitLevel - 1)
```

Apply this to HP and damage, and to healer output and lifetime healing budget. Healers still deal zero damage. Preserve class abilities, class counters, Keep multipliers, automatic spawn cadence, battle speed, field limits, and the existing independent Knowledge Tower/Library modifiers. Do not scale range, movement, attack cadence or spawn cadence with unit level.

For the NEW battle rules, recruitment-building level affects odds only. Remove its old `+30% base HP/damage per building level` multiplier and freeze its building-specialty contributions at the old building-level-1 baseline. This means no additional building armor/reach/movement/reload/healing growth; retain actual base abilities such as melee guard, siege base splash/reload and Academy base healing. Do not accidentally remove the whole ability when removing its building-level bonus. Audit healer scaling so the tier and training multipliers each apply exactly once.

Do not pass a level-100 recruitment building into legacy combat formulas. Keep recruitment level, unit training level and unit tier distinct in code and UI. Update building descriptions to explain odds, not removed combat upgrades.

XP thresholds scale by the same 3x factor as tier base stats so transferring investment into a higher tier remains beneficial despite its lower displayed training level. Verify this across tiers, threshold boundaries and large XP values; the worked level-10 Militia -> level-5 Spearman example goes from a 2.8x to a 5.4x tier-1 stat multiplier before other modifiers.

Add a new battle-rules version for these changes. If old battles are retained, they must keep their frozen old stats/rules. Development-state resets are permitted instead of elaborate migration support; choose an explicit consistent reset strategy rather than silently mixing old and new data.

The current campaign was tuned for purchased building bonuses and tier unlocks. Run combat measurements for realistic recruitment/merge outcomes, including unlucky paths. Adjust new-rule enemy pacing if measurements require it, while retaining the agreed acquisition mechanics. Do not invent a requirement that a player must have drawn one specific type to start the next stage, and do not claim that a finite number of random draws guarantees progression. Explain any campaign tuning in the final implementation report.

## 7. Ownership, army and merging UX

The current `Partial<Record<UnitId, UnitProgress>>` cannot represent multiple independently owned recruits. Introduce stable recruit-instance identity with at least unit type, invested XP and lock state; derive tier and level. Instance IDs must distinguish copies reliably through commands, saves and army references. Fresh identical copies can be visually grouped with counts; do not force thousands of separate tiles. A compact stack representation is acceptable if it preserves instance selection, locking and conservation semantics.

Preserve five flexible army slots and the existing restriction of at most one equipped instance per unit type. Different types from the same building remain allowed in different slots. Do not introduce five simultaneous streams of identical Militia as an accidental side effect of duplicate ownership. Battle snapshots should contain effective unit definitions and remain independent of mutable roster inventory.

Provide:

- Building details with Recruit price, three-recruit explanation, current level/odds, successful recruitment count, next-level progress and a Learn action for missing resources.
- A short reveal of the three recruited portraits, their tier and their level. Newly discovered types get a stronger visual accent.
- Selection of a recipient and **Merge spare recruits**. By default, spare donors are fresh/untrained, unlocked, unequipped recruits from the same building at the recipient's tier or below; exclude the recipient. Fresh copies of newly discovered higher tiers must not be silently selected as fodder for a lower-tier recipient.
- A concise preview with donor counts/types, total XP, resulting level, progress and effective stat changes, followed by one **Merge** confirmation. This is the intentional gameplay button, not an extra generic warning dialog.
- An explicit donor-selection path for veterans and higher tiers, so accumulated investment can be transferred. Locked donors require unlocking first. Equipped donors are excluded from bulk spare selection.
- A deliberate **Merge and replace** path for feeding an equipped veteran into a same-building recipient that is currently unequipped. Show the exact result and atomically put the recipient in the veteran's slot. Validate the one-equipped-instance-per-type rule. Do not leave a consumed unit referenced by the army.
- No automatic merging on recruit, load or building level-up. Nothing is consumed until the player confirms the preview. Previews must not silently expand their donor set if new recruits arrive.
- Update empty states, onboarding, tutorial text, progression goals and roster details. The initial journey is Learn -> Collect -> Build Barracks -> Recruit -> Equip/merge -> Battle; building alone is no longer battle-ready. Remove obsolete stars, paid unit-level actions, tier Unlock buttons and promotion language.

Allow recruitment and merging while a battle is running, using its immutable snapshot so changes apply to the next battle. Clearly label that behavior. Preserve the current restrictions on unrelated building/Keep actions unless a necessary integration change is justified.

### Animation

- Animate donor portraits/XP particles flowing into the recipient for roughly 350-500 ms.
- On a level gain, use a quick pulse/glow and `Level 2 -> 5` / `+3 levels` result. Multi-level gains are one compact sequence, not one blocking animation per level.
- Show a short building-level pulse when recruitment crosses a ten-action boundary.
- Animate only confirmed committed results. Pending commands disable duplicate submission; a network retry must not create another recruit or another merge.
- Respect reduced-motion preferences with a brief highlight and textual result, support keyboard focus and screen-reader status, and do not make animations a prerequisite for the next action or replay them merely on reload.

## 8. Persistence, random outcomes and reset safety

Implement the same economics and probabilities in Demo and live mode using shared pure logic and injected randomness. Signed-in clients never choose or submit trusted rolled types, costs, XP totals or outcomes. The server validates ownership, same-building eligibility, affordability, donor uniqueness, locks and equipment.

Recruitment must atomically spend resources, grant three instances, increment the building count and record its result. Merge must atomically consume the exact previewed donors, add their XP and update affected army slots. Reject stale previews if relevant donors, recipient XP, lock/equipment state or other preconditions changed; do not consume additional/new donors after an optimistic-concurrency retry.

Extend the existing request-identity/receipt mechanism so retries return the same committed result. Randomness must not be rerolled by transport retries, transaction revision retries or reloads. Use a server-owned stable random input/outcome reservation for the logical request, or a deterministic keyed server-only derivation tied to account, request identity and generation, integrated correctly with committed pre-action building state. Never trust a client-selectable seed. Prevent double-spend and duplicated instances under concurrent requests; old-generation commands must fail after reset.

Persist recruit/merge result details needed for reliable recovery and animation without inventing outcomes from client state. Demo should provide equivalent local deduplication/reload behavior within its supported concurrency model.

Update state validators, SQL JSON validation/allowlists, RPC command receipts, account reset and Demo storage together. Avoid a full learning/account wipe unless actually needed: development ownership, army, building progression and campaign state may be reset coherently without manufacturing starter recruits. There are no live users and no requirement to migrate old unit training/stars into the new economy. Document exactly which development state resets.

## 9. Implementation order and acceptance checks

1. Inspect current code and define one shared versioned recruitment tuning source containing costs, count-per-level, cap, probability parameters, innate XP, thresholds and stat multiplier. Keep server/Demo/UI previews consistent. If SQL mirrors any tuning, add an explicit drift check.
2. Implement pure probability, XP, level and merge-preview logic, then state/command/schema support and transactional random-result handling.
3. Integrate combat snapshots, ownership/equipment, live and Demo clients, onboarding and progression goals.
4. Build the recruitment/merge UI and animations using existing art and UI conventions.
5. Run focused invariants, then the existing required checks and campaign measurements. Update documentation to describe the implemented system and measured tuning.

Required meaningful tests:

- Construction grants zero units for every producing building; correct price and Keep gate remain. A fresh 25-Force reward can build Barracks and recruit once.
- Three independent recruits per paid action; correct resource charged; insufficient funds/invalid building/retries grant nothing extra.
- Action 10 uses level-1 odds, raises level to 2 and action 11 uses level-2 odds. Level 100 cap and continued recruitment work independently of Keep level.
- All probability rows are nonnegative and sum to 1; upper-tail odds are monotone across all 100 levels; reference points match; test random boundaries with injected draws rather than flaky statistical assertions.
- Exact XP examples above; partial progress; multiple level gains; same-family cross-tier transfers; all XP conserved through different merge orders, including when a trained recipient later becomes a donor.
- Newly recruited units are level 1. No unit changes identity through leveling. No old paid upgrade, star or free-unlock path remains callable.
- Protection of locked/equipped units, stale preview rejection, explicit veteran replacement, correct army references, no duplicate unit-type deployment and no cross-building merge.
- Concurrent recruitment/merge, transaction retry, duplicate request, reload, reset-generation and account-isolation behavior using actual persistence paths. The same request never provides a second roll or charge.
- Battle snapshots remain unchanged while roster XP changes; new battles use merged stats. Healer HP/output/budget and tier scaling are correct, and existing class abilities/counters still work.
- UI journey from learning to first recruit, manual bulk merge, automatic level-up display, higher-tier discovery and veteran replacement. Validate reduced motion and failed-command behavior.

Reproduce the discovery percentile table and report sample merge-growth trajectories and measured battle results. Use a deterministic simulation script/analytic calculation for tuning evidence, not a Monte Carlo test with flaky pass criteria. Check early battles, chapter boundaries, support units and strong late units. Do not assert that every unlucky player must win every campaign stage within a fixed number of recruits.

Run `npm test`, `npm run test:db`, `npm run build`, and `npm run lint`, plus applicable existing database/concurrency checks. Resolve failures caused by the implementation and report any external blockers accurately.

## 10. Release and completion

Follow AGENTS.md: commit and push the completed implementation to `main`, apply all new Supabase migrations, deploy all Edge Functions, and confirm the frontend deployment. Inspect the actual function inventory; at plan time `learning` is the application's Edge Function. Preserve authentication configuration.

Use forward migrations, review `supabase db push --dry-run`, apply the required migration(s) before dependent server code, then deploy the functions and frontend. Validate the new/reset account journey after deployment. Do not rewrite applied migrations. Preserve unrelated work in the working tree and do not stage unrelated edits.

Report what was implemented, the final initial tuning, any development-state resets, validation evidence, and actual deployment status. Flag numeric balance as intentionally provisional; do not silently replace the agreed mechanics with promotion, pity, automatic merging, or paid stars/upgrades.
