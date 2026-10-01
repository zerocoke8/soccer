// 그림체 후보 4종 프롬프트 파일 생성: prompt_<id>.txt (Codex exec 에 stdin 으로 넘긴다)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const common = fs.readFileSync(path.join(dir, "prompt_common.txt"), "utf8").trim();

const STYLES = {
  A_anime_cel: "Modern mobile gacha anime key-art style: clean crisp lineart, cel shading with soft gradient highlights, bright saturated colors, polished glossy finish, large expressive eyes, sporty energetic feel.",
  B_painterly: "Painterly fantasy illustration style: soft lineart that partly dissolves into color, visible brush texture, gentle pastel-rich palette, warm rim light, airy watercolor-like wind effects, elegant storybook fantasy mood.",
  C_bold_cartoon: "Bold graphic comic style: thick confident black outlines, flat colors with hard-edged cel shadows, strong silhouette, high contrast, dynamic speed lines around the ball, punchy sports-manga energy.",
  D_chibi: "Cute super-deformed (chibi) anime illustration: about 2.5 heads tall, big round head, compact body, simple clean shapes, thick clean outlines, soft cel shading, very readable silhouette - designed so it converts easily into a small 64x64 pixel sprite.",
};

for (const [id, style] of Object.entries(STYLES)) {
  const text = [
    "$imagegen",
    "Generate exactly ONE high-resolution full-body character illustration for a fantasy soccer gacha game (used for character cards and full-screen skill cut-ins). Use the highest-quality image setting available.",
    "",
    `STYLE (${id}): ${style}`,
    "",
    common,
    "",
    `Save the final PNG in the current working directory as ${id}.png. Do not create any other files. Reply with the saved file path only.`,
  ].join("\n");
  fs.writeFileSync(path.join(dir, `prompt_${id}.txt`), text);
  console.log(`prompt_${id}.txt`);
}
