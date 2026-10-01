// 도트 v4 (2026-10-01): 네리아를 64×64 · 96×96 두 크기로, astra xhigh 가 Aseprite Lua 로 직접 그림 (이미지 생성 초안 없음).
// 자세 · 비율 = reference_pose.png (사용자 첨부 스프라이트 시트, 외부 그림 — 커밋 안 함), 그림체 = reference_pixel.png (도트 예시 시트, 커밋 안 함).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ASEPRITE = "C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe";

const SIZES = {
  64: { height: "about 58-62 px (the character fills most of the canvas, like the pose reference fills its cell)", eyes: "about 4 px tall", detail: "simplify: hair in big clean clusters, gloves as clear blocky shapes with 1-2 knuckle lines, wave pattern as 2-3 strokes" },
  96: { height: "about 86-92 px (the character fills most of the canvas, like the pose reference fills its cell)", eyes: "about 6-7 px tall", detail: "more detail is possible: hair strand clusters, glove fingers and cuffs, the wave pattern on the side panel, strap buckles, the hair ornament with its tassel" },
};

for (const [size, s] of Object.entries(SIZES)) {
  const d = path.join(dir, `neria_${size}`);
  fs.mkdirSync(path.join(d, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(dir, "..", "style_test", "ref4", "neria.png"), path.join(d, "source.png"));
  fs.copyFileSync(path.join(dir, "reference_pose.png"), path.join(d, "reference_pose.png"));
  fs.copyFileSync(path.join(dir, "..", "pixel_v2", "reference_pixel.png"), path.join(d, "reference_pixel.png"));
  const brief = `TASK: draw ONE native ${size}x${size} PIXEL-ART BASE SPRITE of 네리아 DIRECTLY in Aseprite (Lua scripts through the Aseprite CLI), from her full illustration. Work only inside the current directory.

ATTACHED IMAGES
1. source.png — 네리아's full illustration: the CHARACTER to draw (identity, outfit, colours).
2. reference_pose.png — a chibi sprite sheet from another game (4 columns x 5 rows of animation frames). Use it as the main reference for POSE, PROPORTIONS and SPRITE RENDERING QUALITY: very large head with voluminous hair (head+hair about half of the total height), small compact body, short legs in a sturdy slightly wide stance, 3/4 view, rich clustered shading, characters filling their cell. Never copy its character, hair style, weapons or outfit.
3. reference_pixel.png — a sheet of chibi pixel characters from another game: secondary reference for pixel STYLE (big expressive eyes with a highlight, coloured outlines, clean clusters). Never copy its characters.

IMPORTANT — NO IMAGE GENERATION: do NOT use $imagegen or any image-generation tool and do not make an AI draft. You draw every pixel yourself from the illustration.

Aseprite CLI: "${ASEPRITE}" -b --script-param key=value --script scripts/<name>.lua   (Aseprite 1.3.18 Lua API: Sprite, Image, Palette, Color, image:drawPixel, image:getPixel, Image{ fromFile = ... }, sprite:saveAs / saveCopyAs)

CHARACTER (from source.png): 네리아 — water spirit goalkeeper, serene adult woman. Very long white hair hanging down calmly (not flying) with the tips softly tinted aqua — give it volume around the head like the pose reference, falling behind her to around knee height; calm blue-grey eyes; small blue hair ornament with a tassel. Outfit: warm-white long-sleeved high-collar keeper top with navy/cerulean wave patterns and navy straps/belt, BIG ornate goalkeeper GLOVES (must read clearly), navy shorts, long white side panel with blue wave pattern, white-and-navy knee socks, white boots with navy details, tiny coral tassel accents.

SPRITE SPEC
- Canvas exactly ${size}x${size}, transparent background, one frame: the IDLE frame, posed like the first frame of reference_pose.png (calm standing, 3/4 view, feet slightly apart, weight centred) but facing RIGHT (body turned slightly to the right, face toward the viewer with both eyes visible). Her gloved hands are visible (e.g. one relaxed at her side, one slightly forward, or both in front at waist height). No ball (separate sprite).
- Character height ${s.height}; feet on a common baseline near the bottom (2-3 px margin). Head (with hair volume) roughly half of the height; eyes ${s.eyes} with coloured iris and a highlight; tiny mouth; light blush.
- Pixel discipline: alpha strictly 0 or 255 (no semi-transparent pixels), no dithering noise, no isolated single pixels; 1 px dark COLOURED outline (dark version of the local hue), selective lighter outline on lit edges; cel cluster shading with light from the upper left; internal anti-alias tones only where they smooth curves. At most ${size === "64" ? 32 : 48} colours, hues sampled from source.png and slightly brightened toward clean pixel art.
- Detail level: ${s.detail}.

METHOD (suggested)
1. Inspect the images (zoom crops via script); write scripts/style_notes.txt (proportions measured from the pose reference: head/body ratio, stance width, how hair volume frames the head) and scripts/palette.txt (sampled from source.png).
2. Author the sprite in scripts/draw.lua as EXPLICIT PIXEL MAPS (rows of characters mapped to palette entries), preferably per layer (hair-back, body/outfit, face, hair-front, accessories), and render to base.aseprite + base.png.
3. Render previews: preview_${size === "64" ? 8 : 6}x.png (nearest-neighbour on neutral grey) and side.png (source illustration scaled down next to the enlarged sprite). Do NOT include crops of either reference sheet in any output file.
4. LOOK at the previews and iterate several revision passes (keep pass images in scripts/): silhouette and proportions vs the pose reference first, then face/eyes, hair volume and clusters, outline continuity, gloves, feet, costume details. Stop only when it reads clearly at 1x and looks polished enlarged.
5. Verify (size, alpha 0/255, colour count, bounding box, height, baseline, no isolated pixels) into verification.txt.

Reply with a short report: what you made, colour count, bounding box and height, revision passes, known issues.
`;
  fs.writeFileSync(path.join(d, "brief.txt"), brief);
  console.log(`neria_${size}`);
}
