import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { clampBannerOffsets, getBannerCropGeometry, getBannerCropPixels, getBannerScaleBounds,
    resizeBannerCropState, resolveBannerCropState, scaleBannerCropState,
    scaleBannerOffsets } from '@/lib/banner-crop-geometry';
const editorPath = fileURLToPath(new URL('../../components/BannerImageEditor.tsx', import.meta.url));
const SQUARE_IMAGE = { w: 1200, h: 1200 };
const VIEWPORT_WIDTHS = [320, 375, 639, 640, 767, 768, 1024, 1280];
function sourceCenter(width: number, x: number, y: number, scale: number): { x: number; y: number } {
    const ratio = SQUARE_IMAGE.w / (width * scale);
    return { x: (width / 2 - x) * ratio, y: (width / 5 - y) * ratio };
}
describe('banner crop geometry', () => {
    it('uses the current rendered width at every responsive boundary without initial fallback geometry', () => {
        expect(getBannerCropGeometry(0, true)).toEqual({ cropHeight: 0, bleed: 0, previewHeight: 0 });
        for (const width of VIEWPORT_WIDTHS) {
            const geometry = getBannerCropGeometry(width, true);
            expect(geometry.cropHeight).toBe(width / 2.5); expect(geometry.previewHeight).toBe(width);
        }
    });
    it('clamps offsets against the current width instead of stale geometry', () => {
        const input = { offsetX: 0, offsetY: -400, scale: 1, imageSize: SQUARE_IMAGE };
        expect(clampBannerOffsets({ ...input, containerWidth: 360 }).y).toBe(-216);
        expect(clampBannerOffsets({ ...input, containerWidth: 720 }).y).toBe(-400);
    });
    it('preserves the selected natural-image center through sequential resizes', () => {
        const initial = { x: -120, y: -80, scale: 2 };
        const expanded = resizeBannerCropState({ offsetX: initial.x, offsetY: initial.y, scale: initial.scale,
            imageSize: SQUARE_IMAGE, previousContainerWidth: 360, nextContainerWidth: 720 });
        const contracted = resizeBannerCropState({ offsetX: expanded.x, offsetY: expanded.y, scale: expanded.scale,
            imageSize: SQUARE_IMAGE, previousContainerWidth: 720, nextContainerWidth: 540 });
        expect(sourceCenter(720, expanded.x, expanded.y, expanded.scale))
            .toEqual(sourceCenter(360, initial.x, initial.y, initial.scale));
        expect(sourceCenter(540, contracted.x, contracted.y, contracted.scale))
            .toEqual(sourceCenter(360, initial.x, initial.y, initial.scale));
    });
    it('derives scale bounds from natural image dimensions and keeps the crop covered', () => {
        expect(getBannerScaleBounds({ w: 1200, h: 300 }, 360)).toEqual({ minScale: 1.6, maxScale: 3 });
        expect(getBannerScaleBounds({ w: 300, h: 1200 }, 360)).toEqual({ minScale: 1, maxScale: 3 });
        expect(getBannerScaleBounds({ w: 3000, h: 100 }, 360)).toEqual({ minScale: 12, maxScale: 12 });
        expect(resolveBannerCropState({ offsetX: 0, offsetY: 0, scale: 1,
            imageSize: { w: 1200, h: 300 }, containerWidth: 360 }).scale).toBe(1.6);
    });
    it('keeps zoom centered and prevents wheel-style zoom below the coverage minimum', () => {
        expect(scaleBannerOffsets({ offsetX: 0, offsetY: 0, scale: 1, nextScale: 2,
            imageSize: SQUARE_IMAGE, containerWidth: 720 })).toEqual({ x: -360, y: -144 });
        expect(scaleBannerCropState({ offsetX: 0, offsetY: 0, scale: 1.6, nextScale: 1,
            imageSize: { w: 1200, h: 300 }, containerWidth: 360 }).scale).toBe(1.6);
    });
    it('maps CSS crop geometry to natural pixels and device-pixel output without upscaling', () => {
        expect(getBannerCropPixels({ offsetX: 0, offsetY: 0, scale: 1, imageSize: SQUARE_IMAGE,
            containerWidth: 320, cropHeight: 128, devicePixelRatio: 2 })).toEqual({
            sourceX: 0, sourceY: 0, sourceWidth: 1200, sourceHeight: 480, outputWidth: 640, outputHeight: 256,
        });
        expect(getBannerCropPixels({ offsetX: -160, offsetY: -64, scale: 2, imageSize: SQUARE_IMAGE,
            containerWidth: 320, cropHeight: 128, devicePixelRatio: 3 })).toEqual({
            sourceX: 300, sourceY: 120, sourceWidth: 600, sourceHeight: 240, outputWidth: 600, outputHeight: 240,
        });
    });
    it('keeps observer, image-load, wheel, and responsive semantics explicit in the component', () => {
        const source = readFileSync(editorPath, 'utf8');
        for (const fragment of [
            'getBoundingClientRect().width', 'window.devicePixelRatio', 'img.naturalWidth',
            'loadGeneration !== imageLoadGenerationRef.current', "setStatusMessage(t('saveSuccess'))", 'data-dialog-live-region', 'new ResizeObserver',
            "container.addEventListener('wheel', handleNativeWheel, { passive: false })",
            "container.removeEventListener('wheel', handleNativeWheel)", "role={file ? 'application'",
            "'aspect-square touch-none", "'aspect-[5/2]'",
        ]) expect(source).toContain(fragment);
        expect(source).not.toContain('DEFAULT_CONTAINER_WIDTH');
        expect(source).not.toContain('w-screen');
        expect(source).not.toContain('onWheel={');
        expect(source.indexOf('const loadGeneration = ++imageLoadGenerationRef.current'))
            .toBeGreaterThan(source.indexOf('selectedFile.size > MAX_FILE_SIZE'));
    });
});
