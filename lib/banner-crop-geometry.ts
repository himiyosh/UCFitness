const BANNER_ASPECT = 2.5;
const DEFAULT_MAX_SCALE = 3;

interface BannerImageSize {
    w: number;
    h: number;
}

interface BannerCropGeometry {
    cropHeight: number;
    bleed: number;
    previewHeight: number;
}

interface BannerScaleBounds {
    minScale: number;
    maxScale: number;
}

interface ClampBannerOffsetsOptions {
    offsetX: number;
    offsetY: number;
    scale: number;
    imageSize: BannerImageSize | null;
    containerWidth: number;
    preferredMaxScale?: number;
}

interface ScaleBannerOffsetsOptions extends ClampBannerOffsetsOptions {
    nextScale: number;
}

interface ResizeBannerCropOptions {
    offsetX: number;
    offsetY: number;
    scale: number;
    imageSize: BannerImageSize | null;
    previousContainerWidth: number;
    nextContainerWidth: number;
    preferredMaxScale?: number;
}

interface BannerOffsets {
    x: number;
    y: number;
}

interface BannerCropState extends BannerOffsets, BannerScaleBounds {
    scale: number;
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

export function getBannerScaleBounds(
    imageSize: BannerImageSize | null,
    containerWidth: number,
    preferredMaxScale: number = DEFAULT_MAX_SCALE,
): BannerScaleBounds {
    const fallbackMaxScale = Math.max(1, preferredMaxScale);
    if (!imageSize || imageSize.w <= 0 || imageSize.h <= 0 || containerWidth <= 0) {
        return { minScale: 1, maxScale: fallbackMaxScale };
    }

    const { cropHeight } = getBannerCropGeometry(containerWidth, false);
    const baseHeight = (imageSize.h / imageSize.w) * containerWidth;
    const minScale = Math.max(1, cropHeight / baseHeight);

    return {
        minScale,
        maxScale: Math.max(fallbackMaxScale, minScale),
    };
}

export function resolveBannerCropState({
    offsetX,
    offsetY,
    scale,
    imageSize,
    containerWidth,
    preferredMaxScale = DEFAULT_MAX_SCALE,
}: ClampBannerOffsetsOptions): BannerCropState {
    const { cropHeight } = getBannerCropGeometry(containerWidth, false);
    const bounds = getBannerScaleBounds(imageSize, containerWidth, preferredMaxScale);
    const effectiveScale = Math.max(bounds.minScale, Math.min(bounds.maxScale, scale));
    const displayWidth = containerWidth * effectiveScale;
    const baseHeight = imageSize
        ? (imageSize.h / imageSize.w) * containerWidth
        : cropHeight;
    const displayHeight = baseHeight * effectiveScale;
    const minX = Math.min(0, containerWidth - displayWidth);
    const minY = Math.min(0, cropHeight - displayHeight);

    return {
        x: Math.max(minX, Math.min(0, offsetX)),
        y: Math.max(minY, Math.min(0, offsetY)),
        scale: effectiveScale,
        ...bounds,
    };
}

export function clampBannerOffsets(options: ClampBannerOffsetsOptions): BannerOffsets {
    const { x, y } = resolveBannerCropState(options);
    return { x, y };
}

export function scaleBannerCropState({
    offsetX,
    offsetY,
    scale,
    nextScale,
    imageSize,
    containerWidth,
    preferredMaxScale = DEFAULT_MAX_SCALE,
}: ScaleBannerOffsetsOptions): BannerCropState {
    const current = resolveBannerCropState({
        offsetX,
        offsetY,
        scale,
        imageSize,
        containerWidth,
        preferredMaxScale,
    });
    const bounds = getBannerScaleBounds(imageSize, containerWidth, preferredMaxScale);
    const effectiveNextScale = Math.max(bounds.minScale, Math.min(bounds.maxScale, nextScale));
    const { cropHeight } = getBannerCropGeometry(containerWidth, false);
    const ratio = effectiveNextScale / current.scale;
    const nextOffsetX = current.x * ratio - (containerWidth / 2) * (ratio - 1);
    const nextOffsetY = current.y * ratio - (cropHeight / 2) * (ratio - 1);

    return resolveBannerCropState({
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
        scale: effectiveNextScale,
        imageSize,
        containerWidth,
        preferredMaxScale,
    });
}

export function scaleBannerOffsets(options: ScaleBannerOffsetsOptions): BannerOffsets {
    const { x, y } = scaleBannerCropState(options);
    return { x, y };
}

export function resizeBannerCropState({
    offsetX,
    offsetY,
    scale,
    imageSize,
    previousContainerWidth,
    nextContainerWidth,
    preferredMaxScale = DEFAULT_MAX_SCALE,
}: ResizeBannerCropOptions): BannerCropState {
    const current = resolveBannerCropState({
        offsetX,
        offsetY,
        scale,
        imageSize,
        containerWidth: previousContainerWidth,
        preferredMaxScale,
    });
    const resizeRatio = previousContainerWidth > 0
        ? nextContainerWidth / previousContainerWidth
        : 1;

    return resolveBannerCropState({
        offsetX: current.x * resizeRatio,
        offsetY: current.y * resizeRatio,
        scale: current.scale,
        imageSize,
        containerWidth: nextContainerWidth,
        preferredMaxScale,
    });
}
