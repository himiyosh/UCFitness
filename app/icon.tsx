import { ImageResponse } from 'next/og';

// Image metadata — ブラウザタブ用32×32ファビコン
export const size = {
    width: 32,
    height: 32,
};
export const contentType = 'image/png';

// ファビコン生成 — ⚡ 稲妻ボルトデザイン（32×32に最適化）
export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                    borderRadius: '22%',
                    position: 'relative',
                }}
            >
                {/* ⚡ 稲妻ボルト — viewBoxでスケール */}
                <svg
                    viewBox="0 0 512 512"
                    width="32"
                    height="32"
                    style={{ position: 'absolute', top: 0, left: 0 }}
                >
                    <polygon
                        points="290,60 178,258 254,258 192,452 334,238 258,238"
                        fill="white"
                    />
                </svg>
            </div>
        ),
        {
            ...size,
        }
    );
}
