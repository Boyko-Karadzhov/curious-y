# Swarm art and fitted equipment

Generated with the built-in `image_gen` tool. [prompts.json](prompts.json) contains the complete prompt set and source mapping. The existing Berserker portrait and Archer atlas supplied the painted fantasy style; the new Hatchling sheet supplied the shared beetle anatomy for the other tiers.

- Five distinct beetle identities, each with 12 idle/walk/bite frames and a portrait: `public/assets/units/{hatchling,forager,stinger,ravager,hive-guard}-v2/`.
- Fifteen equipment designs: five carapaces, five mandible pairs and five hive crests in `public/assets/equipment/swarm-v1/`. Upper and lower mandibles are also saved separately for articulation.
- Reproducible export: `./scripts/import-swarm-art.ps1`. Generated alpha is retained. Opaque source sheets use the authored magenta export matte; the importer removes it, preserves clean silhouettes, finds safe gutters and normalizes frames without cutting off antennae.
- `src/lib/kingdom/swarmRig.json` records the import transforms. `swarmArt.ts` holds per-pose shell and jaw landmarks. Armor sits on the abdomen; independently hinged jaws attach below the eyes. Equipment tier never replaces the recruited identity. Artifacts remain inventory icons, as in the other classes.

Open `/docs/art/swarm-review.html` in the Vite dev server to compare all identities, equipment-only and mixed-tier loadouts, enlarged details, native battlefield size and every animation pose. “Check every equipment combination” renders all 2,100 nonempty equipment/pose combinations and checks missing artwork and clipping. The page uses isolated review data and never spends account resources.

Visual review covered idle, walk, preparation, open bite, lunge and recovery. Closed-jaw angles were adjusted so upper and lower blades remain distinct. Regression tests cover real per-slot assets, mixed tiers, failed-image recovery, RGBA exports and Forge icons.

No game rules, player state or database schema change in this art release.
