# Castle progression — state 11

The map contains the Keep, Recruitment Hall, Forge, War Academy, Treasury and Library, with eight separate Knowledge Towers. See [territory progression](territory-progression.md) for current costs, resource pairs, doctrine modifiers and daily income.

The Keep starts at level 1 and caps at 5. An upgrade from level L costs 40L Gold and 10L each Insight / Influence. HP is `(240 + 120 × (level−1)) × 3^(level−1)`. Keep 2 unlocks Forge, War Academy and Treasury. Hall and Forge levels grow every ten uses, capped at 100; their levels improve roll odds. War Academy caps at 2 and unlocks doctrine choices. Treasury caps at Keep/5 and adds 2% daily tribute per level.

Gold is earned from territory tribute, first-victory rewards and equipment sales. Lifetime Gold preserves earned score after spending. Treasury is never a prerequisite for income; it no longer adds to battle victory rewards.

Goals direct the player to missing resources for construction, the next recruitment pack and permanent upgrades. Resource pairs span related subjects; no exchange bypasses subject requirements. Army composition and doctrine changes apply between battles. Battle Start freezes combat effects.

## Verified Library policy

The protected, account-scoped `concepts` table is the authority. A concept qualifies when its persisted mastery is **proficient or mastered**, it has a positive earned reasoning-track value, and its canonical identity is not atomic. Currency balances, editable Demo saves, rewards paid and client-declared counts are never evidence.

Existing server concepts are eligible immediately under the same rule, including earned records that predate `reward_successes`. The earlier server-authority migration already quarantined formerly editable legacy mastery. No new mastery reset or retuning occurs here. Atomic prerequisites remain assumed mastered for learning eligibility but never count toward Library progress, even if their generated track is positive. A non-atomic mastered record with no earned track is excluded.

Names use trimmed, lowercase, collapsed-whitespace normalization. Connected canonical names and aliases count as one identity, including transitive aliases and collisions. An atomic record anywhere in an identity group conservatively excludes the group. This may merge ambiguous names rather than grant duplicate milestones. Mastery rows are never renamed, deleted or rewritten by this reconciliation.

The migration backfills counts. A trigger reconciles protected mastery/track/alias/atomic changes under the same per-account lock used by answers, purchases and reset. Reconciliation changes the Castle revision only when the derived count or Library level changes. Repeated answers/reconciliation cannot grant duplicate progress. A concurrent purchase must retry its stale revision, preserving the new Library count. Protected identity corrections may lower the derived count; game balance changes never modify mastery. Deleting question history does not remove concept achievements. Reset clears concepts and all game buildings through the existing atomic account reset.

Demo computes the same identity policy from its local concept registry and earned ledger on load/command. It remains editable practice data and never enters signed-in storage. A step-4 regression found during this work was also fixed: zero-value Demo learning receipts now collect successfully and deduplicate without minting Resources.
