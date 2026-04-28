/**
 * ソース PNG を中央クロップで正方形化し、ファビコン / ホーム画面用サイズを出力する。
 * 実行: node scripts/generate-app-icons.mjs
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const source = join(root, "public", "icons", "icon.png");
const outDir = join(root, "public", "icons");

async function squarePipeline() {
  const meta = await sharp(source).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const side = Math.min(w, h);
  const left = Math.floor((w - side) / 2);
  const top = Math.floor((h - side) / 2);
  return sharp(source).extract({ left, top, width: side, height: side });
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const base = await squarePipeline();

  await base.clone().resize(180, 180).png().toFile(join(root, "src", "app", "apple-icon.png"));
  await base.clone().resize(180, 180).png().toFile(join(outDir, "apple-touch-icon.png"));
  await base.clone().resize(32, 32).png().toFile(join(outDir, "favicon-32x32.png"));
  await base.clone().resize(192, 192).png().toFile(join(outDir, "icon-192.png"));
  await base.clone().resize(512, 512).png().toFile(join(outDir, "icon-512.png"));

  const png16 = await base.clone().resize(16, 16).png().toBuffer();
  const png32 = await base.clone().resize(32, 32).png().toBuffer();
  const png48 = await base.clone().resize(48, 48).png().toBuffer();
  const icoBuf = await pngToIco([png16, png32, png48]);
  await writeFile(join(root, "src", "app", "favicon.ico"), icoBuf);

  const maskInner = 410;
  const innerBuf = await base.clone().resize(maskInner, maskInner).png().toBuffer();
  const pad = Math.floor((512 - maskInner) / 2);
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 15, g: 118, b: 110, alpha: 1 },
    },
  })
    .composite([{ input: innerBuf, left: pad, top: pad }])
    .png()
    .toFile(join(outDir, "maskable-icon-512.png"));

  await base.clone().resize(512, 512).png().toFile(join(root, "src", "app", "icon.png"));

  console.log("Wrote app/favicon.ico, app/icon.png, app/apple-icon.png, public/icons/*");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
