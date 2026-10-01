// 64×64 베이스 스프라이트 나란히 보기: lineup_4x.png (4배, nearest, 회색 배경, 발 기준선 표시)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire("C:/Users/민철/Desktop/soccer/package.json");
const puppeteer = require("puppeteer-core");
const { findBrowser } = await import("file:///C:/Users/민철/Desktop/soccer/tools/shot.mjs");

const IDS = ["silluen", "neria", "greta", "ulrika", "mirka"];
const imgs = IDS.map((id) => fs.readFileSync(path.join(dir, id, "base.png")).toString("base64"));
const browser = await puppeteer.launch({ executablePath: findBrowser().path, headless: true });
const page = await browser.newPage();
const out = await page.evaluate(async (list) => {
  const S = 4, PAD = 16, W = 64 * S;
  const c = document.createElement("canvas");
  c.width = list.length * (W + PAD) + PAD;
  c.height = W + PAD * 2;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#8f9496";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < list.length; i++) {
    const img = new Image();
    await new Promise((ok) => { img.onload = ok; img.src = "data:image/png;base64," + list[i]; });
    g.drawImage(img, PAD + i * (W + PAD), PAD, W, W);
  }
  g.fillStyle = "rgba(0,0,0,.25)";
  g.fillRect(0, PAD + 62 * S + S, c.width, 2); // 발 기준선 (y=62 아래)
  return c.toDataURL("image/png");
}, imgs);
fs.writeFileSync(path.join(dir, "lineup_4x.png"), Buffer.from(out.split(",")[1], "base64"));
console.log("lineup_4x.png");
await browser.close();
