import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const manifestPath = join(process.cwd(), 'public/manifest.json');
const parsedManifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (
    typeof parsedManifest !== 'object'
    || parsedManifest === null
    || Array.isArray(parsedManifest)
) {
    throw new TypeError('public/manifest.json must contain a JSON object');
}

const manifestValue = (key: string): unknown => Reflect.get(parsedManifest, key);

describe('PWA manifest', () => {
    it('公開ファイルを解析した場合、安定したidentityとカテゴリを保持する', () => {
        expect(manifestValue('id')).toBe('/');
        expect(manifestValue('scope')).toBe('/');
        expect(manifestValue('start_url')).toBe('/');
        expect(manifestValue('categories')).toEqual(['fitness', 'health', 'lifestyle']);
    });

    it('既存installability metadataを解析した場合、表示・色・アイコンを維持する', () => {
        expect(manifestValue('display')).toBe('standalone');
        expect(manifestValue('background_color')).toBe('#1e1b4b');
        expect(manifestValue('theme_color')).toBe('#6366f1');
        expect(manifestValue('icons')).toEqual([
            {
                src: '/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
            {
                src: '/apple-touch-icon.png',
                sizes: '180x180',
                type: 'image/png',
            },
            {
                src: '/icon-192.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
            },
            {
                src: '/icon-512.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
            },
        ]);
    });
});
