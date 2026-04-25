import sharp from 'sharp';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const ROOT = path.resolve(process.cwd(), 'android/app/src/main/res');

// Splash в стиле welcome-экрана: тёмный фон + светящийся ₮ по центру.
const splashSvg = (w, h) => {
  const size = Math.min(w, h);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#1a1330"/>
      <stop offset="100%" stop-color="#0a0a0b"/>
    </radialGradient>
    <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${size * 0.05}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <g transform="translate(${w / 2} ${h / 2})">
    <rect x="${-size * 0.12}" y="${-size * 0.12}" width="${size * 0.24}" height="${size * 0.24}" rx="${size * 0.05}" fill="url(#logo)" filter="url(#glow)"/>
    <text x="0" y="0" text-anchor="middle" dominant-baseline="central"
          font-family="-apple-system, system-ui, sans-serif"
          font-size="${size * 0.16}" font-weight="800" fill="white" filter="url(#glow)">₮</text>
  </g>
</svg>`;
};

// Каждое из drawable-* ожидается в своём размере.
// Подбираем большой и масштабируем.
const TARGETS = [
  { dir: 'drawable', w: 480, h: 320 },
  { dir: 'drawable-port-mdpi', w: 320, h: 480 },
  { dir: 'drawable-port-hdpi', w: 480, h: 800 },
  { dir: 'drawable-port-xhdpi', w: 720, h: 1280 },
  { dir: 'drawable-port-xxhdpi', w: 960, h: 1600 },
  { dir: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
  { dir: 'drawable-land-mdpi', w: 480, h: 320 },
  { dir: 'drawable-land-hdpi', w: 800, h: 480 },
  { dir: 'drawable-land-xhdpi', w: 1280, h: 720 },
  { dir: 'drawable-land-xxhdpi', w: 1600, h: 960 },
  { dir: 'drawable-land-xxxhdpi', w: 1920, h: 1280 },
];

for (const { dir, w, h } of TARGETS) {
  const target = path.join(ROOT, dir);
  await fs.mkdir(target, { recursive: true });
  await sharp(Buffer.from(splashSvg(w, h)))
    .png()
    .toFile(path.join(target, 'splash.png'));
  console.log(`✓ ${dir} (${w}x${h})`);
}
console.log('done');
