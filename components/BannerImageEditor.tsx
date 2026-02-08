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

export default function BannerImageEditor({ currentBanner, children }: BannerImageEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentBanner || null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    // クロップ用 state
    const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
    const [offsetY, setOffsetY] = useState(0); // 表示領域に対する画像の Y オフセット (px, ≤0)
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ y: number; startOffset: number }>({ y: 0, startOffset: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            const url = URL.createObjectURL(selectedFile);
            setPreviewUrl(url);

            // 画像サイズを取得してオフセットをリセット
            const img = new Image();
            img.onload = () => {
                setImageSize({ w: img.width, h: img.height });
                setOffsetY(0);
            };
            img.src = url;
        }
    };

    // プレビュー領域のサイズ計算
    const getContainerWidth = () => containerRef.current?.clientWidth || 360;
    const containerHeight = () => getContainerWidth() / BANNER_ASPECT;

    // 画像の表示サイズ（幅をコンテナに合わせ、高さは比率維持）
    const displayImageHeight = useCallback(() => {
        if (!imageSize) return 0;
        const cw = getContainerWidth();
        return (imageSize.h / imageSize.w) * cw;
    }, [imageSize]);

    // Y オフセットの許容範囲
    const minOffsetY = useCallback(() => {
        const dh = displayImageHeight();
        const ch = containerHeight();
        return Math.min(0, ch - dh); // 画像が短い場合は 0
    }, [displayImageHeight, containerHeight]);

    // ドラッグ開始
    const handlePointerDown = (e: React.PointerEvent) => {
        if (!file) return;
        setIsDragging(true);
        dragStartRef.current = { y: e.clientY, startOffset: offsetY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    // ドラッグ中
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dy = e.clientY - dragStartRef.current.y;
        const newOffset = dragStartRef.current.startOffset + dy;
        setOffsetY(Math.max(minOffsetY(), Math.min(0, newOffset)));
    };

    // ドラッグ終了
    const handlePointerUp = () => {
        setIsDragging(false);
    };

    // クロップしてから保存
    const handleSave = async () => {
        if (!file || !imageSize) return;
        setIsLoading(true);
        try {
            const croppedFile = await cropBanner(file, imageSize, offsetY, getContainerWidth(), containerHeight());
            // 圧縮
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
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
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
                            <div className="rounded-lg overflow-hidden bg-gray-50">
                                {previewUrl ? (
                                    <div
                                        ref={containerRef}
                                        className={`relative w-full overflow-hidden select-none ${file ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                        style={{ height: `${containerHeight()}px` }}
                                        onPointerDown={handlePointerDown}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                        onPointerCancel={handlePointerUp}
                                    >
                                        <img
                                            src={previewUrl}
                                            alt="Preview"
                                            className="absolute left-0 pointer-events-none"
                                            style={{
                                                top: `${file ? offsetY : 0}px`,
                                                width: '100%',
                                                height: file && imageSize ? `${displayImageHeight()}px` : '100%',
                                                objectFit: !file ? 'cover' : undefined,
                                            }}
                                            draggable={false}
                                            onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/600x150?text=Banner')}
                                        />
                                        {/* ドラッグヒント */}
                                        {file && displayImageHeight() > containerHeight() && (
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent py-2 text-center pointer-events-none">
                                                <span className="text-white text-xs font-medium drop-shadow flex items-center justify-center gap-1">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                                                    ドラッグで位置を調整
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-full flex items-center justify-center text-gray-400" style={{ height: `${containerHeight()}px` }}>
                                        No Image Selected
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-4 justify-end">
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
 * クロップ処理 — 表示オフセットから実際の画像ピクセルを切り出す
 */
function cropBanner(
    file: File,
    imageSize: { w: number; h: number },
    offsetY: number,
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
                // 表示スケール: 画像幅 → コンテナ幅
                const scale = img.width / containerWidth;
                // 切り出し矩形（元画像ピクセル）
                const sx = 0;
                const sy = Math.round(-offsetY * scale);
                const sw = img.width;
                const sh = Math.round(containerHeight * scale);

                // キャンバスに描画
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
