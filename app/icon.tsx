import { ImageResponse } from 'next/og';

// Image metadata — ブラウザタブ用32×32ファビコン
export const size = {
    width: 32,
    height: 32,
};
export const contentType = 'image/png';

// ファビコン生成 — Landing Pageアイコン再現（レインボーボーダー＋稲妻ストローク）
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
                    position: 'relative',
                }}
            >
                {/* レインボーボーダー背景 */}
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
                    {/* Indigo 内側背景 */}
                    <div
                        style={{
                            width: '26px',
                            height: '26px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#4F46E5',
                            borderRadius: '6px',
                        }}
                    >
                        {/* ⚡ 稲妻ボルト — ストロークスタイル */}
                        <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="white"
                            strokeWidth="2.5"
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
