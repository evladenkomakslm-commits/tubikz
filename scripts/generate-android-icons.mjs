// Генерирует все Android launcher-иконки (mipmap-*) в проекте android/.
// Запуск: node scripts/generate-android-icons.mjs
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'android/app/src/main/res');

// Размеры по плотностям (Android docs).
const DENSITIES = [
  { name: 'mdpi', size: 48, foreground: 108 },
  { name: 'hdpi', size: 72, foreground: 162 },
  { name: 'xhdpi', size: 96, foreground: 216 },
  { name: 'xxhdpi', size: 144, foreground: 324 },
  { name: 'xxxhdpi', size: 192, foreground: 432 },
];

const launcherSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#0a0a0b"/>
  <rect x="${size * 0.08}" y="${size * 0.08}" width="${size * 0.84}" height="${size * 0.84}" rx="${size * 0.18}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
        font-size="${size * 0.62}" font-weight="800" fill="white">₮</text>
</svg>`;

const roundSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
        font-size="${size * 0.62}" font-weight="800" fill="white">₮</text>
</svg>`;

// Foreground для adaptive icon — должен иметь "safe zone" (центр 72%).
const foregroundSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
        font-size="${size * 0.45}" font-weight="800" fill="url(#g)">₮</text>
</svg>`;

for (const { name, size, foreground } of DENSITIES) {
  const dir = path.join(ROOT, `mipmap-${name}`);
  await fs.mkdir(dir, { recursive: true });
  await sharp(Buffer.from(launcherSvg(size)))
    .png()
    .toFile(path.join(dir, 'ic_launcher.png'));
  await sharp(Buffer.from(roundSvg(size)))
    .png()
    .toFile(path.join(dir, 'ic_launcher_round.png'));
  await sharp(Buffer.from(foregroundSvg(foreground)))
    .png()
    .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  console.log(`✓ ${name}`);
}
console.log('done');
