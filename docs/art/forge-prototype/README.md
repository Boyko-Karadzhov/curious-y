# Forge equipment prototype

Run the Vite development server and open `/docs/art/forge-review.html`.
This follows the existing development-only art review pages. It is not integrated
into combat, save data, or the Forge economy.

## Equipment

- One swordsman with four idle, four walk and four attack frames.
- Iron (tier I) and sunsteel (tier V) swords, attached independently at the hand.
- Iron and sunsteel armor, each authored to fit all 12 body poses. Armor is on by
  default. Either armor tier can be combined with either sword, or no sword.
- No artifact visuals; artifacts remain part of the planned equipment/stat system.
- Pause/frame stepping, mirroring, grip markers, backdrop selection and a 64px
  comparison with the base unit, iron set, sunsteel set and selected loadout.

## Fitted armor v2

The original catalog-image chestplate overlay did not fit the character well.
V2 replaces it with two registered armored body atlases. Armor is painted into
each pose with the correct collar, waist, armhole and sleeve relationships.
There is no runtime torso scaling, rotation, or rectangular scarf clipping.

Both atlases retain the original character's pose layout and empty hand positions.
The renderer chooses the unarmored/iron/sunsteel body sheet, draws the selected
sword using the existing grip anchors, and restores the selected body's foreground
arm above the grip. Restoring from the same body sheet preserves its armor seams.
Frame composites are cached with a 48-frame limit. Artifacts are neither loaded
nor rendered. The preview reserves headroom for the raised blade.

This avoids a separate sprite sheet for every weapon/armor combination, but each
armor set still requires a fitted animation sheet for each distinct unit body.
Weapons were not redrawn or repositioned. The original item icons remain in use
for the selection controls; their source art guided the fitted armor designs.

## Artwork and reproduction

Generated with the built-in `image_gen` tool. The exact original prompts are in
`prompts.json`; fitted-armor edit prompts are in `armor-v2-prompts.json`.
All selected source PNGs are adjacent to this file. Each armor edit references
`base-source.png` as its registered edit target and the corresponding armor icon
source as its design reference.

Run `scripts/import-forge-prototype.ps1` to reproduce the assets under
`public/assets/equipment/forge-prototype-v1/`. Use `-ArmorOnly` to import just the
two new `*-armor-body-v2.png` sheets. These use the project's existing magenta
chroma-key workflow. Original item alpha is preserved during trim/resize.
The original artifact artwork remains an unused concept asset.

## Remaining limits

The generated walk frames need stronger leg variation for production. Other
classes, cavalry, and siege units need their own fitted armor artwork and reviewed
weapon anchors. This remains a separate canvas study at the battlefield's nominal
64px body height; it does not replace `BattleRenderer`. Real battle integration
will need an equipment presentation registry and a battle loadout snapshot.

No database migrations or edge-function code were changed.

## Validation

Reviewed both 12-frame source sheets and their imported transparent artwork.
Checked the preview at desktop and 390px phone width: idle, walking, raised-arm
wind-up, downward swing, mirrored extended strike, mixed weapon/armor tiers, and
64px battlefield comparison. The raised sword now stays inside the preview.
JavaScript syntax checks passed.
