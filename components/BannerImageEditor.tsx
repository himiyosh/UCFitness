'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useDialogFocus } from '@/hooks/useDialogFocus';
import { compressImage } from '@/lib/image-utils';

interface BannerImageEditorProps {
    currentBanner: string | null;
    children?: React.ReactNode;
}

// バナーのアスペクト比（2.5:1 — 設定画面・プロフィールカード(PC)に近い）
const BANNER_ASPECT = 2.5;
const MIN_SCALE = 1;
const MAX_SCALE = 3;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function BannerImageEditor({ currentBanner, children }: BannerImageEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentBanner || null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const t = useTranslations('BannerEditor');

    // クロップ用 state
    const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number; startOffsetX: number; startOffsetY: number }>({ x: 0, y: 0, startOffsetX: 0, startOffsetY: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const handleClose = useCallback(() => {
        setIsOpen(false);
        setFile(null);
        setError(null);
    }, []);

    useDialogFocus({
        isOpen,
        onClose: handleClose,
        dialogRef,
        initialFocusRef: closeButtonRef,
    });

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];

            // Validate file type
            if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
                setError(t('invalidType'));
                e.target.value = '';
                return;
            }

            // Validate file size
            if (selectedFile.size > MAX_FILE_SIZE) {
                setError(t('fileTooLarge', { size: MAX_FILE_SIZE_MB }));
                e.target.value = '';
                return;
            }

            setError(null);

            // Revoke previous object URL to prevent memory leaks
            if (previewUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
            }

            setFile(selectedFile);
            const url = URL.createObjectURL(selectedFile);
            setPreviewUrl(url);

            const img = new Image();
            img.onload = () => {
                setImageSize({ w: img.width, h: img.height });
                setOffsetX(0);
                setOffsetY(0);
                setScale(1);
            };
            img.src = url;
        }
    }, [previewUrl, t]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            if (previewUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    // プレビュー領域のサイズ計算
    const getContainerWidth = () => containerRef.current?.clientWidth || 360;
    const getCropHeight = () => getContainerWidth() / BANNER_ASPECT;
    // クロップ枠の上下に表示するブリード領域
    const getBleed = () => {
        if (!file || !imageSize) return 0;
        return Math.round(getCropHeight() * 0.75);
    };
    const getPreviewHeight = () => getCropHeight() + getBleed() * 2;

    // オフセット範囲を制限（transform 基準: 画像はコンテナ幅で描画 → scale で拡大）
    const clampOffsets = useCallback((ox: number, oy: number, s?: number) => {
        const currentScale = s ?? scale;
        const cw = getContainerWidth();
        const ch = getCropHeight();
        // transform 後の画像サイズ
        const dw = cw * currentScale;
        const baseH = imageSize ? (imageSize.h / imageSize.w) * cw : ch;
        const dh = baseH * currentScale;

        const minX = Math.min(0, cw - dw);
        const minY = Math.min(0, ch - dh);
        return {
            x: Math.max(minX, Math.min(0, ox)),
            y: Math.max(minY, Math.min(0, oy)),
        };
    }, [scale, imageSize]);

    // ドラッグ開始
    const handlePointerDown = (e: React.PointerEvent) => {
        if (!file) return;
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY, startOffsetX: offsetX, startOffsetY: offsetY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    // ドラッグ中
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const clamped = clampOffsets(
            dragStartRef.current.startOffsetX + dx,
            dragStartRef.current.startOffsetY + dy,
        );
        setOffsetX(clamped.x);
        setOffsetY(clamped.y);
    };

    // ドラッグ終了
    const handlePointerUp = () => {
        setIsDragging(false);
    };

    const handleCropKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!file || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            return;
        }
        event.preventDefault();
        const step = event.shiftKey ? 25 : 10;
        const nextX = event.key === 'ArrowLeft'
            ? offsetX - step
            : event.key === 'ArrowRight'
                ? offsetX + step
                : offsetX;
        const nextY = event.key === 'ArrowUp'
            ? offsetY - step
            : event.key === 'ArrowDown'
                ? offsetY + step
                : offsetY;
        const clamped = clampOffsets(nextX, nextY);
        setOffsetX(clamped.x);
        setOffsetY(clamped.y);
    }, [clampOffsets, file, offsetX, offsetY]);

    // ホイールでズーム
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!file) return;
        e.preventDefault();
        const delta = -e.deltaY * 0.002;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta));

        // ズーム中心をコンテナ中心に合わせてオフセット補正
        const cw = getContainerWidth();
        const ch = getCropHeight();
        const ratio = newScale / scale;
        const newOx = offsetX * ratio - (cw / 2) * (ratio - 1);
        const newOy = offsetY * ratio - (ch / 2) * (ratio - 1);
        const clamped = clampOffsets(newOx, newOy, newScale);

        setScale(newScale);
        setOffsetX(clamped.x);
        setOffsetY(clamped.y);
    }, [file, scale, offsetX, offsetY, clampOffsets]);

    // スライダーでズーム
    const handleScaleChange = (newScale: number) => {
        const cw = getContainerWidth();
        const ch = getCropHeight();
        const ratio = newScale / scale;
        const newOx = offsetX * ratio - (cw / 2) * (ratio - 1);
        const newOy = offsetY * ratio - (ch / 2) * (ratio - 1);
        const clamped = clampOffsets(newOx, newOy, newScale);

        setScale(newScale);
        setOffsetX(clamped.x);
        setOffsetY(clamped.y);
    };

    // クロップしてから保存
    const handleSave = async () => {
        if (!file || !imageSize) return;
        setIsLoading(true);
        try {
            const croppedFile = await cropBanner(file, imageSize, offsetX, offsetY, scale, getContainerWidth(), getCropHeight());
            const compressedFile = await compressImage(croppedFile, 1200, 0.8);

            const formData = new FormData();
            formData.append('file', compressedFile);

            const res = await fetch('/api/user/banner', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                throw new Error('Failed to upload banner');
            }

            setIsOpen(false);
            setFile(null);
            router.refresh();
        } catch (_) {
            setError(t('uploadFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {children ? (
                <div onClick={() => setIsOpen(true)}>{children}</div>
            ) : (
                <button
                    onClick={() => setIsOpen(true)}
                    className="inline-flex min-h-[44px] items-center text-sm font-medium text-[var(--theme-primary)] hover:underline"
                >
                    {t('changeBanner')}
                </button>
            )}

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={handleClose} aria-hidden="true" />
                    <div ref={dialogRef} className="relative max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="banner-editor-title" tabIndex={-1}>
                        <button
                            ref={closeButtonRef}
                            onClick={handleClose}
                            className="absolute right-2 top-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 sm:right-4 sm:top-4"
                            aria-label={t('close')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h3 id="banner-editor-title" className="mb-4 pr-12 text-xl font-bold text-gray-900">{t('editTitle')}</h3>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="banner-file-input" className="block text-sm font-medium text-gray-700 mb-1">{t('uploadLabel')}</label>
                                <input
                                    id="banner-file-input"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="block w-full text-sm text-gray-500
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-md file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-[var(--theme-primary-light)] file:text-[var(--theme-primary)]
                                        hover:file:bg-[var(--theme-primary-light)]"
                                />
                                <p className="text-xs text-gray-600 mt-1">{t('recommendedSize', { size: MAX_FILE_SIZE_MB })}</p>
                                {error && (
                                    <p className="text-xs text-red-500 mt-1 font-medium" role="alert">{error}</p>
                                )}
                            </div>

                            {/* クロップ可能なプレビュー領域 */}
                            <div className="rounded-lg overflow-hidden bg-gray-900">
                                {previewUrl ? (
                                    <div
                                        ref={containerRef}
                                        className={`relative w-full overflow-hidden select-none ${file ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                        style={{ height: `${file ? getPreviewHeight() : getCropHeight()}px` }}
                                        onPointerDown={handlePointerDown}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                        onPointerCancel={handlePointerUp}
                                        onWheel={handleWheel}
                                        onKeyDown={handleCropKeyDown}
                                        role={file ? 'application' : undefined}
                                        tabIndex={file ? 0 : -1}
                                        aria-label={file ? t('cropArea') : undefined}
                                        aria-describedby={file ? 'banner-crop-keyboard-hint' : undefined}
                                    >
                                        {/* 画像 — background-image でオーバーレイと同じ座標系に配置 */}
                                        {file && imageSize ? (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    backgroundImage: `url(${previewUrl})`,
                                                    backgroundSize: `${getContainerWidth() * scale}px auto`,
                                                    backgroundPosition: `${offsetX}px ${offsetY + getBleed()}px`,
                                                    backgroundRepeat: 'no-repeat',
                                                }}
                                            />
                                        ) : (
                                            <img
                                                src={previewUrl}
                                                alt={t('previewAlt')}
                                                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                                                draggable={false}
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                        )}

                                        {/* クロップ領域外オーバーレイ（上） */}
                                        {file && getBleed() > 0 && (
                                            <>
                                                <div
                                                    className="absolute top-0 left-0 right-0 bg-black/50 pointer-events-none z-10 flex items-center justify-center"
                                                    style={{ height: `${getBleed()}px` }}
                                                >
                                                    <span className="text-white/60 text-xs font-medium tracking-wide">{t('bleedHint')}</span>
                                                </div>

                                                {/* クロップ領域外オーバーレイ（下） */}
                                                <div
                                                    className="absolute bottom-0 left-0 right-0 bg-black/50 pointer-events-none z-10 flex items-center justify-center"
                                                    style={{ height: `${getBleed()}px` }}
                                                >
                                                    <span className="text-white/60 text-xs font-medium tracking-wide">{t('bleedHint')}</span>
                                                </div>

                                                {/* クロップ枠 */}
                                                <div
                                                    className="absolute left-0 right-0 pointer-events-none z-10"
                                                    style={{ top: `${getBleed()}px`, height: `${getCropHeight()}px` }}
                                                >
                                                    <div className="absolute inset-0 border-2 border-dashed border-white/70 rounded-sm" />
                                                    <span className="absolute top-1 left-2 text-white/80 text-xs font-bold drop-shadow bg-black/30 px-1.5 py-0.5 rounded">{t('cropArea')}</span>
                                                </div>
                                            </>
                                        )}

                                        {/* ドラッグヒント */}
                                        {file && (
                                            <div
                                                className="absolute left-0 right-0 bg-gradient-to-t from-black/50 to-transparent py-2 text-center pointer-events-none z-20"
                                                style={{ top: `${getBleed() + getCropHeight() - 28}px`, height: '28px' }}
                                            >
                                                <span className="text-white text-xs font-medium drop-shadow flex items-center justify-center gap-1">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                                                    {t('cropKeyboardHint')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-full flex items-center justify-center text-gray-400" style={{ height: `${getCropHeight()}px` }}>
                                        {t('noImage')}
                                    </div>
                                )}
                            </div>

                            {/* ズームスライダー */}
                            {file && (
                                <div className="flex items-center gap-3 px-1">
                                    <span id="banner-crop-keyboard-hint" className="sr-only">{t('cropKeyboardHint')}</span>
                                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                                    </svg>
                                    <input
                                        type="range"
                                        min={MIN_SCALE}
                                        max={MAX_SCALE}
                                        step={0.01}
                                        value={scale}
                                        onChange={(e) => handleScaleChange(Number(e.target.value))}
                                        className="flex-1 h-1.5 accent-[var(--theme-primary)] cursor-pointer"
                                        aria-label={t('zoomLabel')}
                                    />
                                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                                    </svg>
                                    <span className="text-xs text-gray-500 w-10 text-right tabular-nums">{Math.round(scale * 100)}%</span>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2 justify-end">
                                <button
                                    onClick={handleClose}
                                    className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading || !file}
                                    className="px-4 py-2 text-sm font-medium text-white bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? t('saving') : t('save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

/**
 * クロップ処理 — 表示オフセット＋スケールから実際の画像ピクセルを切り出す
 */
function cropBanner(
    file: File,
    imageSize: { w: number; h: number },
    offsetX: number,
    offsetY: number,
    scale: number,
    containerWidth: number,
    containerHeight: number,
): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                // 表示上の画像幅 = containerWidth * scale だから
                // 表示1px = img.width / (containerWidth * scale) 元画像ピクセル
                const pxPerDisplayPx = img.width / (containerWidth * scale);

                const sx = Math.round(-offsetX * pxPerDisplayPx);
                const sy = Math.round(-offsetY * pxPerDisplayPx);
                const sw = Math.round(containerWidth * pxPerDisplayPx);
                const sh = Math.round(containerHeight * pxPerDisplayPx);

                const canvas = document.createElement('canvas');
                canvas.width = sw;
                canvas.height = sh;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error('No canvas ctx')); return; }

                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

                canvas.toBlob((blob) => {
                    if (!blob) { reject(new Error('Crop failed')); return; }
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.92);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}
