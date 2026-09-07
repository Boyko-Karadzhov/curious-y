# Forge equipment

The live Forge uses 75 item definitions: five classes, three slots and five tiers. `forge-tuning.json` is the shared economy configuration. Construct at Keep 4 for 10 of every non-Gold resource; each Forge costs 2 of each. Every ten forges earns a level, capped at 100, using recruitment's tier probability curve. Tier sale values are 8 / 20 / 50 / 125 / 300 Gold.

Items have a tier-based class stat plus a rolled bonus that applies across equipped classes. Bonuses add within each stat. Healer damage and attack speed mean healing power and healing rate. Range rolls apply to ranged and siege units. There are exactly 15 equipped slots and one durable pending decision; replacing an item automatically sells the old one. Request reservations, revisions and receipts protect charges, rolls and sales from retries and competing tabs.

Artwork was generated with the built-in `image_gen` tool; the complete prompts and generation file identifiers are in [prompts.json](./prompts.json). Final runtime assets live in `public/assets/equipment/forge-v1/`: a normalized 5×15 icon atlas, 75 isolated item sprites and 21 pose-registered body sheets. Melee's base and two approved armor sheets remain in `forge-prototype-v1/`.

`scripts/import-forge.ps1` removes the generated magenta matte, preserves violet runes, isolates icon components, and registers icons into 128px cells. Body outputs use `CLASS-body-TIER.png`; inventory icons use `CLASS-SLOT-TIER.png`. The importer accepts the original generated source path and an output body name.

Equipment uses one fitted animation rig per class: swordsman, archer, mounted knight, and healer. Recruited unit tiers remain visible in the battlefield pips. Weapons attach to each pose's hand; armor is painted on the matching body pose, including perspective and occlusion. Artifacts never render on fighters. Siege keeps its original unit art; its weapon changes the projectile, colored trail, rotation and impact. Siege armor is an abstract fortification doctrine with no fighter layer. Battles freeze their equipment tiers and stats at start under rules version 12.

Open `/docs/art/forge-game-review.html` with the Vite dev server for an isolated playable workshop, all equipment tiers and poses, the production battlefield renderer and all 75 icons. This review has no connection to account storage or account resources. The earlier approved melee experiment remains at `/docs/art/forge-review.html`.

Validation: Forge economy, corruption handling, probability bounds, healer equivalence, rate precision, battle snapshots, Demo retries, interface decisions and actual SQL reservation/commit races are covered by the game and database suites. The review supports independent weapon/armor tiers and idle, walk, and attack poses for visual checks.
