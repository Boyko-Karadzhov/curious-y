# Battle artwork

Original vector arrow and stone projectiles for Curious-Y. Edit
`scripts/generate-battle-assets.mjs` and run `node scripts/generate-battle-assets.mjs`
to regenerate them.

All battlefield units and spawn portraits use the generated PNG artwork in
`../units/{id}-v1/`, resolved through `src/lib/kingdom/unitArt.ts`.
The obsolete unit, cavalry mount and catapult SVGs have been removed.

## World scenery and Keeps

`worlds/{theme}-v1/background.jpg` and `castle.png` are original artwork generated
with the built-in image_gen tool. The nine themes cover worlds 2–10: autumn,
frost, desert, marsh, volcanic, crystal, coast, sky, and astral. World 1 retains
its CSS meadow and existing enemy Keep. Both scenery and enemy Keeps repeat
every ten worlds (11 = 1, 12 = 2), resolved by `src/lib/kingdom/battleArt.ts`.
Each background loads only when its world is displayed; the collection is not
preloaded. Existing CSS scenery remains underneath as a loading/error fallback.

The exact generation prompts are in `docs/art/battle-world-prompts.json` and
`docs/art/battle-castle-prompts.json`. Castle prompts use the original enemy Keep
as a style reference. The user approved script removal of export mattes after
the image tool returned a painted checkerboard instead of transparency.

`scripts/import-battle-art.ps1 -Manifest <json>` accepts an array of
`{ "id": "autumn", "kind": "castle" | "background", "source": "absolute PNG path" }`.
It reuses the existing Keep importer for magenta removal and bottom-anchored
512px transparent sprites, preserving pale stone colors. Backgrounds use JPEG
quality 88. No art generation API key is needed for the built-in tool workflow.

## Healing

`healing-aura-v1.png` is a 256px generated rune/leaf glow with soft transparency.
`scripts/import-healing-art.ps1 -Source <generated PNG>` removes its black export
matte. The renderer pulses the aura underneath the recipient and draws moving
sparks from healer to recipient, plus rising sparkles. A canvas rune provides a
loading/error fallback. Reduced motion uses a steady aura and recipient marker;
paused, completed, exhausted, and stale combat produces no active healing effect.
Rendering never changes HP or battle state.

Run Vite and open `/docs/art/battle-review.html` to review the actual battlefield
with sample fighters, world selection (including the 11/12 wrap), and narrow,
paused, or expanded layouts. This page does not read or change saved progress.
