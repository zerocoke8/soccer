// 네리아 v2 · v3 · v4(64) · v4(96) 비교: 윗줄 = 같은 표시 높이(384px), 아랫줄 = 실제 크기 2배 (게임에서 보이는 크기 감)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire("C:/Users/민철/Desktop/soccer/package.json");
const puppeteer = require("puppeteer-core");
const { findBrowser } = await import("file:///C:/Users/민철/Desktop/soccer/tools/shot.mjs");
const items = [
  ["v2 (2등신)", path.join(dir, "..", "pixel_v2", "neria", "base.png")],
  ["v3 (2.5등신)", path.join(dir, "..", "pixel_v3", "neria", "base.png")],
  ["v4 64×64", path.join(dir, "neria_64", "base.png")],
  ["v4 96×96", path.join(dir, "neria_96", "base.png")],
].map(([label, f]) => ({ label, b64: fs.readFileSync(f).toString("base64") }));
const browser = await puppeteer.launch({ executablePath: findBrowser().path, headless: true });
const page = await browser.newPage();
const url = await page.evaluate(async (items) => {
  const BOX = 384, PAD = 20, TOP = 28;
  const imgs = [];
  for (const it of items) { const im = new Image(); await new Promise((ok) => { im.onload = ok; im.src = "data:image/png;base64," + it.b64; }); imgs.push(im); }
  const row2H = Math.max(...imgs.map((im) => im.naturalHeight * 2));
  const c = document.createElement("canvas");
  c.width = items.length * (BOX + PAD) + PAD; c.height = TOP + BOX + PAD + TOP + row2H + PAD;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.fillStyle = "#8f9496"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#1b1f22"; g.font = "bold 16px sans-serif";
  imgs.forEach((im, i) => {
    const x = PAD + i * (BOX + PAD);
    const s = Math.floor(BOX / im.naturalWidth);
    g.fillText(items[i].label + ` (×${s})`, x, 20);
    g.drawImage(im, x, TOP, im.naturalWidth * s, im.naturalHeight * s);
    g.fillText("실제 ×2", x, TOP + BOX + PAD + 18);
    g.drawImage(im, x, TOP + BOX + PAD + TOP, im.naturalWidth * 2, im.naturalHeight * 2);
  });
  return c.toDataURL("image/png");
}, items);
fs.writeFileSync(path.join(dir, "neria_compare.png"), Buffer.from(url.split(",")[1], "base64"));
await browser.close();
console.log("neria_compare.png");
