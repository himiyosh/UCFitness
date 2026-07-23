import { describe, expect, it } from "vitest";

import {
    clampBannerOffsets,
    getBannerCropGeometry,
    scaleBannerOffsets,
} from "@/lib/banner-crop-geometry";

const SQUARE_IMAGE = { w: 800, h: 800 };

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
});
