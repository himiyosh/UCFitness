const BANNER_ASPECT = 2.5;

interface BannerImageSize {
    w: number;
    h: number;
}

interface BannerCropGeometry {
    cropHeight: number;
    bleed: number;
    previewHeight: number;
}

interface ClampBannerOffsetsOptions {
    offsetX: number;
    offsetY: number;
    scale: number;
    imageSize: BannerImageSize | null;
    containerWidth: number;
}

interface ScaleBannerOffsetsOptions extends ClampBannerOffsetsOptions {
    nextScale: number;
}

interface BannerOffsets {
    x: number;
    y: number;
}

export function getBannerCropGeometry(
    containerWidth: number,
    hasEditableImage: boolean,
): BannerCropGeometry {
    const cropHeight = containerWidth / BANNER_ASPECT;
    const bleed = hasEditableImage ? Math.round(cropHeight * 0.75) : 0;

    return {
        cropHeight,
        bleed,
        previewHeight: cropHeight + bleed * 2,
    };
}

export function clampBannerOffsets({
    offsetX,
    offsetY,
    scale,
    imageSize,
    containerWidth,
}: ClampBannerOffsetsOptions): BannerOffsets {
    const { cropHeight } = getBannerCropGeometry(containerWidth, false);
    const displayWidth = containerWidth * scale;
    const baseHeight = imageSize
        ? (imageSize.h / imageSize.w) * containerWidth
        : cropHeight;
    const displayHeight = baseHeight * scale;
    const minX = Math.min(0, containerWidth - displayWidth);
    const minY = Math.min(0, cropHeight - displayHeight);

    return {
        x: Math.max(minX, Math.min(0, offsetX)),
        y: Math.max(minY, Math.min(0, offsetY)),
    };
}

export function scaleBannerOffsets({
    offsetX,
    offsetY,
    scale,
    nextScale,
    imageSize,
    containerWidth,
}: ScaleBannerOffsetsOptions): BannerOffsets {
    const { cropHeight } = getBannerCropGeometry(containerWidth, false);
    const ratio = nextScale / scale;
    const nextOffsetX = offsetX * ratio - (containerWidth / 2) * (ratio - 1);
    const nextOffsetY = offsetY * ratio - (cropHeight / 2) * (ratio - 1);

    return clampBannerOffsets({
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
        scale: nextScale,
        imageSize,
        containerWidth,
    });
}
