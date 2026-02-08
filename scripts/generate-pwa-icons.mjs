/**
 * PWAアイコン生成スクリプト
 * app/icon.tsx / apple-icon.tsx と同じデザインで static PNG を生成
 * 
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// SVGテンプレート — app/icon.tsx, apple-icon.tsx と同一デザイン
function generateSvg(size) {
    const borderRadius = Math.round(size * 0.22);
    const innerSize = Math.round(size * 0.64);
    const innerRadius = Math.round(size * 0.13);
    const innerOffset = Math.round((size - innerSize) / 2);
    const glassHeight = Math.round(innerSize / 2);
    const boltSize = Math.round(size * 0.31);
    const boltOffset = Math.round((size - boltSize) / 2);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34D399"/>
      <stop offset="100%" stop-color="#A5F3FC"/>
    </linearGradient>
    <linearGradient id="inner" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366F1"/>
      <stop offset="50%" stop-color="#4F46E5"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="glassClip">
      <rect x="${innerOffset}" y="${innerOffset}" width="${innerSize}" height="${glassHeight}" rx="${innerRadius}"/>
    </clipPath>
  </defs>
  <!-- 外枠: グリーン→シアングラデーション -->
  <rect width="${size}" height="${size}" rx="${borderRadius}" fill="url(#bg)"/>
  <!-- 内側: インディゴグラデーション -->
  <rect x="${innerOffset}" y="${innerOffset}" width="${innerSize}" height="${innerSize}" rx="${innerRadius}" fill="url(#inner)"/>
  <!-- ガラス反射 -->
  <rect x="${innerOffset}" y="${innerOffset}" width="${innerSize}" height="${glassHeight}" rx="${innerRadius}" fill="url(#glass)" clip-path="url(#glassClip)"/>
  <!-- 稲妻アイコン -->
  <svg x="${boltOffset}" y="${boltOffset}" width="${boltSize}" height="${boltSize}" viewBox="0 0 24 24">
    <path d="M13.5 2.5L7 13h4.5L9 21.5l8.5-11h-4.5z" fill="white" stroke="white" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>
</svg>`;
}

// 生成するサイズ
const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
];

console.log('🎨 PWAアイコンを生成中...');

for (const { name, size } of sizes) {
    const svg = generateSvg(size);
    const outputPath = join(publicDir, name);

    // SVGも保存（192, 512のみ）
    if (size === 192 || size === 512) {
        const svgName = name.replace('.png', '.svg');
        writeFileSync(join(publicDir, svgName), svg);
        console.log(`  ✅ ${svgName} (${size}x${size})`);
    }

    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    console.log(`  ✅ ${name} (${size}x${size})`);
}

console.log('\n🎉 全アイコン生成完了！');
