// generate-icons.js
// Generiert PWA-Icons aus einem Emoji. Einmal ausführen mit:
// node generate-icons.js

import { createCanvas, registerFont } from "canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Konfiguration ───
const EMOJI = "📖";
const BG_COLOR = "#B8532E";  // Dein Akzent-Orange
const SIZES = [
  { size: 192, name: "pwa-192x192.png" },
  { size: 512, name: "pwa-512x512.png" },
  { size: 180, name: "apple-touch-icon.png" },  // iOS Home-Screen
];

const OUT_DIR = path.join(__dirname, "public");

// ─── Icon generieren ───
function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Hintergrund mit abgerundetem Rechteck (für maskable support)
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, size, size);

  // Emoji zentriert
  const fontSize = Math.floor(size * 0.62);
  ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(EMOJI, size / 2, size / 2 + size * 0.03);

  return canvas.toBuffer("image/png");
}

// ─── Ausführen ───
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

console.log(`Generiere Icons in ${OUT_DIR}…\n`);
for (const { size, name } of SIZES) {
  const buffer = generateIcon(size);
  const outPath = path.join(OUT_DIR, name);
  fs.writeFileSync(outPath, buffer);
  console.log(`  ✓ ${name} (${size}x${size}, ${(buffer.length / 1024).toFixed(1)} KB)`);
}
console.log(`\nFertig! 🎉`);
