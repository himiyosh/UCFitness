import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
    clampBannerOffsets,
    getBannerCropGeometry,
    getBannerScaleBounds,
    resizeBannerCropState,
    resolveBannerCropState,
    scaleBannerCropState,
    scaleBannerOffsets,
} from "@/lib/banner-crop-geometry";

const editorSourcePath = fileURLToPath(new URL("../../components/BannerImageEditor.tsx", import.meta.url));
const SQUARE_IMAGE = { w: 800, h: 800 };

function getSourceCenter(
    containerWidth: number,
    offsetX: number,
    offsetY: number,
    scale: number,
    imageSize: { w: number; h: number },
): { x: number; y: number } {
    const { cropHeight } = getBannerCropGeometry(containerWidth, false);
    const sourcePixelsPerDisplayPixel = imageSize.w / (containerWidth * scale);
    return {
        x: (containerWidth / 2 - offsetX) * sourcePixelsPerDisplayPixel,
        y: (cropHeight / 2 - offsetY) * sourcePixelsPerDisplayPixel,
    };
}

describe("banner crop geometry", () => {
    it("derives the crop and bleed dimensions from the current container width", () => {
        expect(getBannerCropGeometry(360, true)).toEqual({
            cropHeight: 144,
            bleed: 108,
            previewHeight: 360,
        });
        expect(getBannerCropGeometry(720, true)).toEqual({
            cropHeight: 288,
            bleed: 216,
            previewHeight: 720,
        });
    });

    it("clamps against resized geometry instead of a stale crop height", () => {
        const beforeResize = clampBannerOffsets({
            offsetX: 0,
            offsetY: -400,
            scale: 1,
            imageSize: SQUARE_IMAGE,
            containerWidth: 360,
        });
        const afterResize = clampBannerOffsets({
            offsetX: 0,
            offsetY: -400,
            scale: 1,
            imageSize: SQUARE_IMAGE,
            containerWidth: 720,
        });

        expect(beforeResize.y).toBe(-216);
        expect(afterResize.y).toBe(-400);
    });

    it("preserves the selected source center through sequential resizes", () => {
        const initial = { x: -120, y: -80, scale: 2 };
        const initialCenter = getSourceCenter(360, initial.x, initial.y, initial.scale, SQUARE_IMAGE);
        const expanded = resizeBannerCropState({
            offsetX: initial.x,
            offsetY: initial.y,
            scale: initial.scale,
            imageSize: SQUARE_IMAGE,
            previousContainerWidth: 360,
            nextContainerWidth: 720,
        });
        const contracted = resizeBannerCropState({
            offsetX: expanded.x,
            offsetY: expanded.y,
            scale: expanded.scale,
            imageSize: SQUARE_IMAGE,
            previousContainerWidth: 720,
            nextContainerWidth: 540,
        });

        const expandedCenter = getSourceCenter(720, expanded.x, expanded.y, expanded.scale, SQUARE_IMAGE);
        const contractedCenter = getSourceCenter(540, contracted.x, contracted.y, contracted.scale, SQUARE_IMAGE);
        expect(expandedCenter.x).toBeCloseTo(initialCenter.x);
        expect(expandedCenter.y).toBeCloseTo(initialCenter.y);
        expect(contractedCenter.x).toBeCloseTo(initialCenter.x);
        expect(contractedCenter.y).toBeCloseTo(initialCenter.y);
    });

    it("applies the coverage minimum while resizing a stale scale", () => {
        const resized = resizeBannerCropState({
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            imageSize: { w: 1200, h: 300 },
            previousContainerWidth: 360,
            nextContainerWidth: 720,
        });

        expect(resized.scale).toBe(1.6);
        expect(resized.y).toBe(0);
    });

    it("raises the minimum scale for a recommended 1200 by 300 banner", () => {
        expect(getBannerScaleBounds({ w: 1200, h: 300 }, 360)).toEqual({
            minScale: 1.6,
            maxScale: 3,
        });
        expect(resolveBannerCropState({
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            imageSize: { w: 1200, h: 300 },
            containerWidth: 360,
        }).scale).toBe(1.6);
    });

    it("keeps the default minimum scale for portrait images", () => {
        expect(getBannerScaleBounds({ w: 300, h: 1200 }, 360)).toEqual({
            minScale: 1,
            maxScale: 3,
        });
    });

    it("expands the effective maximum for extreme landscape images", () => {
        const bounds = getBannerScaleBounds({ w: 3000, h: 100 }, 360);
        expect(bounds).toEqual({ minScale: 12, maxScale: 12 });
        expect(resolveBannerCropState({
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            imageSize: { w: 3000, h: 100 },
            containerWidth: 360,
        }).scale).toBe(12);
    });

    it("keeps zoom centered on the current crop after a resize", () => {
        expect(scaleBannerOffsets({
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            nextScale: 2,
            imageSize: SQUARE_IMAGE,
            containerWidth: 720,
        })).toEqual({ x: -360, y: -144 });
    });

    it("does not let wheel-style zoom fall below the image coverage minimum", () => {
        expect(scaleBannerCropState({
            offsetX: 0,
            offsetY: 0,
            scale: 1.6,
            nextScale: 1,
            imageSize: { w: 1200, h: 300 },
            containerWidth: 360,
        }).scale).toBe(1.6);
    });

    it("uses a non-passive native wheel listener only on the crop container", () => {
        const source = readFileSync(editorSourcePath, "utf8");
        expect(source).toContain(`container.addEventListener("wheel", handleNativeWheel, { passive: false })`);
        expect(source).toContain(`container.removeEventListener("wheel", handleNativeWheel)`);
        expect(source).toContain("const current = latestCropRef.current");
        expect(source).toContain("event.preventDefault()");
        expect(source).toContain("onPointerCancel={handlePointerUp}");
        expect(source).toContain("touch-none cursor-grab");
        expect(source).not.toContain("onWheel={");
        expect(source).not.toContain(`dialogRef.current?.addEventListener("wheel"`);
    });
});
