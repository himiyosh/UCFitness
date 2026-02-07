import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
    width: 512,
    height: 512,
};
export const contentType = 'image/png';

// ファビコン生成 — ⚡ 稲妻ボルトデザイン
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
                {/* 背景のアクセント円 */}
                <div
                    style={{
                        position: 'absolute',
                        width: '360px',
                        height: '360px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.06)',
                        display: 'flex',
                        top: '68px',
                        left: '76px',
                    }}
                />
                {/* ⚡ 稲妻ボルト */}
                <svg
                    viewBox="0 0 512 512"
                    width="512"
                    height="512"
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
