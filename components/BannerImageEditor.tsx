'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { compressImage } from '@/lib/image-utils';

interface BannerImageEditorProps {
    currentBanner: string | null;
    children?: React.ReactNode;
}

// バナーのアスペクト比（4:1）
const BANNER_ASPECT = 4;
const MIN_SCALE = 1;
const MAX_SCALE = 3;

export default function BannerImageEditor({ currentBanner, children }: BannerImageEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentBanner || null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    // クロップ用 state
    const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number; startOffsetX: number; startOffsetY: number }>({ x: 0, y: 0, startOffsetX: 0, startOffsetY: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
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
    };

    // プレビュー領域のサイズ計算
    const getContainerWidth = () => containerRef.current?.clientWidth || 360;
    const getCropHeight = () => getContainerWidth() / BANNER_ASPECT;
    // クロップ枠の上下に表示するブリード領域
    const getBleed = () => {
        if (!file || !imageSize) return 0;
        return Math.round(getCropHeight() * 0.75);
    };
    const getPreviewHeight = () => getCropHeight() + getBleed() * 2;

    // 画像の表示高さ（幅はコンテナ幅に合わせ、比率維持）
    const displayImageHeight = useCallback(() => {
        if (!imageSize) return 0;
        const cw = getContainerWidth();
        return (imageSize.h / imageSize.w) * cw;
    }, [imageSize]);

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
        } catch (error) {
            console.error(error);
            alert("Failed to update banner");
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
                    className="text-[var(--theme-primary)] font-medium text-sm hover:underline"
                >
                    Change Banner
                </button>
            )}

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 relative">
                        <button
                            onClick={() => { setIsOpen(false); setFile(null); }}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Profile Banner</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Upload New Banner</label>
                                <input
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
                                <p className="text-xs text-gray-400 mt-1">Recommended size: 1200x300px (approx 4:1 ratio)</p>
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
                                                alt="Preview"
                                                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                                                draggable={false}
                                                onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/600x150?text=Banner')}
                                            />
                                        )}

                                        {/* クロップ領域外オーバーレイ（上） */}
                                        {file && getBleed() > 0 && (
                                            <>
                                                <div
                                                    className="absolute top-0 left-0 right-0 bg-black/50 pointer-events-none z-10 flex items-center justify-center"
                                                    style={{ height: `${getBleed()}px` }}
                                                >
                                                    <span className="text-white/60 text-[10px] font-medium tracking-wide">拡大で表示される領域</span>
                                                </div>

                                                {/* クロップ領域外オーバーレイ（下） */}
                                                <div
                                                    className="absolute bottom-0 left-0 right-0 bg-black/50 pointer-events-none z-10 flex items-center justify-center"
                                                    style={{ height: `${getBleed()}px` }}
                                                >
                                                    <span className="text-white/60 text-[10px] font-medium tracking-wide">拡大で表示される領域</span>
                                                </div>

                                                {/* クロップ枠 */}
                                                <div
                                                    className="absolute left-0 right-0 pointer-events-none z-10"
                                                    style={{ top: `${getBleed()}px`, height: `${getCropHeight()}px` }}
                                                >
                                                    <div className="absolute inset-0 border-2 border-dashed border-white/70 rounded-sm" />
                                                    <span className="absolute top-1 left-2 text-white/80 text-[10px] font-bold drop-shadow bg-black/30 px-1.5 py-0.5 rounded">バナー表示領域</span>
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
                                                    ドラッグで位置を調整
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-full flex items-center justify-center text-gray-400" style={{ height: `${getCropHeight()}px` }}>
                                        No Image Selected
                                    </div>
                                )}
                            </div>

                            {/* ズームスライダー */}
                            {file && (
                                <div className="flex items-center gap-3 px-1">
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
                                    />
                                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                                    </svg>
                                    <span className="text-xs text-gray-500 w-10 text-right tabular-nums">{Math.round(scale * 100)}%</span>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2 justify-end">
                                <button
                                    onClick={() => { setIsOpen(false); setFile(null); }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading || !file}
                                    className="px-4 py-2 text-sm font-medium text-white bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Saving...' : 'Save Banner'}
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
