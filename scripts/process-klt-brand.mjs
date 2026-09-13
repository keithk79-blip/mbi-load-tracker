/**
 * Copy the Keith's Load Tracker mark into app + icon slots.
 * Static PNG only — do not encode or loop MP4/GIF in the header.
 *
 *   node scripts/process-klt-brand.mjs
 *   npx tauri icon public/brand/klt-icon-1024.png --output src-tauri/icons --ios-color "#ffffff"
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "public/brand/klt-logo-source.png");
const brandDir = path.join(root, "public/brand");
const assetsDir = path.join(root, "src/assets");

await mkdir(brandDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

const trimmed = await sharp(source)
  .trim({ threshold: 12 })
  .png()
  .toBuffer();

const uiLogo = path.join(brandDir, "klt-logo.png");
const assetLogo = path.join(assetsDir, "klt-logo.png");
await sharp(trimmed).png().toFile(uiLogo);
await sharp(trimmed).png().toFile(assetLogo);

const fitted = await sharp(trimmed)
  .resize({ width: 860, height: 860, fit: "inside" })
  .png()
  .toBuffer();

const icon1024 = path.join(brandDir, "klt-icon-1024.png");
await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .composite([{ input: fitted, gravity: "center" }])
  .png()
  .toFile(icon1024);

for (const [size, dest] of [
  [32, path.join(root, "public/favicon-32.png")],
  [180, path.join(root, "public/apple-touch-icon.png")],
  [192, path.join(root, "public/pwa-192.png")],
  [512, path.join(root, "public/pwa-512.png")],
]) {
  await sharp(icon1024).resize(size, size).png().toFile(dest);
}

console.log("Wrote Keith's Load Tracker logo copies and white-padded icons.");
console.log("Next: npx tauri icon public/brand/klt-icon-1024.png --output src-tauri/icons");
