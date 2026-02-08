import { ImageResponse } from 'next/og';

// Image metadata — ブラウザタブ用32×32ファビコン
export const size = {
    width: 32,
    height: 32,
};
export const contentType = 'image/png';

// ファビコン生成 — レインボーボーダー＋3色グラデ＋ガラス＋塗りつぶし稲妻
export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #FFE66D 0%, #95E500 25%, #4ECDC4 50%, #4F46E5 75%, #FF85A2 100%)',
                    borderRadius: '8px',
                }}
            >
                {/* 内側: グラデーション背景 + ガラス + 稲妻 */}
                <div
                    style={{
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #7C3AED 100%)',
                        borderRadius: '6px',
                        position: 'relative',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '26px',
                            height: '13px',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)',
                            borderRadius: '6px 6px 0 0',
                        }}
                    />
                    <svg viewBox="0 0 24 24" width="14" height="14">
                        <path
                            d="M13.5 2.5L7 13h4.5L9 21.5l8.5-11h-4.5z"
                            fill="white"
                            stroke="white"
                            strokeWidth="0.8"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
