// 4차 샘플 (2026-10-01 사용자 방향): 기준 그림 2장(reference1 = 여우 수인 2인, reference2 = 청록 기모노 고양이 귀)
// · 그림체만 참고 · 색은 캐릭터별 · 무광(반짝임·광택 금지) · 장발은 차분하게 떨어지게 · 전원 여성(새 이름) · 체형 규칙
// 출력: prompt_<id>.txt
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const STYLE = `STYLE REFERENCES: two attached images are references for DRAWING TECHNIQUE and FINISH ONLY. Do NOT copy their characters, faces, swords or outfits.
Take from them:
- refined anime character-design illustration with crisp thin lineart and confident varied line weight
- MATTE, SOFT, FLAT finish like the second reference (teal kimono cat-eared woman): flat cel colours with very gentle shading, slightly muted / desaturated tones, a calm paper-like look
- NO glossy or shiny rendering: no specular highlights on skin, hair, fabric, leather or metal, no sparkles, no glints, no bloom, no glow, no shine lines; metal ornaments are drawn as flat ochre/brass colour with simple shading
- HAIR: long hair hangs down calmly and naturally with gravity, falling straight or in soft gentle waves along the body, only a slight sway — NOT blown by wind, NOT floating or flaring out, no dramatic flowing strands
- elegant fashion-model proportions, calm poised stance (quiet confidence rather than wild action)
- very detailed ornate costume design: layered garments, high collars, straps, harness belts, buckles, metal fittings, tassels and cords, asymmetric long coat-tails or skirt panels, embroidered emblem / motif patterns on fabric
- beastfolk features (if any): large furry ears and a big fluffy tail drawn with soft matte fur
- full body visible head to toe with a small margin, single character, centred, plain warm off-white background, a faint flat floor shadow is fine, no scenery
COLOUR: each character has her OWN palette (given below) — varied and harmonious, but in muted matte tones like reference 2, not neon, not glossy.
Hard rules: no text, no letters, no numbers, no logos, no watermark, no signature, no frame. The character is an adult woman. Tasteful sports-fashion outfit, no nudity.`;

const GAME = `GAME CONTEXT: a fantasy SOCCER (football) gacha game where every player is a woman. The costume is a fantasy soccer uniform reinterpreted in this ornate fashion (sporty top with a high collar, shorts with long embroidered side panels or a coat-tail, knee socks or leg wraps, ornate SOCCER BOOTS — no high heels), and she holds or rests a hand / foot on an ornate soccer ball whose colours match her palette. No swords or weapons.`;

const CHARS = {
  ulrika: `CHARACTER: 울리카 — wolf beastfolk winger (forward), wind element, speed type. TALL athletic woman with a curvy, toned figure (emphasise her athletic curves). Large silver-grey wolf ears and a big fluffy silver tail, short-to-medium silver hair falling naturally, confident fang-showing grin. PALETTE (muted): deep teal and pine green with grey-silver, cream and a little brass. Pose: standing relaxed with one foot resting on the ball, one hand on her hip, the other giving a small beckoning gesture.`,
  silluen: `CHARACTER: 실루엔 — forest elf playmaker (midfielder), wind element, technique type. TALL, elegant, glamorous woman with a clearly voluptuous, curvy figure (full bust, defined waist, long legs — emphasise her figure gracefully). Long pointed elf ears, very long silver-green straight hair hanging down calmly past her waist (loosely tied low at the back), leaf-shaped hair ornament, calm knowing smile. PALETTE (muted): moss and sage green, ivory cream, ochre gold, with touches of dusty sky blue. Pose: standing gracefully, the ball resting on the instep of one slightly raised foot, hands relaxed.`,
  greta: `CHARACTER: 그레타 — giant-race striker (forward), fire element, power type. A GIANTESS: much taller and bigger than normal women, powerfully muscular yet voluptuous (broad shoulders, strong arms and thighs, full figure). Short crimson hair, small stubby horns, a cheek scar, wide fearless grin. PALETTE (muted): brick red, burnt orange and mustard with charcoal brown and brass. Costume adapted to her huge frame: sleeveless high-collar top, heavy buckled harness belts, leather-and-brass bracers. Pose: standing tall, ball tucked under one arm, other hand on her hip, cheerful and imposing.`,
  neria: `CHARACTER: 네리아 — water spirit goalkeeper, water element, technique type. TALL, serene woman with a graceful curvy figure (emphasise her elegant curves). Long white hair hanging straight down calmly to her thighs, the tips softly tinted aqua, calm gentle eyes, small water-drop shaped ornaments (matte, not shiny). PALETTE (muted): slate and cerulean blue, soft aqua, warm white, silver-grey, with small coral accents. Goalkeeper costume: long-sleeved high-collar keeper top, ornate goalkeeper gloves. Pose: holding the ball in both gloved hands at waist height, composed quiet stance.`,
  mirka: `CHARACTER: 미르카 — cat beastfolk trickster (midfielder), wind element, technique type, from the harbour back-alleys. PETITE, short and youthful-looking young adult with a slim, small-chested frame — cute and mischievous, NOT sexualised; modest, playful outfit with an oversized jacket. Lilac hair in a short bob falling naturally, large cat ears and a long striped cat tail, sly cat-like grin with one small fang. PALETTE (muted): lavender and plum with mint green, cream and small brass accents. Pose: standing playfully, the ball balanced under one foot, hands tucked behind her back, head tilted.`,
};

for (const [id, ch] of Object.entries(CHARS)) {
  const text = [
    "$imagegen",
    "Generate exactly ONE high-resolution full-body character illustration (portrait orientation) for a game's character card / skill cut-in. Use BOTH attached images as style reference inputs for the image generation (drawing technique and matte finish only). Use the highest-quality image setting available.",
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
