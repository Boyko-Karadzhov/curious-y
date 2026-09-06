# Consistent unit art

The complete 20-unit roster now uses generated painted character art: one portrait plus 12 idle/walk/attack frames per unit. The eight town buildings, eight Knowledge Towers, five Keep tiers and enemy Keep also use matching generated imagery (22 building outputs). Legacy art files remain for history but are no longer selected by these renderers. The existing CSS/SVG landscape remains in place.

## Identity before animation

Choose one approved full-body character per unit. Keep face, costume, proportions, materials and weapon fixed when generating its poses. Derive collection, army-slot and detail portraits from an approved sprite; never independently prompt a portrait and a battlefield soldier. `src/lib/kingdom/unitArt.ts` owns the presentation mapping, and `UnitPortrait` serves both collection and preparation. No art paths or animation metadata need a save migration or balance change.

The Swordsman reference establishes compact heroic proportions, dark outlines, clear cel shading, copper hair, a teal scarf, navy cloth, ivory steel and tan leather. Camera: right-facing three-quarter side view. Lighting: upper left. Design for a 50–65px body on the battlefield, with a readable head, weapon and silhouette. Use smooth downsampling for painted characters; preserve nearest-neighbor sampling for the legacy pixel art.

## Diversity specification

Keep the same rendering style while changing silhouette, body shape, face, age, clothing and equipment deliberately. Give each unit three persistent recognition cues. Do not make twenty variants of the Swordsman or use rarity as a reason to make every unit larger or more ornate.

| Unit family | Distinct silhouettes / equipment |
| --- | --- |
| Swordsman, Spearman, Shieldbearer | Teal scarf and broad sword; tall spear and light tunic; squat armored body and oversized tower shield |
| Berserker, Duelist | Broad shoulders and paired axes; slender fencing stance and narrow rapier |
| Archer, Slinger, Crossbowman, Ranger | Short bow and hood down; compact sling and satchel; wide crossbow and padded coat; longbow and long hooded cloak |
| Knight, Scout Rider, Lancer | Armored horse and heavy rider; light pony and scout; long lance and pennant. Generate rider and mount together. |
| Catapult, Ram, Bombardier, Clockwork Gunner | Open throwing arm; roofed horizontal siege engine; round bomb packs; brass mechanical firearm |
| Medic, Frost Mage, Battle Sage, Astral Colossus | Medicine satchel and short staff; angular ice staff and pointed cloak; open book and round robes; broad stone body with star-shaped core |

The initial rollout is complete across humanoids, supports, mounted units, machines, town buildings and Knowledge Towers. For future additions, review the new master beside the whole roster before animating it. The development review page shows all portraits and buildings together and lets you select any unit for the real battlefield renderer.

## Production loop

1. Approve the character master at portrait size and actual battlefield size against light and dark backgrounds.
2. Use that master as the image-generation reference for idle, walk and attack. Keep one unit per sheet; avoid large multi-character generation jobs that make continuity hard to inspect.
3. Ask for real transparency first and inspect the decoded alpha channel. A checkerboard drawing is not transparency. This run required a uniform magenta matte export and a deterministic chroma-key import.
4. Normalize frames to equal cells, a fixed body scale and an explicit foot pivot. Center by body, not the sword bounding box. Keep attack effects separate in future packs.
5. Extract the portrait from an approved idle frame, trimming only whitespace. Register the portrait and atlas together. Both teams use the same identity, mirrored; team health bars remain outside the transformed sprite.
6. Review the animation in `docs/art/review.html` using the actual `BattleRenderer`, including walk, attack, idle, team direction, pause and system reduced motion. Check 64px portraits and small battlefield scale, then repeat on a phone-sized viewport.
7. Verify nonempty frames, alpha, no edge clipping, consistent baseline, timing, identity fallback, and unchanged combat snapshots. Keep source, exact prompts and importer alongside the versioned output.

## Swordsman v1 files and contract

- `docs/art/swordsman-v1-source.png`: selected generated matte source, built-in image generation (no API CLI).
- `docs/art/swordsman-v1-prompts.md`: complete generation and revision prompts.
- `scripts/import-swordsman-art.ps1`: PowerShell 7 / Windows System.Drawing importer. Run from the repository with `./scripts/import-swordsman-art.ps1`. The reviewed pivots are specific to this source; inspect and author new pivots for new sources.
- `public/assets/units/swordsman-v1/atlas.png`: 1024×768 RGBA; four columns, three rows, 256px cells. Idle row 0, walk row 1, attack row 2. Pivot `(112,232)` in every cell. The importer rejects empty cells and opaque pixels touching cell edges.
- `public/assets/units/swordsman-v1/portrait.png`: 192×196 RGBA crop of idle frame 0. The original SVG remains available in version control.
- `src/lib/kingdom/unitArt.ts`: asset registry and animation metadata. Generated attack timing follows the fighter's actual interval; reduced motion uses idle frame 0. An unavailable atlas falls back to its own portrait, never to Tiny Swords soldiers.

These are four-pose cycles, not hand-animated production-quality motion. Idle changes are subtle and the walk is stylized. For a polished release, refine the walk/contact poses and expand to 6–8 frames per action using the approved identity, then repeat visual review. Image generation produces the art; technical normalization and motion review make it usable. Do not assume a prompt alone guarantees a valid sprite sheet.

Local review: run the Vite dev server, then open `/docs/art/review.html` for the collection or `/docs/art/game-review.html` for the actual Castle map and Knowledge Towers with a local sample kingdom. These developer review pages are not part of the production game bundle.

## Complete collection export

- `docs/art/generated-manifest.json` maps the 19 additional unit sheets and all 22 building outputs to their retained sources. Keep variants share one reviewed source sheet.
- `docs/art/unit-generation-prompts.json` and `docs/art/building-generation-prompts.json` preserve the exact prompts and built-in generation provenance. No external API CLI was used.
- `docs/art/units/*-source.png` and `docs/art/buildings/*-source.png` retain selected matte exports, outside the production public directory.
- `scripts/import-generated-art.ps1` keys the reserved magenta matte, finds clear source gutters, normalizes a common scale across each unit's poses, derives foot/chassis pivots from the lower body, crops the idle portrait, and checks nonempty content and transparent margins. Explicit reviewed Keep crops and component isolation avoid collecting a neighboring spire. The script is a deterministic importer, not a new art generator.
- Every `public/assets/units/{id}-v1/atlas.png` is 1024×768 RGBA with 256px cells; new units use pivot `(128,232)`. Swordsman retains its original `(112,232)` pivot and dedicated importer. Portraits are tightly cropped from the first idle frame.
- Every `public/assets/buildings/{id}-v1/image.png` is 512×512 RGBA, with the foundation aligned near the bottom. `buildingArt.ts`, `KeepVisual`, `BuildingVisual`, and `KnowledgeTowers` consume these images.
- Mounted units include the entire rider and horse. Rendering normalizes the measured idle silhouette to 64px, or 76px for cavalry and Astral Colossus, before responsive scaling. Long weapons therefore do not shrink the character's body. The registry retains measured idle heights; remeasure them when replacing a sheet. Team bars and badges remain outside mirroring. Archer and Catapult projectile releases align with the third attack pose.

Run `./scripts/import-generated-art.ps1` in PowerShell 7 on Windows to reproduce this expanded collection. Unit generation requests 1536×1024; building imports accept the generated square dimensions and normalize them to 512px. Inspect all new source sheets before adding them to the manifest. For additional units, asset tests deliberately fail until the corresponding portrait and atlas exist.
