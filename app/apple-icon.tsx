import { ImageResponse } from 'next/og';

// Apple Touch Icon — 180×180 PNG（iOS PWAインストール用）
export const size = {
    width: 180,
    height: 180,
};
export const contentType = 'image/png';

// Landing Pageアイコン再現（レインボーボーダー＋稲妻ストローク）
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
                }}
            >
                {/* レインボーボーダー背景 */}
                <div
                    style={{
                        width: '180px',
                        height: '180px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, #FFE66D 0%, #95E500 25%, #4ECDC4 50%, #4F46E5 75%, #FF85A2 100%)',
                        borderRadius: '40px',
                    }}
                >
                    {/* Indigo 内側背景 */}
                    <div
                        style={{
                            width: '150px',
                            height: '150px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#4F46E5',
                            borderRadius: '32px',
                        }}
                    >
                        {/* ⚡ 稲妻ボルト — ストロークスタイル */}
                        <svg
                            viewBox="0 0 24 24"
                            width="90"
                            height="90"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
