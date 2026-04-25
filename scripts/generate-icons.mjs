import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/icons');
await fs.mkdir(OUT, { recursive: true });

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${size * 0.04}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#0a0a0b"/>
  <rect x="${size * 0.08}" y="${size * 0.08}" width="${size * 0.84}" height="${size * 0.84}" rx="${size * 0.18}" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, system-ui, 'Segoe UI', Helvetica, sans-serif"
        font-size="${size * 0.62}" font-weight="800" fill="white"
        filter="url(#glow)">₮</text>
</svg>`;

const sizes = [
  { size: 16, name: 'icon-16.png' },
  { size: 32, name: 'icon-32.png' },
  { size: 64, name: 'icon-64.png' },
  { size: 128, name: 'icon-128.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 256, name: 'icon-256.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 1024, name: 'icon-1024.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

for (const { size, name } of sizes) {
  const buf = Buffer.from(svg(size));
  await sharp(buf).png().toFile(path.join(OUT, name));
  console.log('✓', name);
}

await fs.writeFile(path.join(OUT, 'icon.svg'), svg(512));
console.log('✓ icon.svg');

// Favicon (multi-size .ico via 32 alone — most browsers accept it)
await sharp(Buffer.from(svg(32))).png().toFile(path.resolve('public/favicon.png'));
console.log('✓ public/favicon.png');
