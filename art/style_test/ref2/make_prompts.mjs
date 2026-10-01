// 사용자 기준 그림(reference.png) 스타일로 캐릭터 일러스트 샘플 프롬프트 생성: prompt_<id>.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const STYLE = `STYLE REFERENCE: the attached image (reference.png) is the AUTHORITATIVE ART STYLE reference. Use it only for style — do NOT copy its characters, faces, swords or exact outfits.
Match its style closely:
- high-end anime character-design illustration, crisp thin clean lineart with confident varied line weight
- restrained flat cel shading with only subtle soft gradients; no painterly texture, no heavy rendering, no 3D look
- palette dominated by black, white and off-white with metallic GOLD accents, plus at most one small accent colour per character
- elegant elongated fashion-model proportions (about 8 heads tall), long legs, poised confident stance, slight contrapposto
- extremely detailed ornate costume design in the same spirit: layered garments, high collars, straps, harness belts, buckles, gold filigree fittings, tassels and cords, asymmetric long coat-tails or skirt panels, emblem / crest motifs printed on fabric panels
- beastfolk features (if any) drawn like the reference: large furry ears and a big fluffy tail with soft white fur
- full body visible from head to toe with a small margin, single character, centred, plain off-white background (like the reference), no scenery
- no text, no letters, no numbers, no logos, no watermark, no signature, no frame`;

const GAME = `GAME CONTEXT: a fantasy SOCCER (football) gacha game. Every character is a soccer player, so the costume is a fantasy soccer uniform reinterpreted in the reference's fashion (sporty jersey/top with a high collar, shorts with long ornamental side panels or a coat-tail, knee socks or leg wraps, and SOCCER BOOTS with gold fittings — no high heels), and the character holds or plays an ornate soccer ball (black-and-white panels with gold trim) instead of any weapon. No swords or weapons at all.`;

const CHARS = {
  ulrik: `CHARACTER: 울릭 — wolf beastfolk winger (forward), wind element, speed type. A young woman with large silver-grey wolf ears and a huge fluffy wolf tail (white fur with grey tips), messy short silver hair, sharp fang-showing confident grin with eyes narrowed in excitement. Lean athletic sprinter build. Accent colour: pale wind green (small details only). Pose: dynamic but readable — one foot on the ball, body leaning forward as if about to sprint, one hand raised in a beckoning gesture.`,
  silluen: `CHARACTER: 실루엔 — forest elf playmaker (midfielder), wind element, technique type. Graceful, slightly androgynous, calm knowing smile. Long pointed elf ears, very long silver-green hair loosely tied at the back with a leaf-shaped gold hair ornament. Accent colour: jade green (small details only). Pose: elegant — balancing the ball on the instep of one raised foot, arms open for balance, coat-tails flowing.`,
  grumba: `CHARACTER: 그룸바 — giant-race striker (forward), fire element, power type. A towering, broad, heavily muscular man (clearly bigger and bulkier than normal humans), short dark-red hair, small stubby horns, a scar on the cheek, wide fearless grin. Accent colour: ember red-orange (small details only). Costume adapted to a huge frame: sleeveless high-collar jersey, heavy gold-buckled harness belts, armoured gauntlet-style bracers. Pose: ball tucked under one arm, other fist raised, chest out, intimidating but cheerful.`,
  neria: `CHARACTER: 네리아 — water spirit goalkeeper, water element, technique type. A serene young woman with long flowing white hair that turns translucent aqua at the tips like water, calm gentle eyes, faint water-droplet ornaments. Accent colour: aqua blue (small details only). Goalkeeper costume: long-sleeved high-collar keeper top, ornate goalkeeper gloves with gold fittings, long side panels. Pose: holding the ball firmly in both gloved hands at chest height, composed stance.`,
};

for (const [id, ch] of Object.entries(CHARS)) {
  const text = [
    "$imagegen",
    "Generate exactly ONE high-resolution full-body character illustration (portrait orientation) for a game's character card / skill cut-in. Use the attached image as the style reference input for the image generation. Use the highest-quality image setting available.",
    "",
    STYLE,
    "",
    GAME,
    "",
    ch,
    "",
    `Save the final PNG in the current working directory as ${id}.png. Do not create any other files. Reply with the saved file path only.`,
  ].join("\n");
  fs.writeFileSync(path.join(dir, `prompt_${id}.txt`), text);
  console.log(`prompt_${id}.txt`);
}
