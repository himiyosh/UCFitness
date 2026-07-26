const BANNER_ASPECT = 2.5;
const DEFAULT_MAX_SCALE = 3;
const MAX_OUTPUT_WIDTH = 1200;
interface BannerImageSize { w: number; h: number }
interface BannerCropGeometry { cropHeight: number; bleed: number; previewHeight: number }
interface BannerScaleBounds { minScale: number; maxScale: number }
interface BannerOffsets { x: number; y: number }
interface BannerCropInput {
    offsetX: number; offsetY: number; scale: number; imageSize: BannerImageSize | null;
    containerWidth: number; preferredMaxScale?: number;
}
interface BannerScaleInput extends BannerCropInput { nextScale: number }
interface BannerResizeInput extends Omit<BannerCropInput, 'containerWidth'> {
    previousContainerWidth: number; nextContainerWidth: number;
}
interface BannerCropState extends BannerOffsets, BannerScaleBounds { scale: number }
interface BannerCropPixelsInput extends BannerCropInput { cropHeight: number; devicePixelRatio: number }
interface BannerCropPixels {
    sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number;
    outputWidth: number; outputHeight: number;
}
function positive(value: number): number { return Number.isFinite(value) && value > 0 ? value : 0; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0)); }
function hasValidImageSize(imageSize: BannerImageSize | null): imageSize is BannerImageSize { return Boolean(imageSize && positive(imageSize.w) && positive(imageSize.h)); }
export function getBannerCropGeometry(containerWidth: number, editable: boolean): BannerCropGeometry {
    const cropHeight = positive(containerWidth) / BANNER_ASPECT;
    const bleed = editable ? cropHeight * 0.75 : 0;
    return { cropHeight, bleed, previewHeight: cropHeight + bleed * 2 };
}
export function getBannerScaleBounds(imageSize: BannerImageSize | null, containerWidth: number, preferredMaxScale: number = DEFAULT_MAX_SCALE): BannerScaleBounds {
    const fallbackMaxScale = Math.max(1, preferredMaxScale);
    if (!hasValidImageSize(imageSize) || positive(containerWidth) === 0) return { minScale: 1, maxScale: fallbackMaxScale };
    const { cropHeight } = getBannerCropGeometry(containerWidth, false);
    const baseHeight = (imageSize.h / imageSize.w) * containerWidth;
    const minScale = Math.max(1, cropHeight / baseHeight);
    return { minScale, maxScale: Math.max(fallbackMaxScale, minScale) };
}
export function resolveBannerCropState(input: BannerCropInput): BannerCropState {
    const width = positive(input.containerWidth);
    const bounds = getBannerScaleBounds(input.imageSize, width, input.preferredMaxScale);
    const scale = clamp(input.scale, bounds.minScale, bounds.maxScale);
    const { cropHeight } = getBannerCropGeometry(width, false);
    const baseHeight = hasValidImageSize(input.imageSize) ? (input.imageSize.h / input.imageSize.w) * width : cropHeight;
    return {
        x: clamp(input.offsetX, Math.min(0, width - width * scale), 0),
        y: clamp(input.offsetY, Math.min(0, cropHeight - baseHeight * scale), 0),
        scale,
        ...bounds,
    };
}
export function clampBannerOffsets(input: BannerCropInput): BannerOffsets {
    const { x, y } = resolveBannerCropState(input); return { x, y };
}
export function scaleBannerCropState(input: BannerScaleInput): BannerCropState {
    const current = resolveBannerCropState(input);
    const nextScale = clamp(input.nextScale, current.minScale, current.maxScale);
    const ratio = nextScale / current.scale;
    const { cropHeight } = getBannerCropGeometry(input.containerWidth, false);
    return resolveBannerCropState({
        ...input,
        offsetX: current.x * ratio - (input.containerWidth / 2) * (ratio - 1),
        offsetY: current.y * ratio - (cropHeight / 2) * (ratio - 1),
        scale: nextScale,
    });
}
export function scaleBannerOffsets(input: BannerScaleInput): BannerOffsets {
    const { x, y } = scaleBannerCropState(input); return { x, y };
}
export function resizeBannerCropState(input: BannerResizeInput): BannerCropState {
    const current = resolveBannerCropState({ ...input, containerWidth: input.previousContainerWidth });
    const ratio = positive(input.previousContainerWidth) ? positive(input.nextContainerWidth) / input.previousContainerWidth : 1;
    return resolveBannerCropState({
        ...input,
        offsetX: current.x * ratio,
        offsetY: current.y * ratio,
        scale: current.scale,
        containerWidth: input.nextContainerWidth,
    });
}
export function getBannerCropPixels(input: BannerCropPixelsInput): BannerCropPixels | null {
    const width = positive(input.containerWidth);
    const cropHeight = positive(input.cropHeight);
    if (!hasValidImageSize(input.imageSize) || width === 0 || cropHeight === 0) return null;
    const current = resolveBannerCropState(input);
    const sourceRatio = input.imageSize.w / (width * current.scale);
    const sourceWidth = width * sourceRatio;
    const sourceHeight = cropHeight * sourceRatio;
    const dpr = positive(input.devicePixelRatio) || 1;
    const outputWidth = Math.max(1, Math.min(
        MAX_OUTPUT_WIDTH, Math.floor(sourceWidth), Math.round(width * dpr),
    ));
    return {
        sourceX: clamp(-current.x * sourceRatio, 0, input.imageSize.w - sourceWidth),
        sourceY: clamp(-current.y * sourceRatio, 0, input.imageSize.h - sourceHeight),
        sourceWidth,
        sourceHeight,
        outputWidth,
        outputHeight: Math.max(1, Math.round(outputWidth / BANNER_ASPECT)),
    };
}
