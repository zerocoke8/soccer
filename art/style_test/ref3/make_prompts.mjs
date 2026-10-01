// 3차 샘플 (2026-10-01 사용자 방향): 선수 전원 여성 · 체형 규칙(단신 = 어린 인상 · 슬렌더 / 장신 = 몸매 강조)
// · 기준 그림(../ref2/reference.png)은 그림체만, 색은 캐릭터별로 다채롭게. 출력: prompt_<id>.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const STYLE = `STYLE REFERENCE: the attached image is the reference for DRAWING TECHNIQUE ONLY. Do NOT copy its characters, faces, swords, outfits or its black/white/gold colour scheme.
Take from it:
- high-end anime character-design illustration, crisp thin clean lineart with confident varied line weight
- restrained flat cel shading with subtle soft gradients; no painterly texture, no 3D look
- elegant fashion-model proportions and poised, confident stance
- very detailed ornate costume design: layered garments, high collars, straps, harness belts, buckles, metal fittings, tassels and cords, asymmetric long coat-tails or skirt panels, emblem/crest motifs on fabric
- beastfolk features (if any): large furry ears and a big fluffy tail
- full body visible head to toe with a small margin, single character, centred, plain light background, no scenery
COLOUR: vivid, rich and varied — each character has her OWN distinct palette (given below) built around her element and personality. Use several harmonious colours generously; do not default to black, white and gold.
Hard rules: no text, no letters, no numbers, no logos, no watermark, no signature, no frame. The character is an adult woman. Tasteful sports-fashion outfit, no nudity.`;

const GAME = `GAME CONTEXT: a fantasy SOCCER (football) gacha game where every player is a woman. The costume is a fantasy soccer uniform reinterpreted in ornate fashion (sporty jersey/top with a high collar, shorts with long ornamental side panels or a coat-tail, knee socks or leg wraps, ornate SOCCER BOOTS — no high heels), and she holds or plays an ornate soccer ball whose colours match her palette. No swords or weapons.`;

const CHARS = {
  ulrik: `CHARACTER: 울릭 — wolf beastfolk winger (forward), wind element, speed type. TALL, athletic woman with a curvy, toned figure (emphasise her athletic curves). Large silver-grey wolf ears and a huge fluffy silver tail, messy short silver hair, sharp fang-showing confident grin. PALETTE: deep teal and emerald green with silver, crisp white and a little gold. Pose: one foot on the ball, leaning forward as if about to sprint, one hand beckoning.`,
  silluen: `CHARACTER: 실루엔 — forest elf playmaker (midfielder), wind element, technique type. TALL, elegant, glamorous woman with a clearly voluptuous, curvy figure (full bust, defined waist, long legs — emphasise her figure gracefully). Long pointed elf ears, very long silver-green hair loosely tied with a leaf-shaped hair ornament, calm knowing smile. PALETTE: emerald and fresh leaf green, ivory cream, warm gold, with touches of sky blue. Pose: balancing the ball on the instep of one raised foot, arms open, coat-tails flowing.`,
  grumba: `CHARACTER: 그룸바 — giant-race striker (forward), fire element, power type. A GIANTESS: much taller and bigger than normal women, powerfully muscular yet voluptuous (broad shoulders, strong arms and thighs, full figure). Short wild crimson hair, small stubby horns, a cheek scar, wide fearless grin. PALETTE: crimson red, ember orange and flame yellow with charcoal and burnished gold. Costume adapted to her huge frame: sleeveless high-collar jersey, heavy buckled harness belts, armoured bracers. Pose: ball tucked under one arm, other fist raised, chest out, cheerful and intimidating.`,
  neria: `CHARACTER: 네리아 — water spirit goalkeeper, water element, technique type. TALL, serene woman with a graceful curvy figure (emphasise her elegant curves). Long flowing white hair that turns translucent aqua at the tips like water, calm gentle eyes, water-droplet ornaments. PALETTE: sapphire and aqua blues, pearl white, silver, with small coral-pink accents. Goalkeeper costume: long-sleeved high-collar keeper top, ornate goalkeeper gloves. Pose: holding the ball firmly in both gloved hands at chest height, composed stance.`,
  mirka: `CHARACTER: 미르카 — cat beastfolk trickster (midfielder), wind element, technique type, from the harbour back-alleys. PETITE, short and youthful-looking young adult with a slim, small-chested frame — cute and mischievous, NOT sexualised; modest, playful outfit with an oversized jacket. Lilac hair in a short bob, large cat ears and a long striped cat tail, sly cat-like grin with one fang. PALETTE: lavender and violet with mint green, cream and small brass accents. Pose: doing a playful trick — the ball balanced on her head or flicked up with a heel, body twisted, one eye winking.`,
};

for (const [id, ch] of Object.entries(CHARS)) {
  const text = [
    "$imagegen",
    "Generate exactly ONE high-resolution full-body character illustration (portrait orientation) for a game's character card / skill cut-in. Use the attached image as the style reference input for the image generation (drawing technique only). Use the highest-quality image setting available.",
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
