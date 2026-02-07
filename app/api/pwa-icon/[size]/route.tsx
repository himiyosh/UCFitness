import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// PWA用PNGアイコン動的生成 — /api/pwa-icon/192 or /api/pwa-icon/512
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ size: string }> }
) {
    const { size: sizeParam } = await params;
    const size = parseInt(sizeParam, 10);

    if (size !== 192 && size !== 512) {
        return new Response('Invalid size. Use 192 or 512.', { status: 400 });
    }

    // スケール比率
    const border = Math.round(size * 0.08);    // ボーダー幅
    const inner = size - border * 2;            // 内側サイズ
    const outerRadius = Math.round(size * 0.2); // 外側角丸
    const innerRadius = Math.round(inner * 0.18); // 内側角丸
    const boltSize = Math.round(size * 0.5);    // ボルトサイズ

    return new ImageResponse(
        (
            <div
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {/* レインボーボーダー背景 */}
                <div
                    style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, #FFE66D 0%, #95E500 25%, #4ECDC4 50%, #4F46E5 75%, #FF85A2 100%)',
                        borderRadius: `${outerRadius}px`,
                        transform: 'rotate(12deg)',
                    }}
                >
                    {/* Indigo 内側背景 */}
                    <div
                        style={{
                            width: `${inner}px`,
                            height: `${inner}px`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#4F46E5',
                            borderRadius: `${innerRadius}px`,
                        }}
                    >
                        {/* ⚡ 稲妻ボルト — ストロークスタイル */}
                        <svg
                            viewBox="0 0 24 24"
                            width={boltSize}
                            height={boltSize}
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
            width: size,
            height: size,
        }
    );
}
