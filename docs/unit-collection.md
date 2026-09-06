# Five classes, five tiers — rules 7

The collectible roster has exactly 25 units. Each class comes from one recruitment building. Later units are direct upgrades with the same class matchups and abilities.

| Class | Recruitment building | Tier 1 → 2 → 3 → 4 → 5 |
| --- | --- | --- |
| Melee | Barracks | Militia → Spearman → Swordsman → Royal Guard → Champion |
| Ranged | Archery Range | Slinger → Archer → Crossbowman → Ranger → Marksman |
| Mounted | Stable | Scout Rider → Horseman → Lancer → Knight → Royal Knight |
| Healer | Academy | Medic → Herbalist → Acolyte → Priest → High Priest |
| Siege | Siege Workshop | Ballista → Catapult → Trebuchet → Bombard → Great Bombard |

## Progression

At equal building/training/star investment, base HP and damage are **1× / 3× / 9× / 27× / 81×**. Healers have zero damage; their HP, healing rate and lifetime healing budget follow that progression. For example, Militia / Spearman / Swordsman / Royal Guard / Champion have 65 / 195 / 585 / 1,755 / 5,265 base HP and 12 / 36 / 108 / 324 / 972 base damage.

Range, movement, recruitment cadence, attack cadence, armor, splash and class multipliers are identical within a class at equal building levels. These are not multiplied by three: tripling range or slowing recruitment would change the role or undermine the upgrade. Combat uses the existing one-third simulation tempo and fivefold playback; UI reports actual wall-time DPS and recruitment times.

Tier N requires its recruitment building at level N and (N−1)×10 campaign victories. Tier 1 is granted by construction. Tiers 2–5 have explicit free Unlock actions. They do not require concepts, random rolls, shards or Gold. Training (levels 1–5, +8% per step) and stars (1–3, +6% per step) remain smaller improvements; even a maximally trained predecessor loses to its fresh successor at the same building investment.

Building power remains +30% of base per level. Academy healing rate and budget now scale with roster tier, building power, training and stars as well as its healing specialty. Every siege unit receives Workshop reload and splash-radius improvements. No attacker is recruited at the Academy, and every ranged unit comes from the Archery Range.

## Shared class matchups

All five tiers use this exact damage table. Armor applies afterward. Secondary splash hits use their own defender class.

| Attacker ↓ / Defender → | Melee | Ranged | Mounted | Healer | Siege |
| --- | ---: | ---: | ---: | ---: | ---: |
| Melee | 1× | 0.75× | 1.5× | 1× | 1× |
| Ranged | 1.5× | 1× | 0.75× | 1× | 1× |
| Mounted | 0.75× | 1.5× | 1× | 1× | 1× |
| Healer | No attack | No attack | No attack | No attack | No attack |
| Siege | 0.75× | 0.75× | 0.75× | 0.75× | 0.75× |

Melee has +4 percentage points of guard armor; mounted has a +60% first-hit charge. Siege deals triple damage to Keeps and 35% splash to at most two neighbors. Healers target injured non-healers, cannot resurrect or heal Keeps, and spend a finite lifetime budget. There are no unit-specific counter exceptions.

Knowledge Towers affect entire classes consistently: Force boosts melee/mounted/siege, Astral boosts ranged, Alchemy boosts siege, and Insight boosts movement for every class except siege. Life boosts all HP plus healer output.

## Collection and battle presentation

Armies have five flexible slots, enough for one unit from every class. Any five distinct owned, eligible units may be equipped; classes are not mandatory. Earlier four-slot saves gain an empty fifth slot, while existing battles retain their frozen four-slot configuration.

The collection is grouped into five ordered class ladders. Cards show tier and base power, and the detail panel shows the next unit, its 3× improvement, and unlock requirements. Healing details and training previews show healing output and budget. Army/scouting, tutorial text, recruitment HUD, and battle effects use the new roster.

The artwork registry deliberately reuses existing painted portraits and complete animation atlases for new identities. Several tiers share a source sprite; names and visible tiers distinguish them. No new bespoke artwork was generated in this roster revision.

## Campaign and saves

Each ten-stage chapter advances enemy units one roster tier, capped at tier 5. Formation classes remain consistent between chapters. Enemy Keep HP is (140 + 20×encounter)×3^chapter through chapter 5; later chapters retain tier 5 with a growing Keep. Player Keep HP is (240 + 120×(level−1))×3^(level−1). This prevents later units from immediately deleting an unscaled Keep.

New state is schema 7; new battles use rules 9 with a 90-second wall-time limit. As allowed for this development project, old roster ownership/training resets to class starters and slots map by former recruitment building (duplicate mapped slots become empty). Learning, Resources, Gold, buildings, campaign progress and frozen battles remain. Historical rules 1–6 definitions exist only for old battle execution and validation; removed specialists cannot be acquired or equipped.

Migration 20260906130000_five_unit_classes.sql updates the SQL unit allowlist and new/reset state default. Edge performs roster normalization on the next read/command. Deploy learning and the frontend with the migration.

## Validation

unitCollection.test.ts checks all 500 attacker/defender tier combinations in actual combat, exact base progression, successor superiority, every unit's snapshot at maximum progression, healing exclusions/budgets, splash caps, deterministic reload/catch-up, and the 48-fighter limit. Historical fixtures still test old combat/rewards. UI journey tests cover unlocking, training, equipping and reload. Database tests cover service-only allowlists, JSONB round trips, resets, receipts and purchases.

node scripts/measure-roster.mjs writes current campaign evidence to docs/roster-balance.json; node scripts/measure-battles.mjs measures additional healer compositions. See [battle balance](battle-balance.md) for the representative results.
