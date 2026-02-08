import { ImageResponse } from 'next/og';

// Apple Touch Icon — 180×180 PNG（iOS PWAインストール用）
export const size = {
    width: 180,
    height: 180,
};
export const contentType = 'image/png';

// レインボーボーダー＋3色グラデ＋ガラス＋塗りつぶし稲妻
export default function AppleIcon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '180px',
                    height: '180px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #FFE66D 0%, #95E500 25%, #4ECDC4 50%, #EC4899 75%, #FF85A2 100%)',
                    borderRadius: '40px',
                }}
            >
                {/* 内側: グラデーション背景 + ガラス + 稲妻 */}
                <div
                    style={{
                        width: '116px',
                        height: '116px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #7C3AED 100%)',
                        borderRadius: '24px',
                        position: 'relative',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '116px',
                            height: '58px',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)',
                            borderRadius: '24px 24px 0 0',
                        }}
                    />
                    <svg viewBox="0 0 24 24" width="68" height="68">
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
