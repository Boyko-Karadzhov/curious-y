# Forge equipment prototype

Run the Vite development server and open `/docs/art/forge-review.html`.
This follows the existing development-only art review pages; it is not a player
feature, a Forge implementation, or a change to combat/save data.

## What is included

- One new unarmed swordsman, with four idle, four walk and four attack frames.
- Iron (tier I) and sunsteel (tier V) sword sprites.
- Iron (tier I) and sunsteel (tier V) cuirass experiments, off by default.
- No artifact visuals. Artifacts remain part of the planned equipment/stat system.
- Independent slot selection, no-equipment choices, animation pause/frame step,
  mirroring, attachment markers, three backdrops and a 64px comparison.
- A renderer with per-frame hand/torso anchors and foreground-arm masks, plus a
  bounded cache of 48 composited frames. Artifacts are not loaded or rendered.

Generated with the built-in `image_gen` tool. Exact generation prompts are in
`prompts.json`; selected source PNGs are adjacent. Source artwork was reviewed
against `public/assets/units/swordsman-v1/portrait.png`.

`scripts/import-forge-prototype.ps1` reproduces the assets in
`public/assets/equipment/forge-prototype-v1/`. The base was exported with a magenta
matte after an initial generation painted a checkerboard. The importer uses the
project's existing chroma-key approach. Item images have actual alpha, which is
preserved while trimming and resizing to 384px maximum dimension.
The original artifact source/export is retained as an unused concept asset.

## Findings and limits

Hand attachment and foreground-arm occlusion make a separate sword read as held,
including the raised wind-up and extended strike. Weapon visuals were approved.
User review rejected the armor fit: the rigid chestplate overlay is insufficient,
even with torso anchors and scarf/arm occlusion. Armor is off by default and the
comparison uses weapons only. Further armor work needs artwork fitted to each
pose. Artifact visuals were dropped entirely at the user's request.

The generated walk frames have insufficient leg variation for production. A full
rollout needs properly authored contact/pass poses, fitted armor perspectives for
each body silhouette, and reviewed masks/anchors for every frame. This one rig
does not prove that one item sprite fits cavalry, siege, or every unit appearance.
The armor is a rigid overlay, not deforming clothing. The base also needs a final
edge cleanup if inspected much larger than battlefield size.

This review page uses a separate canvas compositor and the same 64px nominal
body height as the battlefield renderer. It does not replace the actual
`BattleRenderer`. Accepted artwork would need an equipment presentation registry
and a battle loadout snapshot before being wired into real battles.

No database migrations or edge functions were changed.

## Validation

Checked the preview in the browser at desktop and 390px phone width: independent
slot selection/removal, attack frame stepping, mirrored strike,
backdrop selection and the small-unit comparison. No browser warnings/errors were
reported. JavaScript syntax checks, the app TypeScript check and the production
build passed (the existing large-chunk build warning remains).
