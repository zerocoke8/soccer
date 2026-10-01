// 64×64 도트 베이스 제작 브리프 (Codex gpt-6-astra + Aseprite Lua). 캐릭터별 폴더 <id>/ 에 source.png 복사 + brief.txt 생성.
// 원본 일러스트: ../style_test/ref4/<id>.png (2026-10-01 4차 샘플)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe";

const CHARS = {
  silluen: "실루엔 — forest elf playmaker. Tall glamorous adult woman (keep a curvy silhouette even in SD form), long pointed elf ears, very long silver-green straight hair hanging down calmly, leaf hair ornament, calm smile. Outfit: ivory and moss/sage green with ochre-brass fittings, long embroidered side panels, white thigh-high socks, green-and-ivory boots.",
  neria: "네리아 — water spirit goalkeeper. Tall serene adult woman, very long white hair hanging straight down with soft aqua-tinted tips, calm eyes. Outfit: warm white and slate/cerulean blue keeper top with high collar, big ornate goalkeeper GLOVES (important GK read), navy shorts, wave-pattern side panels, blue-and-white socks, small coral tassels.",
  greta: "그레타 — giantess striker. Much bigger and broader than the others (she should fill more of the canvas), very muscular, short crimson hair, small dark horns, cheek scar, wide grin. Outfit: brick-red and charcoal crop top with high collar, leather-and-brass bracers and harness belts, dark shorts, red flame-pattern side cloth, dark socks with flame motifs, flame-pattern boots.",
  ulrika: "울리카 — wolf beastfolk winger. Tall athletic adult woman, large silver-grey wolf ears and a big fluffy silver tail (tail extends behind her), short silver hair, fang grin. Outfit: deep teal/pine-green crop top with cream panels and harness belts, teal shorts, swirl-pattern side panels, black knee socks, teal-and-cream boots.",
  mirka: "미르카 — cat beastfolk trickster. PETITE youthful-looking young adult, clearly SHORTER than the others (smaller figure in the canvas), lilac short bob, big cat ears, long striped lilac-and-cream cat tail, sly grin with a small fang. Outfit: oversized cream jacket with mint-green and plum panels, dark plum striped top and shorts, striped plum knee socks, cream boots. Cute, not sexualised.",
};

const COMMON = `TASK: create ONE native 64x64 PIXEL-ART BASE SPRITE of the character in source.png (the attached image) for a landscape soccer game, using Aseprite (Lua scripts run through the Aseprite CLI). Work only inside the current directory.

Aseprite CLI: "${ASEPRITE}" -b --script-param key=value --script scripts/<name>.lua
(Aseprite 1.3.18; Lua API: Sprite, Image, Palette, Color, app.command, image:drawPixel, sprite:saveAs, sprite:saveCopyAs etc.)

SPRITE SPEC
- Canvas exactly 64x64, transparent background, one frame (idle base pose). Save as base.aseprite and base.png. Layers are welcome (e.g. body, hair, outfit, accessories) but base.png is the flattened result.
- View: SIDE VIEW FACING RIGHT (a 3/4 side view is fine: body turned to the right, face in 3/4 profile looking right). This sprite will be mirrored for the other team and animated later (run, kick, tackle…), so keep limbs clearly separated and readable.
- Proportions: SD / chibi game-sprite proportions, about 3 heads tall (head roughly 18-22 px), so the face, hair, ears and costume read clearly at 1x. Feet stand on a common baseline at y = 61-62. Keep the whole character (hair, ears, tail, horns) inside the canvas; tail may extend behind (to the left).
- Do NOT include the soccer ball (the ball is a separate game sprite).
- Identity must stay recognisable from source.png: hair colour/shape, ears/tail/horns, face mood, outfit main colours and the 2-3 most iconic costume details (simplified to pixel size).
- Pixel discipline: integer pixels only, NO anti-aliasing, NO blur, NO dithering noise, alpha strictly 0 or 255, no stray single pixels. Palette of at most 32 colours taken from the illustration, in the same MUTED, MATTE tones (no glossy highlights). Use a dark coloured outline (selective outline is fine), clear silhouette.

SUGGESTED PROCESS (adapt freely)
1. Use $imagegen once with source.png as the reference to generate a pixel-art DRAFT: the same character as an SD side-view sprite facing right, presented as a large clean nearest-neighbour enlargement of a native 64x64 sprite on a flat background. Save it as draft.png.
2. In Aseprite Lua (scripts/build_base.lua): build the real 64x64 sprite from the draft (detect the pixel grid / sample cells, map to a reduced palette, remove the background) and then CLEAN UP pixel by pixel with Lua drawing (fix face, eyes, outline continuity, hands, feet, ears/tail), keeping it faithful to source.png.
3. scripts/verify.lua (or a node/python check): assert 64x64, alpha only 0/255, colour count <= 32, bounding box, baseline, no isolated stray pixels; write verification.txt.
4. Export previews: preview_8x.png (nearest-neighbour 8x on a neutral grey background) and compare.png (source illustration scaled down next to the 8x sprite).
Save every reusable script in scripts/. Do not create files outside the current directory.

When done, reply with a short report: what you made, colour count, bounding box, verification result, known issues.`;

for (const [id, desc] of Object.entries(CHARS)) {
  const d = path.join(dir, id);
  fs.mkdirSync(path.join(d, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(dir, "..", "style_test", "ref4", `${id}.png`), path.join(d, "source.png"));
  fs.writeFileSync(path.join(d, "brief.txt"), `${COMMON}\n\nCHARACTER: ${desc}\n`);
  console.log(id);
}
