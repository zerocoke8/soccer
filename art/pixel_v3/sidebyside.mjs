// 여러 64×64 스프라이트를 4배로 나란히: node sidebyside.mjs <out.png> <a.png> <b.png> ...
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/민철/Desktop/soccer/package.json");
const puppeteer = require("puppeteer-core");
const { findBrowser } = await import("file:///C:/Users/민철/Desktop/soccer/tools/shot.mjs");
const [out, ...files] = process.argv.slice(2);
const imgs = files.map((f) => fs.readFileSync(f).toString("base64"));
const browser = await puppeteer.launch({ executablePath: findBrowser().path, headless: true });
const page = await browser.newPage();
const url = await page.evaluate(async (list) => {
  const S = 4, PAD = 16, W = 64 * S;
  const c = document.createElement("canvas");
  c.width = list.length * (W + PAD) + PAD; c.height = W + PAD * 2;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.fillStyle = "#8f9496"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < list.length; i++) {
    const img = new Image();
    await new Promise((ok) => { img.onload = ok; img.src = "data:image/png;base64," + list[i]; });
    g.drawImage(img, PAD + i * (W + PAD), PAD, W, W);
  }
  return c.toDataURL("image/png");
}, imgs);
fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
await browser.close();
console.log(out);
